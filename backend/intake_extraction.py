"""Deterministic slot filling from a nurse-handoff transcript.

Every value is traced to the words that produced it, and nothing is inferred: a value the nurse did
not speak stays missing, and a spoken value outside its plausible range is reported as heard but
unconfirmed rather than written into the draft. No protocol band, diagnosis, or default is assigned
here — the nurse reviews the draft before anything reaches triage.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

_ONES = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
_MULTIPLIERS = {"hundred": 100, "thousand": 1000}
_NUMBER_TOKENS = sorted(set(_ONES) | set(_TENS) | set(_MULTIPLIERS) | {"and"}, key=len, reverse=True)

_WORD_NUMBER = rf"(?:{'|'.join(_NUMBER_TOKENS)})(?:[\s-]+(?:{'|'.join(_NUMBER_TOKENS)}))*"
_DIGITS = r"\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?"
NUMBER = rf"(?:{_DIGITS}|{_WORD_NUMBER})"
# Nurses speak around the number: "heart rate's running at 132", "BP is", "sats of". Allow a short
# run of non-digits between the label and its value, never long enough to reach the next sentence.
GAP = r"[^0-9\n]{0,20}?"


def parse_number(spoken: str) -> float | None:
    """Parse '118', '82,000', '38.2', 'eighty two thousand' or 'one hundred eighteen'."""
    text = spoken.strip().lower().replace(",", "")
    try:
        return float(text)
    except ValueError:
        pass
    total = current = 0.0
    seen = False
    for token in re.split(r"[\s-]+", text):
        if token == "and" or not token:
            continue
        if token in _ONES:
            current += _ONES[token]
        elif token in _TENS:
            current += _TENS[token]
        elif token == "hundred":
            current = max(current, 1) * 100
        elif token == "thousand":
            total += max(current, 1) * 1000
            current = 0.0
        else:
            return None
        seen = True
    return total + current if seen else None


@dataclass(frozen=True)
class Slot:
    """One value the nurse may speak, with the words that name it and the range it must fall in."""
    name: str
    aliases: tuple[str, ...]
    low: float
    high: float
    units: tuple[str, ...] = ()


VITAL_SLOTS = (
    Slot("heart_rate", ("heart rate", "heart rates", "hr", "pulse", "pulse rate"), 20, 250),
    Slot("spo2", ("oxygen saturation", "o2 saturation", "o2 sat", "o2 sats", "oxygen sats", "spo2", "sp02", "sats", "sat", "saturation"), 50, 100),
    Slot("respiratory_rate", ("respiratory rate", "respiration rate", "resp rate", "resps", "rr", "breathing rate"), 4, 70),
    Slot("temperature_c", ("temperature", "temp"), 25, 113, units=("c", "celsius", "centigrade", "f", "fahrenheit")),
    Slot("gcs", ("gcs", "glasgow coma scale", "glasgow coma score", "glasgow"), 3, 15),
)
_BP_ALIASES = ("blood pressure", "bp", "b p")
_ALL_ALIASES = tuple(alias for slot in VITAL_SLOTS for alias in slot.aliases) + _BP_ALIASES


@dataclass
class Reading:
    """A value plus the spoken words behind it, so a reviewer can check the source, not the guess."""
    value: float | None = None
    evidence: str | None = None
    note: str | None = None
    unconfirmed: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {"value": self.value, "missing": self.value is None, "evidence": self.evidence, "note": self.note}


def _alias_pattern(aliases: tuple[str, ...]) -> str:
    return "|".join(re.escape(alias) for alias in sorted(aliases, key=len, reverse=True))


def _gap_is_clean(gap: str, own_aliases: tuple[str, ...]) -> bool:
    """Reject a match whose gap crosses a sentence or another field's label."""
    if "." in gap:
        return False
    return not any(re.search(rf"\b{re.escape(alias)}\b", gap) for alias in _ALL_ALIASES if alias not in own_aliases)


