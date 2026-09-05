"""SQLite-backed operational state for the resource service."""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

from fastapi import HTTPException

from shared.contracts import HospitalResource, NetworkEvent, ResourceState

DB = Path(os.getenv("RESOURCE_DB_PATH", Path(__file__).with_name("resource.db")))

SEED_HOSPITALS = [
    {
        "hospital_id": "SUNDARA_CENTRAL",
        "icu": {"total": 40, "occupied": 40, "available": 0},
        "ed": {"total": 80, "occupied": 71, "available": 9},
        "doctors": {"scheduled": 22, "available": 19},
        "nurses": {"scheduled": 48, "available": 37},
    },
    {
        "hospital_id": "SUNDARA_NORTH",
        "icu": {"total": 30, "occupied": 29, "available": 1},
        "ed": {"total": 60, "occupied": 46, "available": 14},
        "doctors": {"scheduled": 18, "available": 16},
        "nurses": {"scheduled": 38, "available": 34},
    },
]
SEED_EVENTS = [
    {"type": "OUTBREAK", "severity": "HIGH", "details": {"condition": "Dengue"}},
    {"type": "MASS_CASUALTY", "severity": "CRITICAL", "details": {"casualties": 84}},
    {"type": "TRANSIT_DISRUPTION", "severity": "HIGH", "details": {"staff_unavailable_pct": 24}},
]
# A fallback for this standalone service only. The triage service computes its own list from
# staffing.py rather than restating one, so the capacity panel and the staffing plan cannot disagree.
INFEASIBILITIES = [
    {
        "request": "Reassign nurses from SUNDARA_NORTH to SUNDARA_CENTRAL",
        "status": "IMPOSSIBLE",
        "reason": "Transit corridor SUNDARA_NORTH -> SUNDARA_CENTRAL is closed for the strike window",
        "alternative": "Route eligible high-acuity arrivals to SUNDARA_NORTH",
    }
]
# This is the scenario-wide occupancy provided by Sundara Command's demo brief.
# The two visible hospitals are only a subset of the 40-hospital network.
NETWORK_ICU_OCCUPANCY_PCT = 93


def connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def dump(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def setup_database() -> None:
    with connection() as conn:
        conn.executescript(
            """CREATE TABLE IF NOT EXISTS hospitals(
                hospital_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS incidents(
                event_id TEXT PRIMARY KEY,
                payload TEXT NOT NULL
            );"""
        )
        existing = conn.execute("SELECT COUNT(*) AS count FROM hospitals").fetchone()["count"]
        if not existing:
            for hospital in SEED_HOSPITALS:
                conn.execute("INSERT INTO hospitals(hospital_id, payload) VALUES (?, ?)", (hospital["hospital_id"], dump(hospital)))
            for event in SEED_EVENTS:
                parsed = NetworkEvent(**event)
                conn.execute("INSERT INTO incidents(event_id, payload) VALUES (?, ?)", (parsed.event_id, dump(parsed.model_dump(mode="json"))))


def list_hospitals() -> list[HospitalResource]:
    with connection() as conn:
        rows = conn.execute("SELECT payload FROM hospitals ORDER BY hospital_id").fetchall()
    return [HospitalResource(**json.loads(row["payload"])) for row in rows]


def get_hospital(hospital_id: str) -> HospitalResource:
    with connection() as conn:
        row = conn.execute("SELECT payload FROM hospitals WHERE hospital_id = ?", (hospital_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="hospital not found")
    return HospitalResource(**json.loads(row["payload"]))


def save_hospital(hospital: HospitalResource) -> HospitalResource:
    with connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO hospitals(hospital_id, payload) VALUES (?, ?)",
            (hospital.hospital_id, dump(hospital.model_dump(mode="json"))),
        )
    return hospital


def list_incidents() -> list[NetworkEvent]:
    with connection() as conn:
        rows = conn.execute("SELECT payload FROM incidents ORDER BY rowid").fetchall()
    return [NetworkEvent(**json.loads(row["payload"])) for row in rows]


def save_incident(event: NetworkEvent) -> NetworkEvent:
    with connection() as conn:
        conn.execute("INSERT OR REPLACE INTO incidents(event_id, payload) VALUES (?, ?)", (event.event_id, dump(event.model_dump(mode="json"))))
    return event


def resource_state() -> ResourceState:
    hospitals = list_hospitals()
    return ResourceState(
        network_icu_occupancy_pct=NETWORK_ICU_OCCUPANCY_PCT,
        active_events=list_incidents(),
        hospitals=hospitals,
        infeasibilities=INFEASIBILITIES,
    )
