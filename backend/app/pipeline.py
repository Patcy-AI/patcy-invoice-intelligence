from pydantic import BaseModel

from app.services.document_ai_service import ExtractedInvoice, extract_invoice_bytes
from app.services.validation import validate_invoice
from app.services.review_service import ReviewResult, review_invoice


class ProcessResult(BaseModel):
    invoice: ExtractedInvoice
    issues: list[str]
    review: ReviewResult


def process_invoice(content: bytes, mime_type: str = "application/pdf") -> ProcessResult:
    invoice = extract_invoice_bytes(content, mime_type)
    issues = validate_invoice(invoice)
    review = review_invoice(invoice, issues)
    return ProcessResult(invoice=invoice, issues=issues, review=review)
