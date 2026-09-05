"""The five synthetic patients the demo starts from.

One list, two stores. MongoDB is the record of demographics and observations; SQLite holds the
assessments and the hash-chained audit log. Seeding both from this module is what keeps a Mongo-less
laptop and a connected one showing the same queue.

`P-1042` and `P-1043` are the documented contrast pair from the README walkthrough: near-identical
acute presentations where the second is a new patient with no oxygen baseline and no platelet trend,
so its risk must be presented as uncertain rather than as a fact. The other three widen the queue
across protocol bands and pathways.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

UTC = timezone.utc

# Observations are minutes-before-now so a restarted demo always shows a plausible waiting time.
MOCK_PATIENTS: list[dict[str, Any]] = [
    {
        "patient": {
            "patient_id": "P-1042", "hospital_id": "SUNDARA_CENTRAL", "age": 46, "sex": "F",
            "arrival_offset_minutes": 16, "arrival_mode": "AMBULANCE", "is_new_patient": False,
            "chief_complaint": "Shortness of breath and high fever", "pathway": "DENGUE", "protocol_band": 2,
            "symptoms": {"fever": True, "breathlessness": True},
            "known_conditions": {"dengue": "CONFIRMED"},
            "pathway_detail": {"platelet_trend": [128000, 110000, 96000, 82000], "lactate_mmol_l": 3.1},
            "notes": "Synthetic demo case",
        },
        "observations": [
            {"offset_minutes": 14, "source": "SIMULATED_EHR", "heart_rate": 128, "systolic_bp": 94,
             "diastolic_bp": 62, "spo2": 89, "respiratory_rate": 29, "temperature_c": 39.4, "gcs": 14},
        ],
    },
    {
        "patient": {
            "patient_id": "P-1043", "hospital_id": "SUNDARA_CENTRAL", "age": 46, "sex": "UNKNOWN",
            "arrival_offset_minutes": 14, "arrival_mode": "AMBULANCE", "is_new_patient": True,
            "chief_complaint": "Fever and dizziness", "pathway": "DENGUE", "protocol_band": 2,
            "symptoms": {"fever": True},
            "known_conditions": {"dengue": "UNKNOWN"},
            "pathway_detail": {},
            "notes": "Synthetic demo case",
        },
        "observations": [
            {"offset_minutes": 12, "source": "SIMULATED_EHR", "heart_rate": 126, "systolic_bp": 96,
             "diastolic_bp": 64, "spo2": None, "respiratory_rate": 28, "temperature_c": 39.1, "gcs": 14},
        ],
    },
    {
        "patient": {
            "patient_id": "P-2044", "hospital_id": "SUNDARA_CENTRAL", "age": 9, "sex": "M",
            "arrival_offset_minutes": 41, "arrival_mode": "AMBULANCE", "is_new_patient": False,
            "chief_complaint": "Scald burn to torso with smoke exposure", "pathway": "BURN_SMOKE", "protocol_band": 2,
            "symptoms": {"cough": True, "hoarse_voice": True, "breathlessness": True},
            "known_conditions": {"asthma": "CONFIRMED"},
            "pathway_detail": {"tbsa_pct": 24, "smoke_inhalation": True, "airway_concern": "HIGH"},
            "notes": "Paediatric burn; out-of-distribution for this demo cohort",
        },
        # Two observations: the airway is closing, which is what the trajectory signal is for.
        "observations": [
            {"offset_minutes": 39, "source": "SIMULATED_EHR", "heart_rate": 118, "systolic_bp": 104,
             "diastolic_bp": 68, "spo2": 95, "respiratory_rate": 24, "temperature_c": 37.6, "gcs": 15},
            {"offset_minutes": 9, "source": "MONITOR", "heart_rate": 134, "systolic_bp": 98,
             "diastolic_bp": 61, "spo2": 90, "respiratory_rate": 31, "temperature_c": 38.1, "gcs": 14},
        ],
    },
    {
        "patient": {
            "patient_id": "P-2045", "hospital_id": "SUNDARA_NORTH", "age": 33, "sex": "M",
            "arrival_offset_minutes": 7, "arrival_mode": "AMBULANCE", "is_new_patient": False,
            "chief_complaint": "Road traffic collision, chest and pelvic pain", "pathway": "TRAUMA", "protocol_band": 1,
            "symptoms": {"chest_pain": True, "breathlessness": True, "abdominal_pain": True},
            "known_conditions": {},
            "pathway_detail": {"mechanism": "HIGH_ENERGY", "suspected_internal_bleeding": True},
            "notes": "Synthetic demo case",
        },
        "observations": [
            {"offset_minutes": 6, "source": "MONITOR", "heart_rate": 131, "systolic_bp": 88,
             "diastolic_bp": 54, "spo2": 91, "respiratory_rate": 30, "temperature_c": 36.4, "gcs": 13},
        ],
    },
    {
        "patient": {
            "patient_id": "P-2046", "hospital_id": "SUNDARA_CENTRAL", "age": 61, "sex": "F",
            "arrival_offset_minutes": 74, "arrival_mode": "WALK_IN", "is_new_patient": False,
            "chief_complaint": "Ankle injury after a fall at home", "pathway": "GENERAL", "protocol_band": 4,
            "symptoms": {"fever": False, "breathlessness": False},
            "known_conditions": {"hypertension": "CONFIRMED"},
            "pathway_detail": {},
            "notes": "Synthetic demo case; stable, long wait drives the equity term",
        },
        "observations": [
            {"offset_minutes": 70, "source": "MANUAL", "heart_rate": 84, "systolic_bp": 138,
             "diastolic_bp": 82, "spo2": 97, "respiratory_rate": 16, "temperature_c": 36.8, "gcs": 15},
        ],
    },
]


def _iso(offset_minutes: float) -> str:
    return (datetime.now(UTC) - timedelta(minutes=offset_minutes)).isoformat()


def patient_record(case: dict[str, Any]) -> dict[str, Any]:
    """The patient document as the API stores it: offsets resolved to absolute arrival times."""
    patient = {key: value for key, value in case["patient"].items() if key != "arrival_offset_minutes"}
    patient["arrival_time"] = _iso(case["patient"]["arrival_offset_minutes"])
    return patient


def observation_records(case: dict[str, Any]) -> list[dict[str, Any]]:
    """Observations in the wire shape: every metric a `{value, missing}` pair, never a bare number."""
    rows = []
    for observation in case["observations"]:
        metrics = {key: value for key, value in observation.items() if key not in ("offset_minutes", "source")}
        rows.append({
            "observed_at": _iso(observation["offset_minutes"]),
            "source": observation["source"],
            "observed_at_estimated": False,
            **{key: {"value": value, "missing": value is None} for key, value in metrics.items()},
        })
    return rows


def mock_records() -> list[tuple[dict[str, Any], list[dict[str, Any]]]]:
    return [(patient_record(case), observation_records(case)) for case in MOCK_PATIENTS]
