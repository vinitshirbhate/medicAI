"""The advisory model is allowed to be wrong. It is not allowed to be unverifiable, or to rank."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pytest

os.environ["SUNDARA_DB_PATH"] = str(Path(tempfile.mkdtemp()) / "so-test.db")
os.environ["OPENROUTER_API_KEY"] = "test-key-not-real"
os.environ["OPENROUTER_BASE_URL"] = "http://127.0.0.1:9"  # A forgotten transport fails fast, never dials out.
os.environ["SECOND_OPINION_ENABLED"] = "1"

import main  # noqa: E402  - reads SUNDARA_DB_PATH at import time.
import second_opinion as so  # noqa: E402
from banding import four_lines, reliability_band, uncertainty_band  # noqa: E402
from test_serial_vitals import VITAL_NAMES, observation, reading, store  # noqa: E402

ENGINE = {"deterioration_risk": .87, "prediction_reliability": .94, "data_completeness": .91,
          "uncertainty": {"reasons": []}, "explanation": {"one_line": "Oxygen saturation low"},
          "completeness_breakdown": {"vitals": 1.0, "labs": 1.0, "history": .85, "previous_records": 1.0},
          "observations_used": 2, "model_version": "sundara-triage-demo-0.1.0"}
PATIENT = {"patient_id": "P-1042", "age": 46, "sex": "F", "arrival_mode": "AMBULANCE", "is_new_patient": False,
           "pathway": "DENGUE", "protocol_band": 2, "symptoms": {"breathlessness": True},
           "known_conditions": {"dengue": "CONFIRMED"},
           "pathway_detail": {"dengue_status": "CONFIRMED", "day_of_illness": 5, "tbsa_pct": None,
                              "smoke_inhalation": False, "exposure_duration_min": None, "platelet_trend": [96000, 82000]}}
LATEST = {name: reading(value=value) for name, value in
          {"heart_rate": 128, "systolic_bp": 94, "diastolic_bp": 62, "spo2": 89,
           "respiratory_rate": 29, "temperature_c": 39.4, "gcs": 13}.items()}
DRAFT = {"allergies": "NONE_KNOWN",
         "vitals": {"spo2": {"evidence": "oxygen saturation 89 percent"}, "heart_rate": {"evidence": "heart rate 128"}}}
TRENDS = {"source": "LOCAL_OBSERVATIONS", "note": None, "window_minutes": 120,
          "moving_metrics": {"spo2": {"first": 96, "latest": 89, "change": -7, "slope_per_hour": -7.0, "observations": 2}},
          "observation_count": 2, "metrics_with_baseline": ["spo2"], "missing_latest_metrics": []}

GOOD = {"deterioration_risk": .79, "prediction_reliability": .71, "data_completeness": .88,
        "narrative": "Saturation 89 with respiratory rate 29 and heart rate 128 indicates respiratory compromise.",
        "evidence": [{"field": "current_observation.spo2.value", "stated_value": "89", "quote": "oxygen saturation 89 percent"}],
        "reliability_reasons": ["No baseline SpO2"]}


@pytest.fixture(autouse=True)
def clean_database():
    main.setup()
    with main.conn() as c:
        c.executescript("DELETE FROM audit; DELETE FROM assessments; DELETE FROM vitals; DELETE FROM patients; DELETE FROM second_opinions;")
    so._calls_made = 0
    yield


def payload() -> dict:
    return so.build_payload(PATIENT, ENGINE, LATEST, TRENDS, DRAFT)


def transport_returning(opinion, *, status=200, calls=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        if status >= 400:
            return httpx.Response(status, text="upstream said no")
        body = opinion if isinstance(opinion, str) else json.dumps(opinion)
        return httpx.Response(200, json={"choices": [{"message": {"content": body}}], "usage": {"prompt_tokens": 1, "completion_tokens": 1}})
    return httpx.MockTransport(handler)


def run(opinion, **kwargs):
    transport = kwargs.pop("transport", None) or transport_returning(opinion)
    return so.run_second_opinion(patient=PATIENT, assessment=ENGINE, latest=LATEST, trends=TRENDS,
                                 intake_draft=DRAFT, transport=transport, generated_at="2026-09-04T20:00:00+00:00", **kwargs)


# --- the payload ----------------------------------------------------------------------------

def test_payload_withholds_identifiers_transcript_and_engine_conclusions() -> None:
    """Privacy and anti-anchoring, asserted rather than promised."""
    text = so.canonical(payload())
    for forbidden in ("P-1042", "transcript", "arrival_time", "hospital_id"):
        assert forbidden not in text
    # Anchoring the advisory model on the engine's answer makes the divergence signal worthless.
    for conclusion in ("deterioration_risk", "prediction_reliability", "explanation", "forecast", "proposed_escalation"):
        assert conclusion not in payload()


def test_payload_carries_trend_features_from_the_time_series_layer() -> None:
    assert payload()["trend_features"]["moving_metrics"]["spo2"]["change"] == -7
    assert payload()["trend_features"]["source"] == "LOCAL_OBSERVATIONS"


# --- the guardrails -------------------------------------------------------------------------

def test_valid_output_is_accepted() -> None:
    opinion, rejections = so.validate_opinion(GOOD, payload())
    assert rejections == [] and opinion["deterioration_risk"] == .79


def test_invented_vital_is_rejected() -> None:
    raw = {**GOOD, "narrative": "Platelets have fallen to 45000, which is concerning."}
    opinion, rejections = so.validate_opinion(raw, payload())
    assert opinion is None and any("45000" in reason for reason in rejections)


def test_evidence_field_must_resolve() -> None:
    raw = {**GOOD, "evidence": [{"field": "current_observation.lactate.value", "stated_value": "3.1", "quote": "oxygen saturation 89 percent"}]}
    opinion, rejections = so.validate_opinion(raw, payload())
    assert opinion is None and any("not in the input" in reason for reason in rejections)


def test_stated_value_must_match_the_payload() -> None:
    raw = {**GOOD, "evidence": [{"field": "current_observation.spo2.value", "stated_value": "96", "quote": "oxygen saturation 89 percent"}]}
    opinion, rejections = so.validate_opinion(raw, payload())
    assert opinion is None and any("which holds 89" in reason for reason in rejections)


def test_quote_must_come_from_the_supplied_evidence() -> None:
    raw = {**GOOD, "evidence": [{"field": "current_observation.spo2.value", "stated_value": "89", "quote": "patient looks unwell to me"}]}
    opinion, rejections = so.validate_opinion(raw, payload())
    assert opinion is None and any("not supplied in the input" in reason for reason in rejections)


@pytest.mark.parametrize("value", [87, -0.1, 1.5, True, "0.87", None])
def test_risk_must_be_a_probability(value) -> None:
    opinion, rejections = so.validate_opinion({**GOOD, "deterioration_risk": value}, payload())
    assert opinion is None and rejections


def test_reason_outside_the_vocabulary_is_rejected() -> None:
    raw = {**GOOD, "reliability_reasons": ["The nurse seemed unsure"]}
    opinion, rejections = so.validate_opinion(raw, payload())
    assert opinion is None and any("allowed vocabulary" in reason for reason in rejections)


@pytest.mark.parametrize("narrative", [
    "This patient should be escalated to a higher band.",
    "Recommend intubation and admission.",
    "Rank this patient first.",
])
def test_narrative_may_not_direct_care_or_ranking(narrative) -> None:
    opinion, rejections = so.validate_opinion({**GOOD, "narrative": narrative}, payload())
    assert opinion is None and any("ranking, banding, or treatment" in reason for reason in rejections)


# --- degraded modes -------------------------------------------------------------------------

def test_rejected_output_degrades_visibly_with_its_reasons() -> None:
    result = run({**GOOD, "narrative": "Platelets are 45000."})
    assert result["status"] == "DEGRADED"
    assert result["degraded"]["reason_code"] == "MODEL_OUTPUT_REJECTED"
    assert result["degraded"]["detail"], "the panel must be able to show why it was discarded"
    assert result["engine"]["display"]["deterioration_risk"]["display"] == "87%"


def test_timeout_degrades_visibly() -> None:
    def handler(request):
        raise httpx.ReadTimeout("too slow", request=request)
    result = run(None, transport=httpx.MockTransport(handler))
    assert result["degraded"]["reason_code"] == "TIMEOUT" and result["second_opinion"]["available"] is False
    assert result["engine"]["deterioration_risk"] == .87


def test_upstream_error_degrades_visibly() -> None:
    result = run(GOOD, transport=transport_returning(GOOD, status=429))
    assert result["degraded"]["reason_code"] == "UPSTREAM_ERROR"


def test_unreadable_output_degrades_visibly() -> None:
    result = run("this is not json")
    assert result["degraded"]["reason_code"] == "MODEL_OUTPUT_MALFORMED"


def test_missing_key_makes_no_call(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(so, "settings", lambda: so.Settings(True, None, "m", "http://x", 1, 5, False))
    result = run(GOOD, transport=transport_returning(GOOD, calls=calls))
    assert result["degraded"]["reason_code"] == "NO_API_KEY" and calls == []


def test_kill_switch_makes_no_call(monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(so, "settings", lambda: so.Settings(False, "k", "m", "http://x", 1, 5, False))
    result = run(GOOD, transport=transport_returning(GOOD, calls=calls))
    assert result["degraded"]["reason_code"] == "DISABLED" and calls == []


# --- caching and determinism ----------------------------------------------------------------

def test_identical_input_is_served_from_cache() -> None:
    calls = []
    transport = transport_returning(GOOD, calls=calls)
    first = run(GOOD, transport=transport, connect=main.conn)
    second = run(GOOD, transport=transport, connect=main.conn)
    assert len(calls) == 1, "a repeated demo run must not re-bill or re-roll the dice"
    assert first["second_opinion"]["cached"] is False and second["second_opinion"]["cached"] is True
    assert first["second_opinion"]["deterioration_risk"] == second["second_opinion"]["deterioration_risk"]


def test_prompt_version_change_invalidates_the_cache(monkeypatch) -> None:
    calls = []
    transport = transport_returning(GOOD, calls=calls)
    run(GOOD, transport=transport, connect=main.conn)
    monkeypatch.setattr(so, "PROMPT_VERSION", "so-2")
    run(GOOD, transport=transport, connect=main.conn)
    assert len(calls) == 2


def test_force_refresh_bypasses_the_cache() -> None:
    calls = []
    transport = transport_returning(GOOD, calls=calls)
    run(GOOD, transport=transport, connect=main.conn)
    result = run(GOOD, transport=transport, connect=main.conn, force_refresh=True)
    assert len(calls) == 2 and result["second_opinion"]["forced"] is True


# --- divergence, and the fence around it ----------------------------------------------------

def test_agreement_and_divergence() -> None:
    engine = {"deterioration_risk": .87, "prediction_reliability": .94, "data_completeness": .91}
    assert so.divergence(engine, {"deterioration_risk": .84, "prediction_reliability": .90, "data_completeness": .88})["status"] == "AGREE"
    diverged = so.divergence(engine, {"deterioration_risk": .40, "prediction_reliability": .50, "data_completeness": .60})
    assert diverged["status"] == "DIVERGE"
    assert "deterioration_risk" in diverged["differing_lines"] and "prediction_reliability" in diverged["differing_lines"]
    assert "ranks this patient" in diverged["banner"]


def test_divergence_never_touches_rank_or_reliability() -> None:
    """The invariant the whole design rests on."""
    stamp = datetime.now(UTC)
    store("P-1042", observation(stamp, estimated=True, spo2=96, heart_rate=98, respiratory_rate=21),
          observation(stamp, spo2=89, heart_rate=128, respiratory_rate=29))
    main.save_assessment({**PATIENT, "hospital_id": "SUNDARA_CENTRAL", "arrival_time": stamp.isoformat(),
                          "chief_complaint": "", "notes": ""})
    before_queue, before_assessment = main.queue(), main.assessment("P-1042")
    wild = {**GOOD, "deterioration_risk": .05, "prediction_reliability": .10, "data_completeness": .10}
    result = so.run_second_opinion(patient=PATIENT, assessment=before_assessment, latest=LATEST, trends=TRENDS,
                                   intake_draft=DRAFT, transport=transport_returning(wild), generated_at="t")
    assert result["divergence"]["status"] == "DIVERGE"
    assert result["divergence"]["affects_rank"] is False
    assert main.queue() == before_queue
    assert main.assessment("P-1042") == before_assessment


# --- banding --------------------------------------------------------------------------------

def test_both_columns_band_identically() -> None:
    for value, expected in ((.94, "HIGH"), (.80, "HIGH"), (.71, "MODERATE"), (.65, "MODERATE"), (.64, "LOW")):
        assert reliability_band(value) == expected


def test_uncertainty_mirrors_reliability_and_never_contradicts_it() -> None:
    """"Reliability MODERATE / Uncertainty LOW" reads as a contradiction; the bands must move together."""
    mirror = {"HIGH": "LOW", "MODERATE": "MODERATE", "LOW": "HIGH"}
    for step in range(0, 101):
        value = step / 100
        assert uncertainty_band(value) == mirror[reliability_band(value)]
    assert uncertainty_band(.67) == "MODERATE"  # the 59%-completeness case that prompted this
    # HIGH uncertainty and the engine's own low-confidence flag stay the same event.
    assert (uncertainty_band(.64) == "HIGH") and (.64 < 0.65)
    assert uncertainty_band(.65) != "HIGH"


def test_display_block_is_four_ordered_lines() -> None:
    lines = four_lines(.87, .94, .91)
    assert list(lines) == ["deterioration_risk", "prediction_reliability", "data_completeness", "uncertainty"]
    assert [line["display"] for line in lines.values()] == ["87%", "HIGH", "91%", "LOW"]
    assert lines["prediction_reliability"]["raw"] == .94  # the number behind the band stays visible


def test_engine_uncertainty_line_matches_the_stored_assessment() -> None:
    stamp = datetime.now(UTC)
    patient = store("P-BAND", observation(stamp, spo2=89, heart_rate=128), is_new_patient=True)
    assessment = main.calculate(patient)
    line = four_lines(assessment["deterioration_risk"], assessment["prediction_reliability"], assessment["data_completeness"])
    assert (line["uncertainty"]["display"] == "HIGH") == assessment["uncertainty"]["is_low_confidence"]
