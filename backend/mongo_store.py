"""MongoDB record of patients and their observations.

MongoDB holds what a hospital system would own — demographics, intake detail, and the observation
series. It deliberately does not hold assessments or the audit log: those stay in the local
append-only, hash-chained SQLite ledger, because a chain whose links can be updated in place proves
nothing.

Every function here is best effort. A demo laptop with no network, a blocked outbound 27017, or an
IP that is not on the Atlas access list must still produce a working queue, so a failure is recorded
in `status()` and the caller falls back to local seeding. Nothing in the clinical path waits on a
database that may not answer.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DB = os.getenv("MONGODB_DB", "sundara_command")
MONGODB_TIMEOUT_MS = int(os.getenv("MONGODB_TIMEOUT_MS", "5000"))
MONGODB_ENABLED = os.getenv("MONGODB_ENABLED", "1") != "0"
# A failed connection costs the full selection timeout. Without a backoff every request that asks
# whether the store is available would pay it, and an unreachable cluster would look like a hung API.
MONGODB_RETRY_SECONDS = float(os.getenv("MONGODB_RETRY_SECONDS", "60"))

_client: Any = None
_state: dict[str, Any] = {"connected": False, "reason": "not attempted", "database": MONGODB_DB}
_next_attempt_at = 0.0


def configured_uri() -> str:
    """Assemble the URI, substituting credentials supplied as separate variables when present.

    Atlas hands out a template containing `<db_password>`. Passwords routinely contain characters
    that are not URI-safe, so the separate-variable form percent-encodes them here rather than
    leaving the operator to do it by hand.
    """
    user, password = os.getenv("MONGODB_USER"), os.getenv("MONGODB_PASSWORD")
    if MONGODB_URI and password and "<db_password>" in MONGODB_URI:
        return MONGODB_URI.replace("<db_password>", quote_plus(password))
    if MONGODB_URI:
        return MONGODB_URI
    host = os.getenv("MONGODB_HOST")
    if host and user and password:
        return f"mongodb+srv://{quote_plus(user)}:{quote_plus(password)}@{host}/?appName=Cluster0"
    return ""


def _connect(*, force: bool = False) -> Any:
    """Return a live client, or None. Retries are rate-limited unless `force` is set."""
    global _client, _next_attempt_at
    if _client is not None:
        return _client
    if not force and time.monotonic() < _next_attempt_at:
        return None
    _next_attempt_at = time.monotonic() + MONGODB_RETRY_SECONDS
    uri = configured_uri()
    if not MONGODB_ENABLED:
        _state.update(connected=False, reason="disabled by MONGODB_ENABLED=0")
        return None
    if not uri:
        _state.update(connected=False, reason="MONGODB_URI is not set; see backend/.env.example")
        return None
    try:
        from pymongo import MongoClient  # Imported lazily so the API starts without the driver.

        client = MongoClient(uri, serverSelectionTimeoutMS=MONGODB_TIMEOUT_MS, appname="sundara-command")
        client.admin.command("ping")
    except Exception as error:  # Network, TLS, auth, access list, missing driver — all non-fatal.
        _state.update(connected=False, reason=f"{type(error).__name__}: {str(error)[:200]}")
        return None
    _client = client
    _state.update(connected=True, reason="connected", database=MONGODB_DB)
    return client


def _fail(reason: str) -> None:
    """Drop the dead client and start the backoff, so the next call does not reuse a broken socket."""
    global _client, _next_attempt_at
    _client = None
    _next_attempt_at = time.monotonic() + MONGODB_RETRY_SECONDS
    _state.update(connected=False, reason=reason)


def database() -> Any:
    client = _connect()
    return client[MONGODB_DB] if client is not None else None


def status(*, force: bool = False) -> dict[str, Any]:
    """What the Settings page shows. Never raises; a stale cached client re-reports as connected."""
    if not _state["connected"]:
        _connect(force=force)
    seconds_left = max(0.0, _next_attempt_at - time.monotonic())
    return {**_state, "uri_configured": bool(configured_uri()),
            "retry_in_seconds": 0 if _state["connected"] else round(seconds_left)}


def is_available() -> bool:
    return database() is not None


def upsert_patient(patient: dict[str, Any]) -> bool:
    db = database()
    if db is None:
        return False
    try:
        db.patients.update_one({"patient_id": patient["patient_id"]}, {"$set": patient}, upsert=True)
        return True
    except Exception as error:
        _fail(f"write failed: {type(error).__name__}")
        return False


def append_observation(patient_id: str, observation: dict[str, Any]) -> bool:
    """Observations are separate documents, so a series grows without rewriting the patient."""
    db = database()
    if db is None:
        return False
    try:
        db.vitals.insert_one({"patient_id": patient_id, **observation})
        return True
    except Exception as error:
        _fail(f"write failed: {type(error).__name__}")
        return False


def load_all() -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    """Every stored patient with its observations, ordered oldest first."""
    db = database()
    if db is None:
        return []
    try:
        records = []
        for patient in db.patients.find({}, {"_id": 0}):
            series = list(db.vitals.find({"patient_id": patient["patient_id"]}, {"_id": 0, "patient_id": 0}).sort("observed_at", 1))
            records.append((patient, series))
        return records
    except Exception as error:
        _fail(f"read failed: {type(error).__name__}")
        return []


def seed_mock_patients(*, replace: bool = False) -> int:
    """Write the five synthetic patients. Returns how many are in the collection afterwards."""
    from mock_patients import mock_records

    db = database()
    if db is None:
        return 0
    try:
        if replace:
            db.patients.delete_many({})
            db.vitals.delete_many({})
        db.patients.create_index("patient_id", unique=True)
        db.vitals.create_index([("patient_id", 1), ("observed_at", 1)])
        for patient, observations in mock_records():
            existing = db.patients.find_one({"patient_id": patient["patient_id"]}, {"_id": 1})
            db.patients.update_one({"patient_id": patient["patient_id"]}, {"$set": patient}, upsert=True)
            if existing and not replace:
                continue  # Never duplicate a series across restarts.
            db.vitals.delete_many({"patient_id": patient["patient_id"]})
            for observation in observations:
                db.vitals.insert_one({"patient_id": patient["patient_id"], **observation})
        return db.patients.count_documents({})
    except Exception as error:
        _fail(f"seed failed: {type(error).__name__}: {str(error)[:200]}")
        return 0
