import re
from decimal import Decimal, InvalidOperation

from stdnum.eu import vat as eu_vat

from app.services.document_ai_service import ExtractedInvoice

COMPANY_VAT = "NL00449544B01"  # Patcy Financial Services B.V. — our own VAT


def _money(value) -> Decimal | None:
    """Parse a money string from Document AI (e.g. '€1,500.00', '1.234,56') into a Decimal."""
    if value is None:
        return None
    text = re.sub(r"[^0-9,.\-]", "", str(value))
    if not text:
        return None
    if "," in text and "." in text:
        text = text.replace(",", "")            # comma = thousands separator
    elif "," in text:
        text = text.replace(",", ".")           # comma = decimal separator
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _totals_ok(inv: ExtractedInvoice) -> bool:
    """True if subtotal + tax == total (within a cent), or if we can't compare all three."""
    st, tx, tot = _money(inv.subtotal), _money(inv.total_tax), _money(inv.invoice_total)
    if st is not None and tx is not None and tot is not None:
        return abs((st + tx) - tot) <= Decimal("0.02")
    return True


def _validate_invoice(inv: ExtractedInvoice) -> list[str]:
    issues: list[str] = []
    if not inv.vendor_vat_id:
        issues.append("vendor_vat_id_required")
    elif not eu_vat.is_valid(inv.vendor_vat_id):
        issues.append("vendor_vat_id_invalid")
    if inv.customer_vat_id and inv.customer_vat_id.replace(" ", "").upper() != COMPANY_VAT:
        issues.append("customer_vat_id_mismatch")
    if not inv.purchase_order:
        issues.append("purchase_order_missing")
    if not _totals_ok(inv):
        issues.append("invoice_total_mismatch")
    return issues


def _validate_receipt(inv: ExtractedInvoice) -> list[str]:
    # Receipts are point-of-sale: no purchase order, no vendor VAT, no customer expected.
    issues: list[str] = []
    if not _totals_ok(inv):
        issues.append("invoice_total_mismatch")
    return issues


def validate_invoice(inv: ExtractedInvoice) -> list[str]:
    if inv.document_type == "receipt":
        return _validate_receipt(inv)
    return _validate_invoice(inv)
