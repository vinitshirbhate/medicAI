"""Service-boundary contracts for Sundara Command.

These models intentionally contain identifiers required to trace a clinical
recommendation from triage through a human decision and its audit record.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator

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


class BedCapacity(BaseModel):
    total: int = Field(ge=0)
    occupied: int = Field(ge=0)
    available: int = Field(ge=0)


class StaffAvailability(BaseModel):
    scheduled: int = Field(ge=0)
    available: int = Field(ge=0)


class HospitalResource(BaseModel):
    hospital_id: str = Field(min_length=1, max_length=128)
    icu: BedCapacity
    ed: BedCapacity
    doctors: StaffAvailability
    nurses: StaffAvailability


class NetworkEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    type: Literal["OUTBREAK", "MASS_CASUALTY", "TRANSIT_DISRUPTION", "OTHER"]
    severity: Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]
    details: dict[str, Any] = Field(default_factory=dict)
    occurred_at: datetime = Field(default_factory=utc_now)
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION


class ResourceState(BaseModel):
    network_icu_occupancy_pct: int = Field(ge=0, le=100)
    active_events: list[NetworkEvent]
    hospitals: list[HospitalResource]
    infeasibilities: list[dict[str, str]] = Field(default_factory=list)
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION


class ResourceRecommendationRequest(AssessmentReference):
    hospital_id: str = Field(min_length=1, max_length=128)
    deterioration_risk: float = Field(ge=0, le=1)
    time_sensitivity: Literal["HIGH", "MODERATE"]
    recommended_action: str = Field(default="", max_length=500)


class ResourceRecommendation(AssessmentReference):
    preferred: str
    constraint: str | None = None
    alternative: str | None = None
    network_option: str | None = None
    transport_feasible: bool | None = None
    generated_at: datetime = Field(default_factory=utc_now)


class VitalsObservation(BaseModel):
    """One immutable clinical-vital observation at a known point in time."""

    observation_id: str = Field(default_factory=lambda: str(uuid4()))
    patient_id: str = Field(min_length=1, max_length=64)
    encounter_id: str | None = Field(default=None, max_length=128)
    observed_at: datetime = Field(default_factory=utc_now)
    source: Literal["MONITOR", "MANUAL", "SIMULATED_EHR"]
    source_event_id: str | None = Field(default=None, max_length=128)
    heart_rate: float | None = Field(default=None, gt=0, le=300)
    systolic_bp: float | None = Field(default=None, gt=0, le=300)
    diastolic_bp: float | None = Field(default=None, gt=0, le=200)
    spo2: float | None = Field(default=None, ge=0, le=100)
    respiratory_rate: float | None = Field(default=None, gt=0, le=100)
    temperature_c: float | None = Field(default=None, ge=25, le=45)
    gcs: float | None = Field(default=None, ge=3, le=15)
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION

    @model_validator(mode="after")
    def includes_measurement(self) -> "VitalsObservation":
        metric_names = (
            "heart_rate", "systolic_bp", "diastolic_bp", "spo2",
            "respiratory_rate", "temperature_c", "gcs",
        )
        if not any(getattr(self, name) is not None for name in metric_names):
            raise ValueError("at least one vital measurement is required")
        return self


class LabObservation(BaseModel):
    """One immutable laboratory measurement used for a time-series trend."""

    observation_id: str = Field(default_factory=lambda: str(uuid4()))
    patient_id: str = Field(min_length=1, max_length=64)
    encounter_id: str | None = Field(default=None, max_length=128)
    observed_at: datetime = Field(default_factory=utc_now)
    test_code: str = Field(min_length=1, max_length=128)
    value: float
    unit: str = Field(min_length=1, max_length=64)
    source: Literal["LABORATORY_SYSTEM", "MANUAL", "SIMULATED_EHR"]
    source_event_id: str | None = Field(default=None, max_length=128)
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION


class TrendMetric(BaseModel):
    latest: float | None
    first: float | None
    minimum: float | None
    maximum: float | None
    change: float | None
    slope_per_hour: float | None
    observations: int


class TrendQuality(BaseModel):
    observation_count: int
    latest_age_seconds: float | None
    missing_latest_metrics: list[str]
    metrics_with_baseline: list[str]


class TrendFeatures(BaseModel):
    patient_id: str
    window_minutes: int
    calculated_at: datetime = Field(default_factory=utc_now)
    metrics: dict[str, TrendMetric]
    quality: TrendQuality
    schema_version: Literal[SCHEMA_VERSION] = SCHEMA_VERSION