def _read_slot(slot: Slot, text: str) -> Reading:
    pattern = rf"\b(?:{_alias_pattern(slot.aliases)})\b({GAP})({NUMBER})\s*°?\s*({'|'.join(slot.units)})?\b" if slot.units \
        else rf"\b(?:{_alias_pattern(slot.aliases)})\b({GAP})({NUMBER})\b"
    for found in re.finditer(pattern, text, flags=re.IGNORECASE):
        if not _gap_is_clean(found.group(1), slot.aliases):
            continue
        number = parse_number(found.group(2))
        if number is None:
            continue
        unit = (found.group(3) or "").lower() if slot.units else ""
        evidence = " ".join(found.group(0).split())
        if slot.name == "temperature_c":
            number, note = _to_celsius(number, unit)
            if number is None:
                return Reading(None, evidence, note)
            return Reading(round(number, 1), evidence, note)
        if not slot.low <= number <= slot.high:
            # Whisper mishears digits; an impossible value is surfaced for confirmation, never stored.
            return Reading(None, evidence, f"heard {number:g}, outside the plausible range {slot.low:g}-{slot.high:g}")
        return Reading(number, evidence)
    return Reading()


def _read_trend(slot: Slot, text: str) -> dict[str, Any] | None:
    """Read a spoken trajectory: 'saturation has been falling from 96 to 89'."""
    pattern = rf"\b(?:{_alias_pattern(slot.aliases)})\b([^0-9\n]{{0,40}}?)(?:from\s+)?({NUMBER})\s*(?:down to|up to|to)\s*({NUMBER})\b"
    for found in re.finditer(pattern, text, flags=re.IGNORECASE):
        if not _gap_is_clean(found.group(1), slot.aliases):
            continue
        earlier, later = parse_number(found.group(2)), parse_number(found.group(3))
        if earlier is None or later is None or earlier == later:
            continue
        if not (slot.low <= earlier <= slot.high and slot.low <= later <= slot.high):
            continue
        return {
            "from": earlier, "to": later,
            "direction": "FALLING" if later < earlier else "RISING",
            "evidence": " ".join(found.group(0).split()),
        }
    return None


def _to_celsius(number: float, unit: str) -> tuple[float | None, str | None]:
    """Convert only when the unit is spoken or the value can only be one scale."""
    if unit.startswith("f"):
        return (number - 32) / 1.8, "converted from Fahrenheit"
    if unit.startswith("c") or 25 <= number <= 45:
        return number, None
    if 90 <= number <= 113:  # Ranges do not overlap, so the scale is unambiguous.
        return (number - 32) / 1.8, "no unit spoken; read as Fahrenheit"
    return None, f"heard {number:g}, which is not a plausible body temperature"


def _read_blood_pressure(text: str) -> tuple[Reading, Reading]:
    pattern = rf"\b(?:{_alias_pattern(_BP_ALIASES)})\b({GAP})({NUMBER})\s*(?:over|/|\\|by)\s*({NUMBER})\b"
    for found in re.finditer(pattern, text, flags=re.IGNORECASE):
        if not _gap_is_clean(found.group(1), _BP_ALIASES):
            continue
        systolic, diastolic = parse_number(found.group(2)), parse_number(found.group(3))
        if systolic is None or diastolic is None:
            continue
        evidence = " ".join(found.group(0).split())
        if not (40 <= systolic <= 280 and 20 <= diastolic <= 200 and diastolic < systolic):
            return (Reading(None, evidence, f"heard {systolic:g}/{diastolic:g}, which is not a plausible blood pressure"),) * 2
        return Reading(systolic, evidence), Reading(diastolic, evidence)
    return Reading(), Reading()


def _read_patient_id(text: str) -> Reading:
    """Recover the ID, including the 'ID P-1042' → 'IDP 1042' merge Whisper produces."""
    canonical = re.search(r"\b([A-Z])[-–](\d{3,6})\b", text)
    if canonical:
        return Reading(None, f"{canonical.group(1).upper()}-{canonical.group(2)}")
    merged = re.search(r"\b(?:patient\s+)?id\s*([A-Z])\s*[-–]?\s*(\d{3,6})\b", text, re.IGNORECASE)
    if merged:
        return Reading(None, f"{merged.group(1).upper()}-{merged.group(2)}", "reconstructed from speech; confirm against the wristband")
    loose = re.search(r"\b([A-Z])\s*[-–]?\s*(\d{4})\b", text)
    if loose:
        return Reading(None, f"{loose.group(1).upper()}-{loose.group(2)}", "reconstructed from speech; confirm against the wristband")
    return Reading()


_NEGATION = r"(?:no|not|non|denies|denied|without|negative for|rule[sd]? out|ruling out)"


