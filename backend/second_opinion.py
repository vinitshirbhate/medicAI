"""An advisory LLM second opinion, held strictly beside the deterministic engine.

The engine alone produces risk and rank. This module asks a hosted model for an independent estimate
from the same inputs, so a reviewer can see whether two systems reading the same patient agree. Its
output is displayed and audited; it never enters `calculate()`, never modifies prediction
reliability, and never reaches the rank key. `main.py` does not import this module's judgement into
any ranking path, and this module does not import `main` at all — the fence is structural.

Everything the model returns is validated before it is shown. An opinion that cites a field which is
not in the payload, a value that does not match the payload, or a number that appears nowhere in the
input is discarded whole, and the panel says why. A clinical estimate is not the place to render a
partially trustworthy answer.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import httpx
from dotenv import load_dotenv

from banding import four_lines, reliability_band, uncertainty_band

PROMPT_VERSION = "so-1"  # Bumping this invalidates every cached opinion.
_loaded_env = False

# A closed vocabulary: the advisory model may name a reliability reason, never invent one.
ALLOWED_REASONS = (
    "New patient; no previous baseline",
    "No prior medical history",
    "No baseline SpO2",
    "No platelet trend",
    "Single observation only; no trend available",
    "Vital signs missing from the latest observation",
    "Observations are stale",
    "Patient profile is unfamiliar",
)

# Rule 7: the advisory model may not invent clinical reasoning, an action, or a band.
FORBIDDEN_NARRATIVE = re.compile(r"\b(band|rank|escalat|triage level|admit|intubat|prescrib|order)\w*", re.IGNORECASE)
NUMBER_IN_TEXT = re.compile(r"\d+(?:\.\d+)?")

OUTPUT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["deterioration_risk", "prediction_reliability", "data_completeness", "narrative", "evidence", "reliability_reasons"],
    "properties": {
        "deterioration_risk": {"type": "number", "minimum": 0, "maximum": 1},
        "prediction_reliability": {"type": "number", "minimum": 0, "maximum": 1},
        "data_completeness": {"type": "number", "minimum": 0, "maximum": 1},
        "narrative": {"type": "string"},
        "evidence": {
            "type": "array", "minItems": 1, "maxItems": 5,
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["field", "stated_value", "quote"],
                "properties": {"field": {"type": "string"}, "stated_value": {"type": "string"}, "quote": {"type": "string"}},
            },
        },
        "reliability_reasons": {"type": "array", "maxItems": 6, "items": {"type": "string", "enum": list(ALLOWED_REASONS)}},
    },
}

SYSTEM_PROMPT = """You are an advisory second reader for a clinical triage demonstration. A deterministic engine has already assessed this patient and owns the decision; your estimate is displayed beside it as an independent check and is never used to rank or prioritise anyone.

Return three probabilities between 0 and 1:
- deterioration_risk: how likely this patient is to deteriorate within two hours.
- prediction_reliability: how much you trust your own estimate given the data you were shown.
- data_completeness: how complete the supplied record is.

