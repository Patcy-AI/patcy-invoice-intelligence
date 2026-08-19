from decimal import Decimal, InvalidOperation

from stdnum.eu import vat as eu_vat

from app.services.document_ai_service import ExtractedInvoice

COMPANY_VAT = "NL00449544B01"  # Northstar Facilities B.V. — our own VAT


def _totals_ok(inv: ExtractedInvoice) -> bool:
    """True if subtotal + tax == total, or if we don't have all three to compare."""
    try:
        if inv.subtotal is not None and inv.total_tax is not None and inv.invoice_total is not None:
            return Decimal(inv.subtotal) + Decimal(inv.total_tax) == Decimal(inv.invoice_total)
    except InvalidOperation:
        return False
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
