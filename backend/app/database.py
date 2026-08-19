from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

# A single local file, invoices.db, sitting in the backend folder = our memory
engine = create_engine("sqlite:///invoices.db", echo=False)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


class InvoiceRecord(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_number: Mapped[str | None] = mapped_column(String, index=True)
    vendor_name: Mapped[str | None] = mapped_column(String)
    invoice_total: Mapped[str | None] = mapped_column(String)
    invoice_json: Mapped[str] = mapped_column(Text)   # full extracted invoice
    issues_json: Mapped[str] = mapped_column(Text)    # list of issue codes
    review_json: Mapped[str] = mapped_column(Text)    # Gemini review
    status: Mapped[str] = mapped_column(String, default="pending")  # pending/approved/rejected
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


def init_db() -> None:
    Base.metadata.create_all(engine)
