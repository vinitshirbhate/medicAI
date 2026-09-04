"""Serial vitals: a spoken trajectory must reach the engine, and must not flatter the score."""
from __future__ import annotations

import os
import tempfile
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

os.environ["SUNDARA_DB_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")

import main  # noqa: E402  - the module reads SUNDARA_DB_PATH at import time.
from intake_extraction import extract_intake  # noqa: E402

HANDOFF = (
    "New patient, ID P-1042. Forty-six-year-old female, arrived by ambulance at 7:58 PM. "
    "Current vitals: heart rate 128, blood pressure 94 over 62, respiratory rate 29, "
    "oxygen saturation 89 percent, temperature 39.4 degrees Celsius, GCS 13. "
    "On examination, her oxygen saturation has been falling from 96 to 89 percent, heart rate has "
    "increased from 98 to 128, and respiratory rate has increased from 21 to 29."
)


@pytest.fixture(autouse=True)
def clean_database():
    main.setup()
    with main.conn() as c:
        c.executescript("DELETE FROM audit; DELETE FROM assessments; DELETE FROM vitals; DELETE FROM patients;")
    yield


def reading(**values):
    return {"value": values.get("value"), "missing": values.get("value") is None}


VITAL_NAMES = ("heart_rate", "systolic_bp", "diastolic_bp", "spo2", "respiratory_rate", "temperature_c", "gcs")


def observation(observed_at: datetime, estimated: bool = False, **values):
    """A stored row always carries every vital, present or missing, exactly as the Vitals model does."""
    return {
        "observed_at": observed_at.isoformat(),
        "source": "NURSE_REPORTED_PRIOR" if estimated else "MANUAL",
        "observed_at_estimated": estimated,
        **{name: reading(value=values.get(name)) for name in VITAL_NAMES},
    }


def store(patient_id: str, *observations, **patient_fields):
    patient = {
        "patient_id": patient_id, "hospital_id": "SUNDARA_CENTRAL", "age": 46, "sex": "F",
        "arrival_time": datetime.now(UTC).isoformat(), "arrival_mode": "AMBULANCE", "is_new_patient": False,
        "chief_complaint": "", "pathway": "DENGUE", "protocol_band": 2, "symptoms": {},
        "known_conditions": {}, "pathway_detail": {}, "notes": "", **patient_fields,
    }
    with main.conn() as c:
        c.execute("INSERT INTO patients VALUES(?,?,?)", (patient_id, main.dump(patient), main.now()))
        for item in observations:
            c.execute("INSERT INTO vitals(patient_id,payload) VALUES(?,?)", (patient_id, main.dump(item)))
    return patient


def test_trajectory_is_extracted_from_speech() -> None:
    trends = extract_intake(HANDOFF)["patient_draft"]["trends"]
    assert trends["spo2"] == {"from": 96, "to": 89, "direction": "FALLING",
                              "evidence": "oxygen saturation has been falling from 96 to 89"}
    assert trends["heart_rate"]["from"] == 98 and trends["heart_rate"]["direction"] == "RISING"
    assert trends["respiratory_rate"]["from"] == 21


def test_trajectory_is_flagged_as_timeless() -> None:
    unconfirmed = extract_intake(HANDOFF)["missing_or_unconfirmed"]
    assert any("only the order is used" in item for item in unconfirmed)


def test_news2_matches_published_bands() -> None:
    # RCP NEWS2: RR 29 -> 3, SpO2 89 -> 3, systolic 94 -> 2, pulse 128 -> 2, temp 39.4 -> 2, GCS < 15 -> 3.
    row = {name: reading(value=value) for name, value in
           {"respiratory_rate": 29, "spo2": 89, "systolic_bp": 94, "heart_rate": 128, "temperature_c": 39.4, "gcs": 13}.items()}
    assert main.news2_aggregate(row) == 15
    assert main.news2_aggregate({"heart_rate": reading()}) is None


def test_comparison_is_like_for_like() -> None:
    """A sparse prior reading must not raise the aggregate through missingness alone."""
    earlier = {name: reading(value=value) for name, value in {"spo2": 96, "heart_rate": 98, "respiratory_rate": 21}.items()}
    later = {name: reading(value=value) for name, value in
             {"spo2": 89, "heart_rate": 128, "respiratory_rate": 29, "systolic_bp": 94, "temperature_c": 39.4, "gcs": 13}.items()}
    assert main.news2_pair(earlier, later) == (3, 8)  # scored over the three shared parameters only
    assert main.news2_aggregate(later) == 15  # the full row, which would have overstated the rise