def _status(term: str, text: str) -> str:
    """Report what was said about a condition: mention alone is never confirmation."""
    if not re.search(rf"\b{term}\b", text, re.IGNORECASE):
        return "NOT_MENTIONED"
    if re.search(rf"\b{_NEGATION}\b[^.]{{0,30}}\b{term}\b", text, re.IGNORECASE):
        return "DENIED"
    if re.search(rf"\b(?:confirmed|known|history of|positive for|diagnosed with)\b[^.]{{0,25}}\b{term}\b", text, re.IGNORECASE) \
            or re.search(rf"\b{term}\b[^.]{{0,20}}\b(?:confirmed|positive)\b", text, re.IGNORECASE):
        return "CONFIRMED"
    if re.search(rf"\b(?:suspected|possible|query|likely|query for|\?)\b[^.]{{0,25}}\b{term}\b", text, re.IGNORECASE):
        return "SUSPECTED"
    return "MENTIONED_UNCLEAR"


_TIME_UNIT = r"(?:hours?|hrs?|minutes?|mins?|days?|weeks?|years?|am|pm|o'clock)"


def _read_platelets(text: str) -> list[int]:
    """Collect the platelet series across every sentence that mentions it, oldest → newest."""
    values: list[int] = []
    for sentence in re.split(r"(?<=\.)\s+", text):
        if not re.search(r"platelets?", sentence, flags=re.IGNORECASE):
            continue
        # "down from 96,000 two hours ago": a number attached to a time unit is not a lab value.
        for found in re.finditer(rf"\b({NUMBER})\s*(thousand|k)?\b(?!\s*{_TIME_UNIT}\b)", sentence, flags=re.IGNORECASE):
            number = parse_number(found.group(1))
            if number is None:
                continue
            if found.group(2) or number < 1000:  # "eighty-two thousand", "82 k", or a spoken "82".
                number *= 1000
            if 1000 <= number <= 1_000_000:
                values.append(int(number))
    # Handoffs state the current value first, then earlier ones; models consume oldest → newest.
    return list(reversed(values))


def _read_arrival_time(text: str) -> Reading:
    """Keep the spoken clock time as spoken. Turning it into a timestamp needs a date and timezone."""
    found = re.search(r"\b(\d{1,2}:\d{2})\s*(a\.?m\.?|p\.?m\.?)?", text, flags=re.IGNORECASE)
    if not found:
        return Reading()
    spoken = " ".join(part for part in found.groups() if part).upper().replace(".", "")
    return Reading(None, spoken, "spoken clock time; confirm the date and timezone")


def _read_allergies(text: str) -> Reading:
    if re.search(r"\bno known (?:drug )?allerg", text, re.IGNORECASE) or re.search(r"\bnkda\b", text, re.IGNORECASE):
        return Reading(None, "NONE_KNOWN")
    named = re.search(r"\ballergic to\s+([a-z ,]+?)(?:\.|,|$)", text, re.IGNORECASE)
    return Reading(None, named.group(1).strip().upper()) if named else Reading()


