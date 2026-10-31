import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field


DATABASE_PATH = Path(__file__).resolve().parents[1] / "users.sqlite3"
SESSION_COOKIE_NAME = "ansace_session"
SESSION_LIFETIME = timedelta(days=7)
PASSWORD_ITERATIONS = 600_000
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

router = APIRouter(prefix="/auth", tags=["authentication"])


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class SignupCredentials(Credentials):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=1024)


class User(BaseModel):
    id: str
    name: str
    email: str


@contextmanager
def connect_database() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    with connect_database() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                chunks INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        user_columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(users)").fetchall()
        }
        if "name" not in user_columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''"
            )


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not EMAIL_PATTERN.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid email address.",
        )
    return normalized


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return f"{salt.hex()}:{password_hash.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, password_hash_hex = stored_hash.split(":", maxsplit=1)
        salt = bytes.fromhex(salt_hex)
        expected_hash = bytes.fromhex(password_hash_hex)
    except ValueError:
        return False

    candidate_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return hmac.compare_digest(candidate_hash, expected_hash)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(user_id: str, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + SESSION_LIFETIME

    with connect_database() as connection:
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (token_digest(token), user_id, expires_at.isoformat()),
        )

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "").lower() == "true",
        samesite="lax",
        path="/",
    )


def get_current_user(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> User:
    if not session_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to continue.",
        )

    now = datetime.now(timezone.utc).isoformat()
    with connect_database() as connection:
        row = connection.execute(
            """
            SELECT users.id, users.name, users.email
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (token_digest(session_token), now),
        ).fetchone()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has expired. Please sign in again.",
        )

    return User(id=row["id"], name=row["name"], email=row["email"])


def user_owns_document(user_id: str, document_id: str) -> bool:
    with connect_database() as connection:
        row = connection.execute(
            "SELECT 1 FROM documents WHERE id = ? AND user_id = ?",
            (document_id, user_id),
        ).fetchone()
    return row is not None


initialize_database()


@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(credentials: SignupCredentials, response: Response) -> User:
    email = normalize_email(credentials.email)
    name = credentials.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter your name.",
        )
    user_id = secrets.token_urlsafe(18)
    created_at = datetime.now(timezone.utc).isoformat()

    try:
        with connect_database() as connection:
            connection.execute(
                """
                INSERT INTO users (id, name, email, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    name,
                    email,
                    hash_password(credentials.password),
                    created_at,
                ),
            )
    except sqlite3.IntegrityError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        ) from error

    create_session(user_id, response)
    return User(id=user_id, name=name, email=email)


@router.post("/login")
def login(credentials: Credentials, response: Response) -> User:
    email = normalize_email(credentials.email)

    with connect_database() as connection:
        row = connection.execute(
            "SELECT id, name, email, password_hash FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    if row is None or not verify_password(
        credentials.password,
        row["password_hash"] if row is not None else "",
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )

    create_session(row["id"], response)
    return User(id=row["id"], name=row["name"], email=row["email"])


@router.get("/me")
def get_session_user(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> Response:
    if session_token:
        with connect_database() as connection:
            connection.execute(
                "DELETE FROM sessions WHERE token_hash = ?",
                (token_digest(session_token),),
            )

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "").lower() == "true",
        samesite="lax",
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
