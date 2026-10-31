import json
from pathlib import Path

import faiss
import numpy as np


class VectorStore:

    def __init__(self, dimension: int = 384):

        self.dimension = dimension

        self.index = faiss.IndexFlatIP(dimension)

        self.chunks = []

        self.metadata = []

    def add(
        self,
        embeddings: list[list[float]],
        chunks: list[str],
        metadata: list[dict] | None = None
    ):

        if len(embeddings) != len(chunks):
            raise ValueError(
                "Number of embeddings must match number of chunks."
            )

        if metadata is not None and len(metadata) != len(chunks):
            raise ValueError(
                "Number of metadata items must match number of chunks."
            )

        vectors = np.array(
            embeddings,
            dtype="float32"
        )

        # Normalize vectors for cosine similarity
        faiss.normalize_L2(vectors)

        # Add vectors to FAISS
        self.index.add(vectors)

        # Store chunks
        self.chunks.extend(chunks)

        # Store metadata
        if metadata is not None:
            self.metadata.extend(metadata)

        else:
            self.metadata.extend(
                [{} for _ in chunks]
            )

    def search(
        self,
        query_embedding: list[float],
        top_k: int = 5
    ):

        if self.index.ntotal == 0:
            return []

        query_vector = np.array(
            [query_embedding],
            dtype="float32"
        )

        # Normalize query vector
        faiss.normalize_L2(query_vector)

        # Don't request more results than available
        top_k = min(
            top_k,
            self.index.ntotal
        )

        scores, indices = self.index.search(
            query_vector,
            top_k
        )

        results = []

        for score, index in zip(
            scores[0],
            indices[0]
        ):

            if index == -1:
                continue

            result = {
                "chunk": self.chunks[index],
                "score": float(score),
                "index": int(index),
            }

            # Add metadata if available
            if index < len(self.metadata):
                result["metadata"] = self.metadata[index]

            results.append(result)

        return results

    def save(
        self,
        directory: str = "vector_db"
    ):

        path = Path(directory)

        path.mkdir(
            parents=True,
            exist_ok=True
        )

        # Save FAISS index
        faiss.write_index(
            self.index,
            str(path / "index.faiss")
        )

        # Save chunks + metadata
        data = {
            "dimension": self.dimension,
            "chunks": self.chunks,
            "metadata": self.metadata
        }

        with open(
            path / "metadata.json",
            "w",
            encoding="utf-8"
        ) as file:

            json.dump(
                data,
                file,
                ensure_ascii=False,
                indent=2
            )

    def load(
        self,
        directory: str = "vector_db"
    ):

        path = Path(directory)

        index_path = path / "index.faiss"
        metadata_path = path / "metadata.json"

        if not index_path.exists():
            return False

        if not metadata_path.exists():
            return False

        # Load FAISS index
        self.index = faiss.read_index(
            str(index_path)
        )

        # Load metadata
        with open(
            metadata_path,
            "r",
            encoding="utf-8"
        ) as file:

            data = json.load(file)

        self.dimension = data["dimension"]

        self.chunks = data["chunks"]

        # Support old metadata files
        self.metadata = data.get(
            "metadata",
            [{} for _ in self.chunks]
        )

        return True