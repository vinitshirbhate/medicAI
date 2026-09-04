"""Independently deployable governance API for Sundara Command."""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from governance_service.audit import append_event, list_entries, setup_database, verify_chain
from shared.contracts import AcceptDecision, OverrideDecision, RecommendationRecord, utc_now


def entry_payload(entry: RecommendationRecord | AcceptDecision | OverrideDecision) -> dict:
    return entry.model_dump(mode="json")


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_database()
    yield


app = FastAPI(
    title="Sundara Command Governance Service",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "governance-service"}


@app.post("/recommendations", status_code=201)
def record_recommendation(payload: RecommendationRecord):
    """Record an AI recommendation before a clinician accepts or overrides it."""
    return append_event(
        event_type="AI_RECOMMENDATION",
        initiated_by="AI",
        actor="SUNDARA_TRIAGE_ENGINE",
        assessment_id=payload.assessment_id,
        patient_id=payload.patient_id,
        model_version=payload.model_version,
        correlation_id=payload.correlation_id,
        payload=entry_payload(payload),
    )


@app.post("/decisions/accept", status_code=201)
def accept_recommendation(payload: AcceptDecision):
    entry = append_event(
        event_type="ACCEPT",
        initiated_by="HUMAN",
        actor=payload.actor,
        assessment_id=payload.assessment_id,
        patient_id=payload.patient_id,
        model_version=payload.model_version,
        correlation_id=payload.correlation_id,
        payload=entry_payload(payload),
    )
    return {"status": "accepted", "message": "Recommendation accepted.", "audit_entry": entry}


@app.post("/decisions/override", status_code=201)
def override_recommendation(payload: OverrideDecision):
    reassessment_due = utc_now() + timedelta(minutes=payload.reassessment_minutes)
    entry = append_event(
        event_type="OVERRIDE",
        initiated_by="HUMAN",
        actor=payload.actor,
        assessment_id=payload.assessment_id,
        patient_id=payload.patient_id,
        model_version=payload.model_version,
        correlation_id=payload.correlation_id,
        payload={**entry_payload(payload), "reassessment_due": reassessment_due.isoformat()},
    )
    return {
        "status": "override_accepted",
        "message": f"Override accepted. Reassessment recommended in {payload.reassessment_minutes} minutes.",
        "reassessment_due": reassessment_due,
        "audit_entry": entry,
    }


@app.get("/decisions/{patient_id}")
def decisions_for_patient(patient_id: str):
    return [entry for entry in list_entries(patient_id) if entry.event_type in {"ACCEPT", "OVERRIDE"}]


@app.get("/audit")
def audit_entries(patient_id: str | None = Query(default=None)):
    return list_entries(patient_id)


@app.get("/audit/verify")
def audit_verification():
    return verify_chain()


@app.get("/reassessments/due")
def due_reassessments():
    current_time = utc_now()
    due = []
    for entry in list_entries():
        if entry.event_type != "OVERRIDE":
            continue
        reassessment_due = entry.payload.get("reassessment_due")
        if reassessment_due and current_time >= utc_now().fromisoformat(reassessment_due):
            due.append(entry)
    return due
