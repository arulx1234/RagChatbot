import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


env_file = Path(__file__).resolve().parent / ".env"
load_dotenv(env_file, override=True)

api_key = os.getenv("XAI_API_KEY")

print("Grok key loaded:", bool(api_key))
print("Grok key length:", len(api_key) if api_key else 0)
print("Grok starts xai-:", api_key.startswith("xai-") if api_key else False)

client = OpenAI(
    api_key=api_key,
    base_url="https://api.x.ai/v1"
)

response = client.responses.create(
    model="grok-4.7",
    input="Say hello in one short sentence."
)

print("\nGrok response:")
print(response.output_text)