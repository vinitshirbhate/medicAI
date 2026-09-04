"""Pure, explainable time-series feature extraction."""
from __future__ import annotations

from datetime import datetime, timezone

from shared.contracts import TrendFeatures, TrendMetric, TrendQuality

VITAL_METRICS = (
    "heart_rate", "systolic_bp", "diastolic_bp", "spo2",
    "respiratory_rate", "temperature_c", "gcs",
)


def metric_summary(rows: list[dict], metric: str) -> TrendMetric:
    points = [(row["observed_at"], row[metric]) for row in rows if row[metric] is not None]
    if not points:
        return TrendMetric(latest=None, first=None, minimum=None, maximum=None, change=None, slope_per_hour=None, observations=0)
    first_at, first = points[0]
    latest_at, latest = points[-1]
    change = latest - first if len(points) >= 2 else None
    hours = (latest_at - first_at).total_seconds() / 3600
    slope = round(change / hours, 4) if change is not None and hours > 0 else None
    values = [value for _, value in points]
    return TrendMetric(
        latest=latest,
        first=first,
        minimum=min(values),
        maximum=max(values),
        change=change,
        slope_per_hour=slope,
        observations=len(points),
    )


def vital_features(patient_id: str, rows: list[dict], window_minutes: int) -> TrendFeatures:
    metrics = {metric: metric_summary(rows, metric) for metric in VITAL_METRICS}
    latest_observed_at = rows[-1]["observed_at"] if rows else None
    now = datetime.now(timezone.utc)
    latest_age_seconds = round((now - latest_observed_at).total_seconds(), 1) if latest_observed_at else None
    return TrendFeatures(
        patient_id=patient_id,
        window_minutes=window_minutes,
        metrics=metrics,
        quality=TrendQuality(
            observation_count=len(rows),
            latest_age_seconds=latest_age_seconds,
            missing_latest_metrics=[name for name, metric in metrics.items() if metric.latest is None],
            metrics_with_baseline=[name for name, metric in metrics.items() if metric.observations >= 2],
        ),
    )
