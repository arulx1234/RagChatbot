import os
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from groq import Groq


# --------------------------------------------------
# Load environment variables
# --------------------------------------------------

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(ENV_FILE, override=True)


# --------------------------------------------------
# Configuration
# --------------------------------------------------

gemini_api_key = os.getenv("GEMINI_API_KEY")
groq_api_key = os.getenv("GROQ_API_KEY")

def _resolve_model_name(env_name: str, default_model: str) -> str:
    configured = os.getenv(env_name)
    if configured:
        configured = configured.strip()
    return configured or default_model


gemini_model = _resolve_model_name(
    "GEMINI_MODEL",
    "gemini-3.8-flash",
)

groq_model = _resolve_model_name(
    "GROQ_MODEL",
    "openai/gpt-oss-120b",
)


# --------------------------------------------------
# Clients
# --------------------------------------------------

gemini_client = (
    genai.Client(api_key=gemini_api_key)
    if gemini_api_key
    else None
)

groq_client = (
    Groq(api_key=groq_api_key)
    if groq_api_key
    else None
)


# --------------------------------------------------
# Gemini - PRIMARY
# --------------------------------------------------

def generate_with_gemini(prompt: str) -> str:

    if gemini_client is None:
        raise RuntimeError(
            "GEMINI_API_KEY is not configured."
        )

    for attempt in range(2):

        try:

            print(
                f"Trying Gemini: {gemini_model} "
                f"(attempt {attempt + 1}/2)"
            )

            response = gemini_client.models.generate_content(
                model=gemini_model,
                contents=prompt
            )

            if not response.text:
                raise RuntimeError(
                    "Gemini returned an empty response."
                )

            print("Gemini succeeded.")

            return response.text

        except Exception as error:

            error_text = str(error)

            print(
                f"Gemini failed: "
                f"{type(error).__name__}: "
                f"{error_text}"
            )

            # --------------------------------------
            # 429 = quota/rate limit
            # Do NOT retry. Go to Groq.
            # --------------------------------------

            if "429" in error_text:

                print(
                    "Gemini quota/rate limit reached."
                )

                raise

            # --------------------------------------
            # 503 = temporary problem
            # Retry once.
            # --------------------------------------

            if "503" in error_text and attempt == 0:

                print(
                    "Temporary Gemini error. "
                    "Retrying in 2 seconds..."
                )

                time.sleep(2)

                continue

            raise


# --------------------------------------------------
# Groq - FALLBACK
# --------------------------------------------------

def generate_with_groq(prompt: str) -> str:

    if groq_client is None:
        raise RuntimeError(
            "GROQ_API_KEY is not configured."
        )

    print(
        f"Trying Groq fallback: {groq_model}"
    )

    response = groq_client.chat.completions.create(

        model=groq_model,

        messages=[
            {
                "role": "system",
                "content": (
                    "You are a document question-answering "
                    "assistant. Answer the user's question "
                    "using only the provided document context."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],

        temperature=0.2
    )

    answer = response.choices[0].message.content

    if not answer:
        raise RuntimeError(
            "Groq returned an empty response."
        )

    print("Groq succeeded.")

    return answer


# --------------------------------------------------
# Main function
# --------------------------------------------------

def generate_answer(prompt: str):

    provider_errors = []


    # ==================================================
    # GEMINI PRIMARY
    # ==================================================

    if gemini_client is not None:

        try:

            answer = generate_with_gemini(prompt)

            return {
                "answer": answer,
                "provider": "gemini"
            }

        except Exception as error:

            print(
                "Gemini failed completely."
            )

            provider_errors.append(
                f"Gemini failed "
                f"({type(error).__name__})."
            )

    else:

        provider_errors.append(
            "Gemini is not configured."
        )


    # ==================================================
    # GROQ FALLBACK
    # ==================================================

    if groq_client is not None:

        try:

            answer = generate_with_groq(prompt)

            return {
                "answer": answer,
                "provider": "groq"
            }

        except Exception as error:

            print(
                "Groq fallback failed:"
            )

            print(
                f"Error type: {type(error).__name__}"
            )

            print(
                f"Error details: {error}"
            )

            provider_errors.append(
               f"Groq failed "
               f"({type(error).__name__}): {error}"
            )

    else:

        provider_errors.append(
            "Groq is not configured."
        )


    # ==================================================
    # BOTH FAILED
    # ==================================================

    raise RuntimeError(
        " | ".join(provider_errors)
    )