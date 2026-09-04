"""Service-boundary contracts for Sundara Command.

These models intentionally contain identifiers required to trace a clinical
recommendation from triage through a human decision and its audit record.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

SCHEMA_VERSION = "1.0"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AssessmentReference(BaseModel):
    """Immutable reference to the triage assessment being acted upon."""

    assessment_id: str = Field(min_length=1, max_length=128)
    patient_id: str = Field(min_length=1, max_length=64)
    model_version: str = Field(min_length=1, max_length=128)
    correlation_id: str = Field(default_factory=lambda: str(uuid4()))
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION


class RecommendationRecord(AssessmentReference):
    """The AI recommendation governance must preserve before human action."""

    recommendation: dict[str, Any] = Field(default_factory=dict)
    recorded_at: datetime = Field(default_factory=utc_now)


class AcceptDecision(AssessmentReference):
    """A clinician's explicit acceptance of a recorded recommendation."""

    actor: str = Field(min_length=1, max_length=128)
    decided_at: datetime = Field(default_factory=utc_now)


class OverrideDecision(AssessmentReference):
    """A clinician decision that differs from the AI recommendation."""

    actor: str = Field(min_length=1, max_length=128)
    reason_code: Literal[
        "NEW_CLINICAL_INFORMATION",
        "BEDSIDE_ASSESSMENT_DIFFERS",
        "RESOURCE_CONSTRAINT",
        "DETERIORATION_OBSERVED",
        "OTHER",
    ]
    reason_text: str = Field(default="", max_length=2_000)
    new_rank: int | None = Field(default=None, ge=1)
    reassessment_minutes: int = Field(default=10, ge=1, le=240)
    decided_at: datetime = Field(default_factory=utc_now)


class AuditEntry(BaseModel):
    """A read model of one immutable, hash-chained governance event."""

    sequence: int
    event_id: str
    event_type: Literal["AI_RECOMMENDATION", "ACCEPT", "OVERRIDE"]
    occurred_at: datetime
    initiated_by: Literal["AI", "HUMAN"]
    actor: str
    assessment_id: str
    patient_id: str
    model_version: str
    correlation_id: str
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION
    payload: dict[str, Any]
    previous_hash: str
    hash: str
