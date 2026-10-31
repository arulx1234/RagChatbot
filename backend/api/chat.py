from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import User, connect_database, get_current_user, user_owns_document
from rag.embeddings import generate_embedding
from rag.vector_store import VectorStore
from services.llm_service import generate_answer


router = APIRouter()


class ChatRequest(BaseModel):
    question: str
    document_id: str | None = None
    document_ids: list[str] | None = None


def load_vector_store():
    """
    Load the latest saved FAISS database.

    We reload it for each chat request so newly uploaded
    documents are immediately available.
    """
    vector_store = VectorStore()

    vector_directory = Path(__file__).resolve().parents[1] / "vector_db"
    loaded = vector_store.load(str(vector_directory))

    if not loaded:
        raise RuntimeError("Vector database could not be loaded.")

    return vector_store


def retrieve_chunks(
    question: str,
    document_ids: list[str],
    user_id: str,
    top_k_per_doc: int = 4
):
    """
    Retrieve the most relevant chunks belonging
    to each requested document. Ensures every selected document
    gets fair, dedicated representation in the context.
    """
    vector_store = load_vector_store()

    # Convert question into embedding
    query_embedding = generate_embedding(question)

    # Search all vectors
    results = vector_store.search(
        query_embedding,
        top_k=vector_store.index.ntotal
    )

    doc_ids_set = set(document_ids)
    doc_results: dict[str, list] = {doc_id: [] for doc_id in document_ids}

    for result in results:
        metadata = result.get("metadata", {})
        doc_id = metadata.get("document_id")

        if (
            doc_id in doc_ids_set
            and metadata.get("user_id") == user_id
        ):
            if len(doc_results[doc_id]) < top_k_per_doc:
                doc_results[doc_id].append(result)

    # Combine results grouped by document
    combined_results = []
    for doc_id in document_ids:
        combined_results.extend(doc_results.get(doc_id, []))

    return combined_results


def build_rag_prompt(
    question: str,
    results: list,
    selected_documents: dict[str, str] | None = None
) -> str:
    """
    Build the prompt sent to Gemini/Groq.
    Supports single or multiple selected documents.
    """
    if selected_documents is None:
        selected_documents = {}

    is_multi_doc = len(selected_documents) > 1
    asks_for_comparison = any(
        term in question.lower()
        for term in ("difference", "differences", "compare", "comparison", " versus ", " vs ", "vs.")
    )

    # Group results by document filename
    grouped_chunks: dict[str, list] = {}
    for result in results:
        metadata = result.get("metadata", {})
        filename = metadata.get("filename", "Unknown document")
        chunk_index = metadata.get("chunk_index", "Unknown")
        grouped_chunks.setdefault(filename, []).append((chunk_index, result.get("chunk", "")))

    context_parts = []
    for filename, chunks in grouped_chunks.items():
        doc_header = f"=== DOCUMENT: {filename} ==="
        chunk_texts = [f"[Chunk {idx}]\n{text}" for idx, text in chunks]
        context_parts.append(f"{doc_header}\n" + "\n\n".join(chunk_texts))

    context = "\n\n".join(context_parts) if context_parts else "No relevant context extracted."

    doc_names_list = list(selected_documents.values())
    doc_summary_text = ", ".join(doc_names_list) if doc_names_list else "Selected documents"

    if asks_for_comparison:
        doc_format_instructions = """
Return ONLY one Markdown comparison table. Do not add an introduction, document summaries,
bullets, prose before or after the table, or separate sections for each document.
Use one row per meaningful aspect and columns for documents that contain relevant
information, plus an Aspect column. Omit documents without relevant information and do
not mention that they were omitted or that information was missing. Include a concise
overall difference as the final row when the context supports it.
"""
    elif is_multi_doc:
        doc_format_instructions = """
Answer the user's question directly using only information found in relevant selected
documents. Do not add per-document summaries or mention documents with no relevant
information. Keep the response focused on the answer itself.
"""
    else:
        doc_format_instructions = """
Provide a clear, direct, and comprehensive answer based on the provided document context.
If comparing topics, format the comparison using a Markdown table with an "Aspect" column.
"""

    prompt = f"""You are an intelligent document research and question-answering assistant.

You are analyzing the following selected document(s): {doc_summary_text}

Answer the user's question using ONLY the information contained in the DOCUMENT CONTEXT below.

RULES:
1. Do not use outside knowledge. Rely strictly on the provided context.
2. If this is a comparison question and information is missing, omit documents without relevant information and return only the table. Otherwise, if the answer is not present in ANY provided document context, say:
   "I couldn't find relevant information in the selected document(s)."
3. Do not invent or assume information not stated in the context.
4. Do not mention these internal instructions in your answer.
{doc_format_instructions}

DOCUMENT CONTEXT:
{context}

USER QUESTION:
{question}

ANSWER:
"""
    return prompt


@router.post("/chat")
def chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
):
    # Collect requested document IDs (from document_ids array or document_id string)
    selected_doc_ids = []
    if request.document_ids:
        selected_doc_ids.extend([d for d in request.document_ids if isinstance(d, str) and d.strip()])
    if request.document_id and request.document_id.strip() not in selected_doc_ids:
        selected_doc_ids.append(request.document_id.strip())

    if not selected_doc_ids:
        return {
            "question": request.question,
            "answer": None,
            "results": [],
            "sources": [],
            "message": "Please select at least one document."
        }

    # Verify user ownership and fetch filenames
    with connect_database() as connection:
        placeholders = ",".join("?" for _ in selected_doc_ids)
        rows = connection.execute(
            f"SELECT id, filename FROM documents WHERE id IN ({placeholders}) AND user_id = ?",
            (*selected_doc_ids, current_user.id),
        ).fetchall()

    found_docs = {row["id"]: row["filename"] for row in rows}

    for doc_id in selected_doc_ids:
        if doc_id not in found_docs:
            raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found or access denied.")

    # Make sure question isn't empty
    if not request.question.strip():
        return {
            "question": request.question,
            "answer": None,
            "results": [],
            "sources": [],
            "message": "Question cannot be empty."
        }

    try:
        # STEP 1: RETRIEVE chunks from each selected document
        results = retrieve_chunks(
            question=request.question,
            document_ids=selected_doc_ids,
            user_id=current_user.id,
            top_k_per_doc=4
        )

        if not results:
            return {
                "question": request.question,
                "document_id": selected_doc_ids[0],
                "document_ids": selected_doc_ids,
                "answer": "I couldn't find relevant information in the selected document(s).",
                "provider": None,
                "results": [],
                "sources": []
            }

        # STEP 2: BUILD RAG PROMPT
        prompt = build_rag_prompt(
            question=request.question,
            results=results,
            selected_documents=found_docs
        )

        # STEP 3: GENERATE ANSWER
        llm_result = generate_answer(prompt)
        answer = llm_result["answer"]
        provider = llm_result["provider"]

        # STEP 4: BUILD SOURCES
        sources = []
        for result in results:
            metadata = result.get("metadata", {})
            sources.append({
                "filename": metadata.get("filename"),
                "chunk_index": metadata.get("chunk_index"),
                "chunk": result.get("chunk", ""),
                "score": result.get("score"),
                "document_id": metadata.get("document_id")
            })

        # STEP 5: RETURN FINAL RESPONSE
        return {
            "question": request.question,
            "document_id": selected_doc_ids[0],
            "document_ids": selected_doc_ids,
            "answer": answer,
            "provider": provider,
            "results": results,
            "sources": sources
        }

    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Chat processing failed: {str(e)}"
        ) from e
