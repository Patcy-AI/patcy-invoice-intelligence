from pydantic import BaseModel
from openai import OpenAI

from app.config import settings
from app.services.document_ai_service import ExtractedInvoice

GL_ACCOUNTS = [
    "6000 Office Supplies", "6100 IT & Software", "6200 Facilities & Cleaning",
    "6300 Utilities", "6400 Professional Services", "6500 Travel & Fuel", "6900 Other",
]


class ReviewResult(BaseModel):
    summary: str
    recommended_action: str
    gl_account: str
    reasoning: str


def _client() -> OpenAI:
    return OpenAI(api_key=settings.gemini_api_key, base_url=settings.gemini_base_url)


def review_invoice(inv: ExtractedInvoice, issues: list[str], anomalies: list[str] | None = None) -> ReviewResult:
    client = _client()
    anomalies = anomalies or []
    system = (
        "You are a finance assistant reviewing supplier invoices for Patcy "
        "Deterministic checks have already run. Treat their issue list AND any anomaly flags as "
        "AUTHORITATIVE: if either is non-empty you must NOT recommend 'approve'. "
        f"Choose exactly one GL account from: {GL_ACCOUNTS}. "
        'Respond ONLY with JSON: {"summary": string, "recommended_action": '
        '"approve" | "needs_review" | "reject", "gl_account": string, "reasoning": string}.'
    )
    user = (
        f"Extracted invoice:\n{inv.model_dump_json(indent=2)}\n\n"
        f"Deterministic issues: {issues}\n"
        f"Anomaly flags: {anomalies}\n\n"
        "Give a short review, pick the action, assign one GL account, and explain briefly."
    )
    resp = client.chat.completions.create(
        model=settings.gemini_model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        temperature=0,
    )
    return ReviewResult.model_validate_json(resp.choices[0].message.content)
