from decimal import Decimal, InvalidOperation

from app.database import InvoiceRecord
from app.services.document_ai_service import ExtractedInvoice

# How many past invoices from a vendor before we trust an average
MIN_HISTORY = 3
# Flag anything this many times bigger than the vendor's average
SPIKE_MULTIPLE = Decimal("2.5")


def _to_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def check_anomalies(db, invoice: ExtractedInvoice) -> list[str]:
    """Compare this invoice against the same vendor's history. Returns human-readable flags."""
    anomalies: list[str] = []
    total = _to_decimal(invoice.invoice_total)
    if not invoice.vendor_name or total is None:
        return anomalies

    rows = (
        db.query(InvoiceRecord)
        .filter(InvoiceRecord.vendor_name == invoice.vendor_name)
        .all()
    )
    past = [d for r in rows if (d := _to_decimal(r.invoice_total)) is not None]
    if len(past) < MIN_HISTORY:
        return anomalies

    avg = sum(past) / len(past)
    if avg > 0 and total > avg * SPIKE_MULTIPLE:
        ratio = total / avg
        anomalies.append(
            f"Amount {total} is {ratio:.1f}x higher than {invoice.vendor_name}'s "
            f"average of {avg:.2f} across {len(past)} prior invoices."
        )
    return anomalies
