from io import BytesIO

import fitz


def extract_text_from_pdf(file_bytes: bytes) -> str:
    document = fitz.open(stream=BytesIO(file_bytes), filetype="pdf")
    pages_text = []
    for page in document:
        pages_text.append(page.get_text("text"))
    document.close()
    return "\n".join(pages_text).strip()