Rules you must follow:
- Use only the values present in the input JSON. Never state a number that does not appear there.
- Every evidence item must name a real dotted path into the input, its exact value, and quote an evidence phrase supplied in the input verbatim.
- reliability_reasons must be chosen from allowed_reliability_reasons; return an empty list if none apply.
- Do not mention protocol bands, ranking, escalation, admission, or any treatment or order. Describe observations only.
- Absent information lowers reliability. It never raises risk on its own."""


@dataclass(frozen=True)
class Settings:
    enabled: bool
    api_key: str | None
    model: str
    base_url: str
    timeout_s: float
    max_calls: int
    cache_only: bool


def settings() -> Settings:
    global _loaded_env
    if not _loaded_env:
        load_dotenv(Path(__file__).with_name(".env"))
        _loaded_env = True
    return Settings(
        enabled=os.getenv("SECOND_OPINION_ENABLED", "1") == "1",
        api_key=os.getenv("OPENROUTER_API_KEY"),
        # Cheapest OpenAI model on OpenRouter supporting structured outputs, temperature and seed.
        model=os.getenv("SECOND_OPINION_MODEL", "openai/gpt-4.1-nano"),
        base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        timeout_s=float(os.getenv("SECOND_OPINION_TIMEOUT_S", "20")),
        max_calls=int(os.getenv("SECOND_OPINION_MAX_CALLS_PER_RUN", "50")),
        cache_only=os.getenv("SECOND_OPINION_CACHE_ONLY", "0") == "1",
    )


_calls_made = 0


def canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def fingerprint(payload: dict[str, Any], model: str) -> str:
    digest = hashlib.sha256(canonical({"prompt": PROMPT_VERSION, "model": model, "input": payload}).encode()).hexdigest()
    return f"sha256:{digest}"


def build_payload(patient: dict[str, Any], assessment: dict[str, Any], latest: dict[str, Any],
                  trends: dict[str, Any], intake_draft: dict[str, Any] | None) -> dict[str, Any]:
    """Assemble the advisory input.

    Deliberately withheld: the patient identifier and arrival time (identifiers do not leave the
    hospital), the raw transcript (free text carries identifiers, and re-sending it would hand back
    the values extraction deliberately refused as implausible), and every engine conclusion — an
    anchored second opinion produces a divergence signal worth nothing.
    """
    draft = intake_draft or {}
    detail = patient.get("pathway_detail") or {}
    observation = {
        name: {"value": reading.get("value"), "missing": reading.get("missing", reading.get("value") is None),
               "evidence": (draft.get("vitals", {}).get(name) or {}).get("evidence")}
        for name, reading in latest.items() if isinstance(reading, dict) and "value" in reading
    }
    return {
        "schema": "sundara.second_opinion.input/1",
        "patient": {
            "age": patient.get("age"), "sex": patient.get("sex"), "arrival_mode": patient.get("arrival_mode"),
            "is_new_patient": patient.get("is_new_patient"), "pathway": patient.get("pathway"),
            "symptoms": patient.get("symptoms") or {}, "known_conditions": patient.get("known_conditions") or {},
            "allergies": draft.get("allergies", "UNKNOWN"),
        },
        "record_history": {
            "is_new_patient": patient.get("is_new_patient"),
            "previous_records_available": not patient.get("is_new_patient"),
            "observations_recorded": assessment.get("observations_used", 0),
        },
        "pathway_detail": {
            "dengue_status": detail.get("dengue_status"), "day_of_illness": detail.get("day_of_illness"),
            "tbsa_pct": detail.get("tbsa_pct"), "smoke_inhalation": detail.get("smoke_inhalation"),
            "exposure_duration_min": detail.get("exposure_duration_min"),
            "platelet_trend": detail.get("platelet_trend") or [],
        },
        "current_observation": observation,
        "trend_features": trends,
        "completeness_inputs": assessment.get("completeness_breakdown", {}),
        "named_gaps": assessment.get("uncertainty", {}).get("reasons", []),
        "allowed_reliability_reasons": list(ALLOWED_REASONS),
        "engine_thresholds": {"confidence_threshold": .65, "escalation_confidence_threshold": .80},
    }


def _numbers_in(value: Any, found: set[float]) -> None:
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        found.add(float(value))
    elif isinstance(value, dict):
        for item in value.values():
            _numbers_in(item, found)
    elif isinstance(value, (list, tuple)):
        for item in value:
            _numbers_in(item, found)


def _allowed_numbers(payload: dict[str, Any]) -> set[float]:
    found: set[float] = set()
    _numbers_in(payload, found)
    # A model may legitimately say "89%" for a value stored as 89, or 0.89.
    return found | {round(value) for value in found} | {value * 100 for value in found}


def _quote_corpus(payload: dict[str, Any]) -> list[str]:
    return [reading["evidence"].lower() for reading in payload.get("current_observation", {}).values()
            if isinstance(reading, dict) and reading.get("evidence")]


def resolve(payload: dict[str, Any], path: str) -> tuple[Any, bool]:
    current: Any = payload
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return None, False
    return current, True


def _same_value(stated: str, actual: Any) -> bool:
    try:
        return abs(float(stated) - float(actual)) < 1e-9
    except (TypeError, ValueError):
        return str(stated).strip().lower() == str(actual).strip().lower()


def validate_opinion(raw: Any, payload: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str]]:
    """Accept an opinion only if every part of it is traceable to the input. Pure; no I/O."""
    rejections: list[str] = []
    if not isinstance(raw, dict):
        return None, ["model output was not a JSON object"]
    unexpected = set(raw) - set(OUTPUT_SCHEMA["properties"])
    if unexpected:
        rejections.append(f"unexpected fields: {', '.join(sorted(unexpected))}")

    numbers: dict[str, float] = {}
    for name in ("deterioration_risk", "prediction_reliability", "data_completeness"):
        value = raw.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            rejections.append(f"{name} is not a number")
            continue
        if not -0.001 <= value <= 1.001:
            # A model returning 87 for 87% is broken, not slightly off; clamping would render garbage.
            rejections.append(f"{name} is {value:g}, outside 0-1")
            continue
        numbers[name] = round(min(max(float(value), 0.0), 1.0), 2)

    narrative = raw.get("narrative")
    if not isinstance(narrative, str) or not 1 <= len(narrative) <= 400:
        rejections.append("narrative is missing or not 1-400 characters")
        narrative = ""
    elif FORBIDDEN_NARRATIVE.search(narrative):
        rejections.append("narrative refers to ranking, banding, or treatment, which the advisory model may not do")

    evidence = raw.get("evidence")
    if not isinstance(evidence, list) or not 1 <= len(evidence) <= 5:
        rejections.append("evidence must be a list of 1-5 items")
        evidence = []
    corpus = _quote_corpus(payload)
    for index, item in enumerate(evidence):
        if not isinstance(item, dict) or not {"field", "stated_value", "quote"} <= set(item):
            rejections.append(f"evidence[{index}] is malformed")
            continue
        actual, found = resolve(payload, str(item["field"]))
        if not found:
            rejections.append(f"evidence[{index}] cites '{item['field']}', which is not in the input")
            continue
        if not _same_value(str(item["stated_value"]), actual):
            rejections.append(f"evidence[{index}] states '{item['stated_value']}' for {item['field']}, which holds {actual}")
        quote = str(item["quote"]).strip().lower()
        if quote and not any(quote in phrase or phrase in quote for phrase in corpus):
            rejections.append(f"evidence[{index}] quotes '{item['quote']}', which was not supplied in the input")

    reasons = raw.get("reliability_reasons", [])
    if not isinstance(reasons, list):
        rejections.append("reliability_reasons is not a list")
        reasons = []
    for reason in reasons:
        if reason not in ALLOWED_REASONS:
            rejections.append(f"reliability reason '{reason}' is not in the allowed vocabulary")

    # The invented-vitals check: every number the model wrote must exist in what it was shown.
    allowed = _allowed_numbers(payload) | {round(value * 100) for value in numbers.values()} | set(numbers.values())
    spoken = [narrative] + [str(item.get("stated_value", "")) for item in evidence if isinstance(item, dict)] + [str(r) for r in reasons]
    for text in spoken:
        for token in NUMBER_IN_TEXT.findall(text):
            value = float(token)
            if not any(abs(value - candidate) < 1e-6 for candidate in allowed):
                rejections.append(f"cites {token}, which is not present in the input")

    if rejections:
        return None, rejections
    return {**numbers, "narrative": narrative, "evidence": evidence, "reliability_reasons": reasons}, []


DIVERGENCE_RISK_PP = 15  # Tuned for this demo, not derived from a standard.


def divergence(engine: dict[str, Any], opinion: dict[str, Any] | None) -> dict[str, Any]:
    """Compare the two columns. Display and audit only: this never re-enters the assessment."""
    if opinion is None:
        return {"status": "NOT_COMPARABLE", "affects_rank": False, "affects_prediction_reliability": False}
    risk_delta = round((engine["deterioration_risk"] - opinion["deterioration_risk"]) * 100)
    completeness_delta = round((engine["data_completeness"] - opinion["data_completeness"]) * 100)
    reliability_match = reliability_band(engine["prediction_reliability"]) == reliability_band(opinion["prediction_reliability"])
    uncertainty_match = uncertainty_band(engine["prediction_reliability"]) == uncertainty_band(opinion["prediction_reliability"])
    differing = []
    if abs(risk_delta) >= DIVERGENCE_RISK_PP:
        differing.append("deterioration_risk")
    if not reliability_match:
        differing.append("prediction_reliability")
    if not uncertainty_match:
        differing.append("uncertainty")
    status = "DIVERGE" if differing else "AGREE"
    banner = ""
    if status == "DIVERGE":
        parts = []
        if "deterioration_risk" in differing:
            parts.append(f"risk differs by {abs(risk_delta)} points (engine {round(engine['deterioration_risk'] * 100)}%, advisory {round(opinion['deterioration_risk'] * 100)}%)")
        if "prediction_reliability" in differing:
            parts.append(f"reliability bands differ (engine {reliability_band(engine['prediction_reliability'])}, advisory {reliability_band(opinion['prediction_reliability'])})")
        if "uncertainty" in differing:
            parts.append("uncertainty bands differ")
        banner = ("The two readings disagree: " + "; ".join(parts) +
                  ". The engine's number is the one that ranks this patient. This disagreement is recorded in the audit trail and changes nothing in the queue.")
    return {
        "status": status, "risk_delta_pp": risk_delta, "completeness_delta_pp": completeness_delta,
        "reliability_band_match": reliability_match, "uncertainty_band_match": uncertainty_match,
        "threshold_pp": DIVERGENCE_RISK_PP, "differing_lines": differing, "banner": banner,
        "affects_rank": False, "affects_prediction_reliability": False,
    }


def cache_get(connect: Callable[[], sqlite3.Connection] | None, key: str) -> dict[str, Any] | None:
    if connect is None:
        return None
    with connect() as c:
        row = c.execute("SELECT payload FROM second_opinions WHERE fingerprint=?", (key,)).fetchone()
    return json.loads(row["payload"]) if row else None


def cache_put(connect: Callable[[], sqlite3.Connection] | None, key: str, patient_id: str, model: str, value: dict[str, Any]) -> None:
    if connect is None:
        return
    with connect() as c:
        c.execute("INSERT OR REPLACE INTO second_opinions VALUES(?,?,?,?,?)",
                  (key, patient_id, model, canonical(value), value.get("generated_at", "")))


def call_openrouter(payload: dict[str, Any], cfg: Settings, transport: Any = None) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """The only function here that touches the network. Returns (parsed_json, metadata)."""
    global _calls_made
    if _calls_made >= cfg.max_calls:
        return None, {"reason_code": "CALL_BUDGET_EXHAUSTED", "message": f"Second opinion call budget of {cfg.max_calls} reached for this session."}
    body = {
        "model": cfg.model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                     {"role": "user", "content": json.dumps(payload, separators=(",", ":"), default=str)}],
        "temperature": 0, "top_p": 1, "seed": 42, "max_tokens": 700,
        "response_format": {"type": "json_schema", "json_schema": {"name": "sundara_second_opinion", "strict": True, "schema": OUTPUT_SCHEMA}},
        # Without this, OpenRouter may route to a provider that silently drops the schema.
        "provider": {"require_parameters": True},
    }
    started = time.monotonic()
    try:
        with httpx.Client(timeout=cfg.timeout_s, transport=transport) as client:
            response = client.post(f"{cfg.base_url}/chat/completions", json=body,
                                   headers={"Authorization": f"Bearer {cfg.api_key}", "Content-Type": "application/json"})
    except httpx.TimeoutException:
        return None, {"reason_code": "TIMEOUT", "message": f"Second opinion timed out after {cfg.timeout_s:g} s."}
    except Exception as error:
        return None, {"reason_code": "NETWORK_UNAVAILABLE", "message": f"Second opinion unavailable - model service unreachable ({type(error).__name__})."}
    _calls_made += 1
    latency_ms = round((time.monotonic() - started) * 1000)
    if response.status_code >= 400:
        return None, {"reason_code": "UPSTREAM_ERROR", "http_status": response.status_code,
                      "message": f"Second opinion unavailable - model provider returned {response.status_code}.",
                      "detail": [response.text[:300]], "latency_ms": latency_ms}
    try:
        envelope = response.json()
        content = envelope["choices"][0]["message"]["content"]
        parsed = json.loads(content) if isinstance(content, str) else content
    except Exception:
        return None, {"reason_code": "MODEL_OUTPUT_MALFORMED", "message": "Second opinion discarded - model returned unreadable output.", "latency_ms": latency_ms}
    return parsed, {"latency_ms": latency_ms, "usage": envelope.get("usage", {})}


def _degraded(reason_code: str, message: str, detail: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    return {"reason_code": reason_code, "message": message, "detail": detail or [], **extra}


def run_second_opinion(*, patient: dict[str, Any], assessment: dict[str, Any], latest: dict[str, Any],
                       trends: dict[str, Any], intake_draft: dict[str, Any] | None,
                       connect: Callable[[], sqlite3.Connection] | None = None,
                       transport: Any = None, force_refresh: bool = False, generated_at: str = "") -> dict[str, Any]:
    """Produce the side-by-side block. Degradation is data, never an exception."""
    cfg = settings()
    engine = {
        "deterioration_risk": assessment["deterioration_risk"],
        "prediction_reliability": assessment["prediction_reliability"],
        "data_completeness": assessment["data_completeness"],
        "uncertainty": uncertainty_band(assessment["prediction_reliability"]),
        "display": four_lines(assessment["deterioration_risk"], assessment["prediction_reliability"], assessment["data_completeness"]),
        "reasons": assessment.get("uncertainty", {}).get("reasons", []),
        "one_line": assessment.get("explanation", {}).get("one_line", ""),
        "model_version": assessment.get("model_version"),
    }
    payload = build_payload(patient, assessment, latest, trends, intake_draft)
    key = fingerprint(payload, cfg.model)
    base = {
        "patient_id": patient["patient_id"], "generated_at": generated_at, "engine": engine,
        "trend_source": trends.get("source"), "trend_note": trends.get("note"),
        "authority": {
            "ranking_source": "SUNDARA_TRIAGE_ENGINE", "second_opinion_role": "ADVISORY_ONLY",
            "statement": "The deterministic engine alone produces risk and rank. This advisory reading is not used in ranking and cannot escalate a protocol band.",
        },
    }

    def degraded(info: dict[str, Any]) -> dict[str, Any]:
        return {**base, "status": "DEGRADED", "second_opinion": {"available": False, "payload_fingerprint": key},
                "divergence": divergence(engine, None), "degraded": info}

    if not cfg.enabled:
        return degraded(_degraded("DISABLED", "Second opinion disabled (kill switch). Engine assessment stands alone."))
    if not cfg.api_key:
        return degraded(_degraded("NO_API_KEY", "Second opinion unavailable - no model credential configured."))

    cached = None if force_refresh else cache_get(connect, key)
    if cached is None and cfg.cache_only:
        return degraded(_degraded("CACHE_ONLY_MISS", "Offline demo mode - no cached second opinion for this input."))

    if cached is not None:
        opinion, meta = cached["opinion"], {**cached.get("meta", {}), "cached": True}
        generated_at = cached.get("generated_at", generated_at)
    else:
        raw, meta = call_openrouter(payload, cfg, transport=transport)
        if raw is None:
            return degraded(_degraded(meta.get("reason_code", "UPSTREAM_ERROR"), meta.get("message", "Second opinion unavailable."), meta.get("detail")))
        opinion, rejections = validate_opinion(raw, payload)
        if opinion is None:
            return degraded(_degraded("MODEL_OUTPUT_REJECTED",
                                      "Second opinion discarded - it cited information not present in the intake. Engine assessment stands alone.",
                                      rejections))
        meta = {**meta, "cached": False}
        cache_put(connect, key, patient["patient_id"], cfg.model,
                  {"opinion": opinion, "meta": meta, "generated_at": generated_at})

    return {
        **base, "status": "OK",
        "second_opinion": {
            "available": True, **opinion,
            "uncertainty": uncertainty_band(opinion["prediction_reliability"]),
            "display": four_lines(opinion["deterioration_risk"], opinion["prediction_reliability"], opinion["data_completeness"]),
            "provider": "openrouter", "advisory_model_id": cfg.model, "prompt_version": PROMPT_VERSION,
            "payload_fingerprint": key, "forced": force_refresh, **meta,
        },
        "divergence": divergence(engine, opinion),
        "degraded": None,
    }
