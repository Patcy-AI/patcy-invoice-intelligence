import json
from datetime import datetime

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.database import InvoiceRecord, SessionLocal, init_db
from app.pipeline import ProcessResult
from app.services.anomaly import check_anomalies
from app.services.document_ai_service import extract_invoice_bytes
from app.services.review_service import review_invoice
from app.services.validation import validate_invoice

app = FastAPI(title="Patcy Invoice Intelligence API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
init_db()


class ProcessResponse(ProcessResult):
    id: int
    status: str
    anomalies: list[str]


class SavedInvoice(BaseModel):
    id: int
    invoice_number: str | None
    vendor_name: str | None
    invoice_total: str | None
    status: str
    issues: list[str]
    created_at: datetime


class Decision(BaseModel):
    action: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/process", response_model=ProcessResponse)
async def process(file: UploadFile = File(...)) -> ProcessResponse:
    content = await file.read()
    mime_type = file.content_type or "application/pdf"

    invoice = extract_invoice_bytes(content, mime_type)
    issues = validate_invoice(invoice)

    with SessionLocal() as db:
        if invoice.invoice_number:
            already = (
                db.query(InvoiceRecord)
                .filter(InvoiceRecord.invoice_number == invoice.invoice_number)
                .first()
            )
            if already:
                issues = issues + ["duplicate_invoice"]

        anomalies = check_anomalies(db, invoice)  # history excludes the current one
        review = review_invoice(invoice, issues, anomalies)

        record = InvoiceRecord(
            invoice_number=invoice.invoice_number,
            vendor_name=invoice.vendor_name,
            invoice_total=invoice.invoice_total,
            invoice_json=invoice.model_dump_json(),
            issues_json=json.dumps(issues),
            review_json=review.model_dump_json(),
            status="pending",
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        return ProcessResponse(
            id=record.id, status=record.status, invoice=invoice,
            issues=issues, anomalies=anomalies, review=review,
        )


@app.get("/invoices", response_model=list[SavedInvoice])
def list_invoices() -> list[SavedInvoice]:
    with SessionLocal() as db:
        rows = db.query(InvoiceRecord).order_by(InvoiceRecord.created_at.desc()).all()
        return [
            SavedInvoice(
                id=r.id, invoice_number=r.invoice_number, vendor_name=r.vendor_name,
                invoice_total=r.invoice_total, status=r.status,
                issues=json.loads(r.issues_json), created_at=r.created_at,
            )
            for r in rows
        ]


@app.post("/invoices/{invoice_id}/decision")
def decide(invoice_id: int, decision: Decision) -> dict:
    with SessionLocal() as db:
        record = db.get(InvoiceRecord, invoice_id)
        if not record:
            raise HTTPException(status_code=404, detail="Invoice not found")
        record.status = decision.action
        db.commit()
        return {"id": invoice_id, "status": record.status}
