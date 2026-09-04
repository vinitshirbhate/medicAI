"""Trend features for a patient, from the time-series service when it is reachable.

The time-series service owns observations and their trend maths. When it is unreachable — no
TimescaleDB configured on a demo laptop, or the WAN is down — this module computes the same features
from the triage service's own stored series using that service's own functions, and says which
source produced them. It never silently presents locally derived features as service-derived ones.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import httpx

from time_series_service.features import VITAL_METRICS, vital_features

TIME_SERIES_URL = os.getenv("TIME_SERIES_URL", "http://127.0.0.1:8001")
TIME_SERIES_TIMEOUT_S = float(os.getenv("TIME_SERIES_TIMEOUT_S", "2.0"))
WINDOW_MINUTES = 120


def _flatten(series: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Turn stored `{metric: {value, missing}}` rows into the flat rows features.py expects."""
    rows = []
    for row in series:
        flat: dict[str, Any] = {"observed_at": datetime.fromisoformat(row["observed_at"])}
        for metric in VITAL_METRICS:
            flat[metric] = row.get(metric, {}).get("value")
        rows.append(flat)
    return rows


def _local(patient_id: str, series: list[dict[str, Any]]) -> dict[str, Any]:
    features = vital_features(patient_id, _flatten(series), WINDOW_MINUTES)
    return features.model_dump(mode="json")


def features_for(patient_id: str, series: list[dict[str, Any]], *, transport: Any = None) -> dict[str, Any]:
    """Return trend features plus the source that produced them, never one without the other."""
    try:
        with httpx.Client(timeout=TIME_SERIES_TIMEOUT_S, transport=transport) as client:
            response = client.get(f"{TIME_SERIES_URL}/patients/{patient_id}/features", params={"window_minutes": WINDOW_MINUTES})
        response.raise_for_status()
        payload = response.json()
        if payload.get("quality", {}).get("observation_count"):
            return {"source": "TIME_SERIES_SERVICE", "note": None, **payload}
        # The service is up but holds nothing for this patient; the local series is the better record.
        note = "time-series service holds no observations for this patient; features derived from the triage service's own series"
    except Exception as error:
        note = f"time-series service unavailable ({type(error).__name__}); features derived from the triage service's own series"
    if not series:
        return {"source": "NONE", "note": note, "metrics": {}, "quality": {"observation_count": 0}}
    return {"source": "LOCAL_OBSERVATIONS", "note": note, **_local(patient_id, series)}


def summarise(features: dict[str, Any]) -> dict[str, Any]:
    """Keep only the moving metrics, so the advisory payload carries signal rather than seven nulls."""
    metrics = {
        name: {key: metric[key] for key in ("first", "latest", "change", "slope_per_hour", "observations")}
        for name, metric in features.get("metrics", {}).items()
        if metric.get("observations", 0) >= 2 and metric.get("change") is not None
    }
    quality = features.get("quality", {})
    return {
        "source": features.get("source"),
        "note": features.get("note"),
        "window_minutes": features.get("window_minutes"),
        "moving_metrics": metrics,
        "observation_count": quality.get("observation_count", 0),
        "metrics_with_baseline": quality.get("metrics_with_baseline", []),
        "missing_latest_metrics": quality.get("missing_latest_metrics", []),
    }
