from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, MetaData, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def identifier() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    metadata = MetaData(schema="syntho")


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    url: Mapped[str] = mapped_column(Text)
    goal: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="queued")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    summary_status: Mapped[str] = mapped_column(String(24), default="pending")
    summary_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary_attempts: Mapped[int] = mapped_column(Integer, default=0)
    __table_args__ = (Index("ix_campaigns_created_at", "created_at"),)


class Profile(Base):
    __tablename__ = "profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("syntho.campaigns.id"))
    data: Mapped[dict] = mapped_column(JSON)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=identifier)
    campaign_id: Mapped[str] = mapped_column(ForeignKey("syntho.campaigns.id"), index=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("syntho.profiles.id"))
    ordinal: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    enqueued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    action_logs: Mapped[list] = mapped_column(JSON, default=list)
    ai_report: Mapped[dict | None] = mapped_column(JSON)
    artifacts: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[str | None] = mapped_column(String(24))
