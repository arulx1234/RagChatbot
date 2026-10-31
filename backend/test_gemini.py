import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai


# Load backend/.env
env_file = Path(__file__).resolve().parent / ".env"
load_dotenv(env_file, override=True)

api_key = os.getenv("GEMINI_API_KEY")

print("Gemini key loaded:", bool(api_key))
print("Gemini key length:", len(api_key) if api_key else 0)

client = genai.Client(api_key=api_key)

response = client.models.generate_content(
    model="gemini-3.8-flash",
    contents="Say hello in one short sentence."
)

print("\nGemini response:")
print(response.text)