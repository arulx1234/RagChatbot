from services.llm_service import generate_answer


result = generate_answer(
    "Explain what an array is in one sentence."
)

print("\nProvider:")
print(result["provider"])

print("\nAnswer:")
print(result["answer"])