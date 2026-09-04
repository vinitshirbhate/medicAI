"""Append-only, hash-chained audit persistence."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from pathlib import Path
from typing import Any
from uuid import uuid4

from shared.contracts import AuditEntry, SCHEMA_VERSION, utc_now

DB = Path(os.getenv("GOVERNANCE_DB_PATH", Path(__file__).with_name("governance.db")))


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def setup_database() -> None:
    with connection() as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS audit_entries(
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                entry TEXT NOT NULL,
                previous_hash TEXT NOT NULL,
                hash TEXT NOT NULL
            )"""
        )


def append_event(
    *,
    event_type: str,
    initiated_by: str,
    actor: str,
    assessment_id: str,
    patient_id: str,
    model_version: str,
    correlation_id: str,
    payload: dict[str, Any],
) -> AuditEntry:
    """Append an event whose digest includes the previous event digest."""
    with connection() as conn:
        last = conn.execute(
            "SELECT hash FROM audit_entries ORDER BY sequence DESC LIMIT 1"
        ).fetchone()
        previous_hash = last["hash"] if last else "GENESIS"
        entry = {
            "event_id": str(uuid4()),
            "event_type": event_type,
            "occurred_at": utc_now().isoformat(),
            "initiated_by": initiated_by,
            "actor": actor,
            "assessment_id": assessment_id,
            "patient_id": patient_id,
            "model_version": model_version,
            "correlation_id": correlation_id,
            "schema_version": SCHEMA_VERSION,
            "payload": payload,
            "previous_hash": previous_hash,
        }
        entry_hash = hashlib.sha256((previous_hash + canonical_json(entry)).encode()).hexdigest()
        cursor = conn.execute(
            "INSERT INTO audit_entries(entry, previous_hash, hash) VALUES (?, ?, ?)",
            (canonical_json(entry), previous_hash, entry_hash),
        )
    return AuditEntry(sequence=cursor.lastrowid, hash=entry_hash, **entry)


def list_entries(patient_id: str | None = None) -> list[AuditEntry]:
    statement = "SELECT sequence, entry, hash FROM audit_entries"
    params: tuple[str, ...] = ()
    if patient_id:
        statement += " WHERE json_extract(entry, '$.patient_id') = ?"
        params = (patient_id,)
    statement += " ORDER BY sequence"
    with connection() as conn:
        rows = conn.execute(statement, params).fetchall()
    return [AuditEntry(sequence=row["sequence"], hash=row["hash"], **json.loads(row["entry"])) for row in rows]


def verify_chain() -> dict[str, str | bool | int | None]:
    previous_hash = "GENESIS"
    with connection() as conn:
        rows = conn.execute("SELECT sequence, entry, hash FROM audit_entries ORDER BY sequence").fetchall()
    for row in rows:
        entry = json.loads(row["entry"])
        expected = hashlib.sha256((previous_hash + canonical_json(entry)).encode()).hexdigest()
        if entry["previous_hash"] != previous_hash or row["hash"] != expected:
            return {"valid": False, "failed_at_sequence": row["sequence"], "head_hash": previous_hash}
        previous_hash = row["hash"]
    return {"valid": True, "failed_at_sequence": None, "head_hash": previous_hash, "entries": len(rows)}
