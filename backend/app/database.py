from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app.config import settings

_url = settings.database_url
_connect_args = {"check_same_thread": False} if _url.startswith("sqlite") else {}
engine = create_engine(_url, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


class InvoiceRecord(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(primary_key=True)
    invoice_number: Mapped[str | None] = mapped_column(String, index=True)
    vendor_name: Mapped[str | None] = mapped_column(String)
    invoice_total: Mapped[str | None] = mapped_column(String)
    invoice_json: Mapped[str] = mapped_column(Text)
    issues_json: Mapped[str] = mapped_column(Text)
    review_json: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="pending")
    approved_by: Mapped[str | None] = mapped_column(String, default=None)
    released_by: Mapped[str | None] = mapped_column(String, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


def init_db() -> None:
    Base.metadata.create_all(engine)
    # add new columns if an older table already exists (idempotent)
    for col in ("approved_by", "released_by"):
        try:
            with engine.begin() as conn:
                conn.exec_driver_sql(f"ALTER TABLE invoices ADD COLUMN {col} VARCHAR")
        except Exception:
            pass