def extract_intake(transcript: str) -> dict[str, Any]:
    """Build a transparent, review-required draft from facts explicitly present in the transcript."""
    text = " ".join(transcript.split())
    lower = text.lower()
    vitals = {slot.name: _read_slot(slot, lower) for slot in VITAL_SLOTS}
    vitals["systolic_bp"], vitals["diastolic_bp"] = _read_blood_pressure(lower)
    trends = {slot.name: trend for slot in VITAL_SLOTS if (trend := _read_trend(slot, lower))}
    for name, trend in trends.items():
        # A trajectory states the current value as its endpoint. Take it when no value was given, and
        # when the slot scan landed inside the trajectory itself and so read the earlier number.
        reading = vitals[name]
        read_the_earlier_value = reading.evidence is not None and reading.evidence in trend["evidence"]
        if read_the_earlier_value or (reading.value is None and reading.note is None):
            vitals[name] = Reading(trend["to"], trend["evidence"], "current value read from the trajectory the nurse described")
    ordered = ("heart_rate", "systolic_bp", "diastolic_bp", "spo2", "respiratory_rate", "temperature_c", "gcs")

    patient = _read_patient_id(text)
    age = _read_slot(Slot("age", ("year old", "years old", "year-old", "y o", "yo"), 0, 120), lower)
    if age.value is None:  # The label follows the number: "46-year-old female".
        for found in re.finditer(rf"\b({NUMBER})[\s-]*(?:year|yr)s?[\s-]*old\b", lower):
            number = parse_number(found.group(1))
            if number is not None and 0 <= number <= 120:
                age = Reading(number, " ".join(found.group(0).split()))
                break

    dengue = _status("dengue", text)
    tbsa = _read_slot(Slot("tbsa_pct", ("tbsa", "burns", "burn", "body surface area", "bsa"), 0, 100), lower)
    if tbsa.value is None:
        for found in re.finditer(rf"\b({NUMBER})\s*(?:percent|%)\s*(?:tbsa|burn|body surface)", lower):
            number = parse_number(found.group(1))
            if number is not None and 0 <= number <= 100:
                tbsa = Reading(number, " ".join(found.group(0).split()))
                break
    smoke = bool(re.search(r"smoke (?:inhalation|exposure)", lower))
    exposure = _read_slot(Slot("exposure_min", ("smoke exposure", "exposed", "exposure"), 0, 600), lower) if smoke else Reading()
    day_of_illness = _read_slot(Slot("day_of_illness", ("day",), 1, 30), lower) if re.search(r"day[^.]{0,12}of illness|day \d+ of", lower) else Reading()
    allergies = _read_allergies(text)
    platelets = _read_platelets(text)
    arrival_time = _read_arrival_time(text)

    unconfirmed = [
        f"{name}: {reading.note}" for name, reading in
        ({"patient_id": patient, "age": age, "tbsa_pct": tbsa} | {name: vitals[name] for name in ordered}).items()
        if reading.note
    ]
    if patient.evidence is None:
        unconfirmed.append("patient_id: not spoken")
    for name, trend in trends.items():
        unconfirmed.append(f"{name}: earlier reading {trend['from']:g} was spoken without a time; only the order is used")
    if len(platelets) > 1:
        unconfirmed.append("platelet_trend: ordered oldest to newest on the assumption that the current value was spoken first")
    if dengue == "MENTIONED_UNCLEAR":
        unconfirmed.append("dengue: mentioned without a confirmed or denied status")
    unconfirmed.append("protocol_band: assigned by the nurse, never by voice intake")
    unconfirmed.append(f"arrival_time: {arrival_time.note}" if arrival_time.evidence else "arrival_time: not spoken")

    return {
        "transcript": text,
        "extraction_mode": "RULE_BASED_REVIEW_REQUIRED",
        "patient_draft": {
            "patient_id": patient.evidence,
            "patient_id_note": patient.note,
            "age": int(age.value) if age.value is not None else None,
            "sex": "F" if re.search(r"\b(?:female|woman|girl|she|her)\b", lower) else "M" if re.search(r"\b(?:male|man|boy|he|his)\b", lower) else "UNKNOWN",
            "arrival_mode": "AMBULANCE" if re.search(r"\bambulance|\bems\b|paramedic", lower) else "WALK_IN" if "walked in" in lower or "walk-in" in lower else "UNKNOWN",
            "is_new_patient": "new patient" in lower,
            "arrival_time_spoken": arrival_time.evidence,
            "pathways_detected": [name for name, present in {"DENGUE": dengue in {"CONFIRMED", "SUSPECTED"}, "BURN_SMOKE": tbsa.value is not None or smoke}.items() if present],
            "symptoms": {
                "breathlessness": bool(re.search(r"\bbreathless|short(?:ness)? of breath|\bdyspn(?:o?ea|eic)\b", lower)),
                "confusion": bool(re.search(r"\bconfus(?:ed|ion)\b|\baltered mental\b|\bdisorient", lower)),
                "smoke_inhalation_concern": smoke,
            },
            "known_conditions": {"dengue": dengue},
            "pathway_detail": {
                "dengue_status": dengue,
                "day_of_illness": day_of_illness.value,
                "tbsa_pct": tbsa.value,
                "smoke_inhalation": smoke,
                "exposure_duration_min": exposure.value,
                "platelet_trend": platelets,
            },
            "vitals": {name: vitals[name].as_dict() for name in ordered},
            "trends": trends,
            "allergies": allergies.evidence or "UNKNOWN",
        },
        "review_required": True,
        "missing_or_unconfirmed": unconfirmed,
    }
