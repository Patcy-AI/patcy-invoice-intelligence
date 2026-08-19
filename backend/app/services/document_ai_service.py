from pydantic import BaseModel
from google.cloud import documentai

from app.config import settings


class ExtractedInvoice(BaseModel):
    document_type: str = "invoice"
    invoice_number: str | None = None
    invoice_date: str | None = None
    due_date: str | None = None
    purchase_order: str | None = None
    currency: str | None = None
    vendor_name: str | None = None
    vendor_vat_id: str | None = None
    customer_name: str | None = None
    customer_vat_id: str | None = None
    subtotal: str | None = None
    total_tax: str | None = None
    invoice_total: str | None = None
    field_confidence: dict[str, float] = {}


FIELD_MAP = {
    "invoice_id": "invoice_number",
    "invoice_date": "invoice_date",
    "due_date": "due_date",
    "purchase_order": "purchase_order",
    "currency": "currency",
    "supplier_name": "vendor_name",
    "supplier_tax_id": "vendor_vat_id",
    "receiver_name": "customer_name",
    "receiver_tax_id": "customer_vat_id",
    "net_amount": "subtotal",
    "total_tax_amount": "total_tax",
    "total_amount": "invoice_total",
}


def _client() -> documentai.DocumentProcessorServiceClient:
    opts = {"api_endpoint": f"{settings.docai_location}-documentai.googleapis.com"}
    return documentai.DocumentProcessorServiceClient(client_options=opts)


def _classify(inv: ExtractedInvoice) -> str:
    if not inv.invoice_number and not inv.customer_name:
        return "receipt"
    return "invoice"


def extract_invoice_bytes(content: bytes, mime_type: str = "application/pdf") -> ExtractedInvoice:
    client = _client()
    name = client.processor_path(
        settings.gcp_project_id, settings.docai_location, settings.docai_processor_id
    )
    raw_document = documentai.RawDocument(content=content, mime_type=mime_type)
    request = documentai.ProcessRequest(name=name, raw_document=raw_document)
    result = client.process_document(request=request)

    data: dict[str, str] = {}
    conf: dict[str, float] = {}
    for entity in result.document.entities:
        field = FIELD_MAP.get(entity.type_)
        if field:
            data[field] = entity.mention_text
            conf[field] = round(float(entity.confidence), 3)

    inv = ExtractedInvoice(**data)
    inv.document_type = _classify(inv)
    inv.field_confidence = conf
    return inv


def extract_invoice(file_path: str) -> ExtractedInvoice:
    with open(file_path, "rb") as f:
        mime = "image/png" if file_path.lower().endswith(".png") else "application/pdf"
        return extract_invoice_bytes(f.read(), mime)


if __name__ == "__main__":
    print(extract_invoice("../samples/generated/01-en-happy-classic.pdf").model_dump_json(indent=2))