def test_trajectory_raises_risk_above_the_snapshot() -> None:
    stamp = datetime.now(UTC)
    snapshot = store("P-SNAP", observation(stamp, spo2=89, heart_rate=128, respiratory_rate=29))
    with_trend = store("P-TREND",
                       observation(stamp, estimated=True, spo2=96, heart_rate=98, respiratory_rate=21),
                       observation(stamp, spo2=89, heart_rate=128, respiratory_rate=29))
    flat = main.calculate(snapshot)
    falling = main.calculate(with_trend)
    assert falling["deterioration_risk"] > flat["deterioration_risk"]
    assert falling["observations_used"] == 2 and flat["observations_used"] == 1
    assert falling["news2"] == {"first": 3, "latest": 8, "rise_points": main.NEWS2_RISE_POINTS}
    assert any("deteriorating across observations" in c["clinical_label"] for c in falling["explanation"]["contributions"])


def test_stable_patient_gets_no_trend_credit() -> None:
    stamp = datetime.now(UTC)
    patient = store("P-STABLE",
                    observation(stamp, estimated=True, spo2=89, heart_rate=128, respiratory_rate=29),
                    observation(stamp, spo2=89, heart_rate=127, respiratory_rate=29))
    assessment = main.calculate(patient)
    assert assessment["news2"]["first"] == assessment["news2"]["latest"]
    assert not any("deteriorating" in c["clinical_label"] for c in assessment["explanation"]["contributions"])


def test_improving_patient_is_not_penalised() -> None:
    stamp = datetime.now(UTC)
    patient = store("P-BETTER",
                    observation(stamp, estimated=True, spo2=89, heart_rate=128, respiratory_rate=29),
                    observation(stamp, spo2=97, heart_rate=88, respiratory_rate=18))
    assessment = main.calculate(patient)
    assert assessment["news2"]["latest"] < assessment["news2"]["first"]
    assert not any("deteriorating" in c["clinical_label"] for c in assessment["explanation"]["contributions"])


def test_prior_reading_posted_late_still_scores_as_earlier() -> None:
    """Insertion order is not truth order: the estimated prior reading sorts first at an equal stamp."""
    stamp = datetime.now(UTC)
    patient = store("P-LATE",
                    observation(stamp, spo2=89, heart_rate=128, respiratory_rate=29),
                    observation(stamp, estimated=True, spo2=96, heart_rate=98, respiratory_rate=21))
    series = main.vitals_for("P-LATE")
    assert series[0]["observed_at_estimated"] is True and series[-1]["spo2"]["value"] == 89
    assert main.calculate(patient)["news2"] == {"first": 3, "latest": 8, "rise_points": main.NEWS2_RISE_POINTS}


def test_real_timestamps_order_ahead_of_equal_stamp_rule() -> None:
    stamp = datetime.now(UTC)
    store("P-TIMED",
          observation(stamp, spo2=89, heart_rate=128, respiratory_rate=29),
          observation(stamp - timedelta(hours=1), spo2=96, heart_rate=98, respiratory_rate=21))
    series = main.vitals_for("P-TIMED")
    assert series[0]["spo2"]["value"] == 96 and series[-1]["spo2"]["value"] == 89


def test_explicit_nulls_from_a_voice_draft_do_not_break_assessment() -> None:
    """A draft states tbsa_pct: null rather than omitting it; assessment must survive that."""
    detail = {"tbsa_pct": None, "platelet_trend": None, "day_of_illness": None, "smoke_inhalation": False}
    patient = store("P-NULLS", observation(datetime.now(UTC), spo2=89, heart_rate=128), pathway_detail=detail)
    assert main.calculate(patient)["deterioration_risk"] > 0


def test_explanation_leads_with_the_strongest_driver() -> None:
    stamp = datetime.now(UTC)
    patient = store("P-WHY",
                    observation(stamp, estimated=True, spo2=96, heart_rate=98, respiratory_rate=21),
                    observation(stamp, spo2=89, heart_rate=128, respiratory_rate=29))
    assessment = main.calculate(patient)
    weights = [c["contribution"] for c in assessment["explanation"]["contributions"]]
    assert weights == sorted(weights, reverse=True)
    assert "deteriorating across observations" in assessment["explanation"]["one_line"]
