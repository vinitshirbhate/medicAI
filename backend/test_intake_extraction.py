"""Extraction contract tests: real handoff phrasings, and the values that must never be invented."""
from __future__ import annotations

import pytest

from intake_extraction import extract_intake, parse_number


def draft(transcript: str) -> dict:
    return extract_intake(transcript)["patient_draft"]


def vitals(transcript: str) -> dict:
    return {name: reading["value"] for name, reading in draft(transcript)["vitals"].items()}


@pytest.mark.parametrize(("spoken", "expected"), [
    ("118", 118), ("82,000", 82000), ("38.2", 38.2), ("forty-six", 46),
    ("eighty two thousand", 82000), ("one hundred eighteen", 118), ("ninety six", 96),
])
def test_parse_number(spoken: str, expected: float) -> None:
    assert parse_number(spoken) == expected


def test_abbreviations_and_slash_blood_pressure() -> None:
    assert vitals("Patient P-2201, HR of 110, BP 88/54, SpO2 of 89%, RR 28.") | {} == {
        "heart_rate": 110, "systolic_bp": 88, "diastolic_bp": 54, "spo2": 89,
        "respiratory_rate": 28, "temperature_c": None, "gcs": None,
    }


def test_conversational_filler_between_label_and_value() -> None:
    read = vitals("Her heart rate's running at 132, blood pressure is 84 over 52, oxygen saturation of 88, respiratory rate of 32.")
    assert (read["heart_rate"], read["systolic_bp"], read["diastolic_bp"], read["spo2"], read["respiratory_rate"]) == (132, 84, 52, 88, 32)


def test_spoken_shorthand() -> None:
    read = vitals("BP is 96 over 60, pulse 118, sats 94 percent on room air, resp rate 24, temp 38.2. GCS 15.")
    assert read == {"heart_rate": 118, "systolic_bp": 96, "diastolic_bp": 60, "spo2": 94,
                    "respiratory_rate": 24, "temperature_c": 38.2, "gcs": 15}


def test_fahrenheit_is_converted_and_labelled() -> None:
    temperature = draft("Temp 101.4 Fahrenheit.")["vitals"]["temperature_c"]
    assert temperature["value"] == 38.6
    assert "Fahrenheit" in temperature["note"]
    # An unlabelled 101.4 can only be Fahrenheit, and the reading says so.
    assert draft("Temperature 101.4.")["vitals"]["temperature_c"]["value"] == 38.6


def test_spoken_numbers() -> None:
    read = vitals("Heart rate one hundred eighteen, respiratory rate twenty four, oxygen saturation ninety four.")
    assert (read["heart_rate"], read["respiratory_rate"], read["spo2"]) == (118, 24, 94)


def test_implausible_value_is_reported_not_stored() -> None:
    reading = draft("Heart rate 1180.")["vitals"]["heart_rate"]
    assert reading["value"] is None and reading["missing"] is True
    assert "outside the plausible range" in reading["note"]


def test_every_value_carries_its_evidence() -> None:
    reading = draft("Pulse 118.")["vitals"]["heart_rate"]
    assert reading["value"] == 118 and reading["evidence"] == "pulse 118"


def test_unspoken_vitals_stay_missing() -> None:
    read = vitals("New patient P-1042, 46 year old female.")
    assert set(read.values()) == {None}


def test_gap_does_not_borrow_the_next_fields_number() -> None:
    # Heart rate was not given a value; it must not absorb the blood pressure reading.
    read = vitals("Heart rate not recorded. Blood pressure 96 over 60.")
    assert read["heart_rate"] is None and read["systolic_bp"] == 96


def test_dengue_negation_is_not_confirmation() -> None:
    assert draft("No history of dengue.")["known_conditions"]["dengue"] == "DENIED"
    assert draft("Day 5 of illness with a history of dengue.")["known_conditions"]["dengue"] == "CONFIRMED"
    assert draft("Suspected dengue.")["known_conditions"]["dengue"] == "SUSPECTED"
    assert draft("Chest pain, no fever.")["known_conditions"]["dengue"] == "NOT_MENTIONED"


def test_denied_dengue_does_not_open_the_pathway() -> None:
    assert draft("No history of dengue. Heart rate 88.")["pathways_detected"] == []


def test_patient_id_forms() -> None:
    assert draft("New patient P-1042.")["patient_id"] == "P-1042"
    # Whisper merges "ID P-1042" into "IDP 1042"; recovered, but flagged for confirmation.
    recovered = draft("New patient, IDP 1042 46-year-old female.")
    assert recovered["patient_id"] == "P-1042" and "confirm" in recovered["patient_id_note"]
    assert draft("Forty six year old female.")["patient_id"] is None


def test_platelet_trend_is_oldest_to_newest() -> None:
    detail = draft("Platelet count 64,000, down from 82,000 and 110,000 yesterday.")["pathway_detail"]
    assert detail["platelet_trend"] == [110000, 82000, 64000]
    assert draft("Platelet count is eighty two thousand.")["pathway_detail"]["platelet_trend"] == [82000]


def test_burn_pathway() -> None:
    detail = draft("Approximately 25 percent TBSA burns with smoke exposure for about 15 minutes.")["pathway_detail"]
    assert detail["tbsa_pct"] == 25 and detail["smoke_inhalation"] is True and detail["exposure_duration_min"] == 15


def test_allergies() -> None:
    assert draft("No known drug allergies.")["allergies"] == "NONE_KNOWN"
    assert draft("Allergic to penicillin.")["allergies"] == "PENICILLIN"
    assert draft("Heart rate 88.")["allergies"] == "UNKNOWN"


def test_protocol_band_is_never_assigned() -> None:
    result = extract_intake("Patient P-1042, 46 year old female, heart rate 118, GCS 15.")
    assert result["review_required"] is True
    assert any("protocol_band" in item for item in result["missing_or_unconfirmed"])
    assert "protocol_band" not in result["patient_draft"]


def test_time_reference_is_not_a_platelet_value() -> None:
    detail = draft("Her platelet count is 82,000, down from 96,000 two hours ago. Previous platelet count was 110,000.")["pathway_detail"]
    assert detail["platelet_trend"] == [110000, 96000, 82000]


def test_spoken_arrival_time_is_kept_as_spoken() -> None:
    result = extract_intake("New patient, arrived by ambulance at 7:58 PM.")
    assert result["patient_draft"]["arrival_time_spoken"] == "7:58 PM"
    assert any("confirm the date and timezone" in item for item in result["missing_or_unconfirmed"])
    assert draft("New patient P-1042.")["arrival_time_spoken"] is None
