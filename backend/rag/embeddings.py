from sentence_transformers import SentenceTransformer


# Load embedding model
try:
    model = SentenceTransformer("all-MiniLM-L6-v2", local_files_only=True)
except Exception:
    model = SentenceTransformer("all-MiniLM-L6-v2")


def generate_embedding(text: str) -> list[float]:
    """
    Convert text into a numerical vector.
    """

    embedding = model.encode(text)

    return embedding.tolist()


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Convert multiple text chunks into numerical vectors.
    """

    embeddings = model.encode(texts)

    return embeddings.tolist()