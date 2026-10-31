from pathlib import Path
from uuid import uuid4
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from api.auth import User, connect_database, get_current_user, router as auth_router
from rag.document_loader import load_document
from rag.chunker import chunk_text
from rag.embeddings import generate_embeddings
from rag.vector_store import VectorStore
from api.chat import router as chat_router


app = FastAPI(
    title="RAG Chatbot API",
    description="Backend API for document-based RAG chatbot",
    version="1.0.0",
)


# Allow React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(auth_router)


# Upload directory
UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

VECTOR_DB_DIR = str(Path(__file__).resolve().parent / "vector_db")

vector_store = VectorStore()
vector_store.load(VECTOR_DB_DIR)


# Supported file types
ALLOWED_EXTENSIONS = {
    ".pdf",
    ".txt",
    ".docx",
}


@app.get("/")
def root():
    return {
        "message": "RAG Chatbot API is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/documents")
def list_documents(current_user: User = Depends(get_current_user)):
    with connect_database() as connection:
        rows = connection.execute(
            """
            SELECT id, filename, file_type, chunks, created_at
            FROM documents
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (current_user.id,),
        ).fetchall()

    return [
        {
            "id": row["id"],
            "document_id": row["id"],
            "name": row["filename"],
            "filename": row["filename"],
            "file_type": row["file_type"],
            "chunks": row["chunks"],
            "created_at": row["created_at"],
            "status": "ready",
            "progress": 100,
        }
        for row in rows
    ]


@app.delete("/documents/{document_id}", status_code=204)
def remove_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
) -> Response:
    with connect_database() as connection:
        row = connection.execute(
            "SELECT file_path FROM documents WHERE id = ? AND user_id = ?",
            (document_id, current_user.id),
        ).fetchone()

        if row is None:
            raise HTTPException(status_code=404, detail="Document not found.")

        file_path = Path(row["file_path"])
        if file_path.exists():
            file_path.unlink()

        connection.execute(
            "DELETE FROM documents WHERE id = ? AND user_id = ?",
            (document_id, current_user.id),
        )
    return Response(status_code=204)


@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):

    # Get file extension
    file_extension = Path(file.filename).suffix.lower()

    # Validate file type
    if file_extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only PDF, TXT and DOCX files are allowed."
        )

    # Create unique document ID
    document_id = str(uuid4())

    # Create saved filename
    saved_filename = f"{document_id}{file_extension}"

    # Create full path
    file_path = UPLOAD_DIR / saved_filename

    try:

        # 1. Read uploaded file
        contents = await file.read()

        # 2. Save file
        with open(file_path, "wb") as buffer:
            buffer.write(contents)

        # 3. Extract text
        text = load_document(file_path)

        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="Could not extract any text from this document."
            )

        # 4. Split text into chunks
        chunks = chunk_text(text)

        if not chunks:
            raise HTTPException(
                status_code=400,
                detail="Could not create chunks from this document."
            )

        # 5. Generate embeddings
        embeddings = generate_embeddings(chunks)

        # 6. Create metadata
        metadata = []

        for index, chunk in enumerate(chunks):
            metadata.append({
                "document_id": document_id,
                "user_id": current_user.id,
                "filename": file.filename,
                "file_type": file_extension,
                "chunk_index": index
            })

        # 7. Add to FAISS
        vector_store.add(
            embeddings,
            chunks,
            metadata
        )

        # 8. Save vector database
        vector_store.save(VECTOR_DB_DIR)

        with connect_database() as connection:
            connection.execute(
                """
                INSERT INTO documents
                    (id, user_id, filename, file_type, file_path, chunks, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    document_id,
                    current_user.id,
                    file.filename,
                    file_extension,
                    str(file_path.resolve()),
                    len(chunks),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

        # 9. Return response
        return {
            "message": "Document processed and indexed successfully",
            "document_id": document_id,
            "filename": file.filename,
            "file_type": file_extension,
            "status": "indexed",
            "characters": len(text),
            "chunks": len(chunks),
            "embeddings": len(embeddings),
            "vector_count": vector_store.index.ntotal
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Document processing failed: {str(e)}"
        )