"""TimescaleDB-backed observation and trend API for Sundara Command."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from shared.contracts import LabObservation, VitalsObservation
from time_series_service.features import vital_features
from time_series_service.repository import insert_lab, insert_vitals, labs_for, setup_database, vitals_for


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_database()
    yield


app = FastAPI(title="Sundara Command Time-Series Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "time-series-service", "database": "TimescaleDB"}


@app.post("/observations/vitals", status_code=201)
def create_vitals(payload: VitalsObservation):
    observation, inserted = insert_vitals(payload)
    return {"status": "created" if inserted else "duplicate", "observation": observation}


@app.post("/observations/labs", status_code=201)
def create_lab(payload: LabObservation):
    observation, inserted = insert_lab(payload)
    return {"status": "created" if inserted else "duplicate", "observation": observation}


@app.get("/patients/{patient_id}/observations")
def observations(
    patient_id: str,
    window_minutes: int = Query(default=120, ge=1, le=10_080),
    test_code: str | None = Query(default=None),
):
    return {
        "patient_id": patient_id,
        "window_minutes": window_minutes,
        "vitals": vitals_for(patient_id, window_minutes),
        "labs": labs_for(patient_id, test_code, window_minutes),
    }


@app.get("/patients/{patient_id}/features")
def features(patient_id: str, window_minutes: int = Query(default=120, ge=1, le=10_080)):
    return vital_features(patient_id, vitals_for(patient_id, window_minutes), window_minutes)
