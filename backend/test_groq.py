import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq


# Load backend/.env
ENV_FILE = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_FILE, override=True)


api_key = os.getenv("GROQ_API_KEY")

print("Groq key loaded:", bool(api_key))
print("Groq key length:", len(api_key) if api_key else 0)


if not api_key:
    raise RuntimeError("GROQ_API_KEY is missing from .env")


client = Groq(api_key=api_key)


response = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[
        {
            "role": "user",
            "content": "Say hello in one short sentence."
        }
    ],
    temperature=0.2
)


print("\nGroq response:")
print(response.choices[0].message.content)