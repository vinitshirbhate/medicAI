"""TimescaleDB persistence for immutable clinical observations."""
from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Iterator

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row

from shared.contracts import LabObservation, VitalsObservation

load_dotenv(Path(__file__).with_name(".env"))

DATABASE_URL = os.getenv(
    "TIMESCALE_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/sundara_timeseries",
)


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn


def setup_database() -> None:
    """Create TimescaleDB tables and convert observation tables to hypertables."""
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS vital_observations(
                observed_at TIMESTAMPTZ NOT NULL,
                observation_id UUID NOT NULL,
                patient_id TEXT NOT NULL,
                encounter_id TEXT,
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                source TEXT NOT NULL,
                heart_rate DOUBLE PRECISION,
                systolic_bp DOUBLE PRECISION,
                diastolic_bp DOUBLE PRECISION,
                spo2 DOUBLE PRECISION,
                respiratory_rate DOUBLE PRECISION,
                temperature_c DOUBLE PRECISION,
                gcs DOUBLE PRECISION,
                schema_version TEXT NOT NULL,
                PRIMARY KEY(observed_at, observation_id)
            )"""
        )
        cursor.execute("SELECT create_hypertable('vital_observations', 'observed_at', if_not_exists => TRUE)")
        cursor.execute("CREATE INDEX IF NOT EXISTS vital_patient_time_idx ON vital_observations(patient_id, observed_at DESC)")
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS lab_observations(
                observed_at TIMESTAMPTZ NOT NULL,
                observation_id UUID NOT NULL,
                patient_id TEXT NOT NULL,
                encounter_id TEXT,
                received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                test_code TEXT NOT NULL,
                value DOUBLE PRECISION NOT NULL,
                unit TEXT NOT NULL,
                source TEXT NOT NULL,
                schema_version TEXT NOT NULL,
                PRIMARY KEY(observed_at, observation_id)
            )"""
        )
        cursor.execute("SELECT create_hypertable('lab_observations', 'observed_at', if_not_exists => TRUE)")
        cursor.execute("CREATE INDEX IF NOT EXISTS lab_patient_test_time_idx ON lab_observations(patient_id, test_code, observed_at DESC)")
        cursor.execute(
            """CREATE TABLE IF NOT EXISTS ingestion_keys(
                source_event_id TEXT PRIMARY KEY,
                observation_id UUID NOT NULL,
                observation_kind TEXT NOT NULL,
                observed_at TIMESTAMPTZ NOT NULL
            )"""
        )


def _claim_event(cursor: psycopg.Cursor, source_event_id: str | None, observation_id: str, kind: str, observed_at: datetime) -> bool:
    if not source_event_id:
        return True
    cursor.execute(
        """INSERT INTO ingestion_keys(source_event_id, observation_id, observation_kind, observed_at)
           VALUES (%s, %s, %s, %s) ON CONFLICT (source_event_id) DO NOTHING
           RETURNING source_event_id""",
        (source_event_id, observation_id, kind, observed_at),
    )
    return cursor.fetchone() is not None


def insert_vitals(observation: VitalsObservation) -> tuple[VitalsObservation, bool]:
    with connection() as conn, conn.cursor() as cursor:
        inserted = _claim_event(cursor, observation.source_event_id, observation.observation_id, "VITALS", observation.observed_at)
        if not inserted:
            return observation, False
        cursor.execute(
            """INSERT INTO vital_observations(
                observed_at, observation_id, patient_id, encounter_id, source,
                heart_rate, systolic_bp, diastolic_bp, spo2, respiratory_rate,
                temperature_c, gcs, schema_version
            ) VALUES (%(observed_at)s, %(observation_id)s, %(patient_id)s, %(encounter_id)s, %(source)s,
                %(heart_rate)s, %(systolic_bp)s, %(diastolic_bp)s, %(spo2)s, %(respiratory_rate)s,
                %(temperature_c)s, %(gcs)s, %(schema_version)s)""",
            observation.model_dump(),
        )
    return observation, True


def insert_lab(observation: LabObservation) -> tuple[LabObservation, bool]:
    with connection() as conn, conn.cursor() as cursor:
        inserted = _claim_event(cursor, observation.source_event_id, observation.observation_id, "LAB", observation.observed_at)
        if not inserted:
            return observation, False
        cursor.execute(
            """INSERT INTO lab_observations(
                observed_at, observation_id, patient_id, encounter_id, test_code,
                value, unit, source, schema_version
            ) VALUES (%(observed_at)s, %(observation_id)s, %(patient_id)s, %(encounter_id)s, %(test_code)s,
                %(value)s, %(unit)s, %(source)s, %(schema_version)s)""",
            observation.model_dump(),
        )
    return observation, True


def vitals_for(patient_id: str, window_minutes: int) -> list[dict]:
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            """SELECT observed_at, observation_id, patient_id, encounter_id, source,
                      heart_rate, systolic_bp, diastolic_bp, spo2, respiratory_rate,
                      temperature_c, gcs, schema_version
                 FROM vital_observations
                 WHERE patient_id = %s
                   AND observed_at >= NOW() - (%s * INTERVAL '1 minute')
                 ORDER BY observed_at""",
            (patient_id, window_minutes),
        )
        return list(cursor.fetchall())


def labs_for(patient_id: str, test_code: str | None, window_minutes: int) -> list[dict]:
    query = """SELECT observed_at, observation_id, patient_id, encounter_id, test_code, value, unit, source, schema_version
                 FROM lab_observations
                 WHERE patient_id = %s
                   AND observed_at >= NOW() - (%s * INTERVAL '1 minute')"""
    params: list[object] = [patient_id, window_minutes]
    if test_code:
        query += " AND test_code = %s"
        params.append(test_code)
    query += " ORDER BY observed_at"
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(query, params)
        return list(cursor.fetchall())
