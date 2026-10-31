from pathlib import Path
from pypdf import PdfReader
from docx import Document


def load_pdf(path: Path) -> str:
    reader = PdfReader(str(path))

    pages = []

    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)

    return "\n".join(pages)


def load_txt(path: Path) -> str:
    return path.read_text(
        encoding="utf-8",
        errors="ignore"
    )


def load_docx(path: Path) -> str:
    document = Document(str(path))

    paragraphs = []

    for paragraph in document.paragraphs:
        if paragraph.text.strip():
            paragraphs.append(paragraph.text)

    return "\n".join(paragraphs)


def load_document(path: Path) -> str:
    extension = path.suffix.lower()

    if extension == ".pdf":
        return load_pdf(path)

    if extension == ".txt":
        return load_txt(path)

    if extension == ".docx":
        return load_docx(path)

    raise ValueError(
        f"Unsupported file type: {extension}"
    )