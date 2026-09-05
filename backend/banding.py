"""Display bands shared by the triage engine and the advisory model.

Both panels band through this module, so two columns on screen can never disagree because of a
threshold that drifted in one of them. The thresholds are the ones the project already documents in
`uncertainty.md`; they are tuned on a synthetic cohort, not derived, and in deployment they are a
Clinical AI Safety Committee parameter rather than an engineering one.
"""
from __future__ import annotations

CONFIDENCE_THRESHOLD = .65  # Below this, a risk estimate should not drive ordering.
ESCALATION_CONFIDENCE_THRESHOLD = .80  # Never propose an escalation we are unsure of.


def reliability_band(reliability: float) -> str:
    if reliability >= ESCALATION_CONFIDENCE_THRESHOLD:
        return "HIGH"
    return "MODERATE" if reliability >= CONFIDENCE_THRESHOLD else "LOW"


def uncertainty_band(reliability: float) -> str:
    """Uncertainty is the inverse of reliability, never a separately proposed quantity.

    It mirrors `reliability_band` cut for cut. A two-band uncertainty against a three-band
    reliability made the whole MODERATE range read as "reliability MODERATE / uncertainty LOW",
    which a clinician reads as a contradiction. `is_low_confidence` remains the .65 crossing, so
    HIGH uncertainty and low confidence stay the same event.
    """
    if reliability >= ESCALATION_CONFIDENCE_THRESHOLD:
        return "LOW"
    return "MODERATE" if reliability >= CONFIDENCE_THRESHOLD else "HIGH"


def percent(value: float) -> str:
    return f"{round(value * 100)}%"


def four_lines(risk: float, reliability: float, completeness: float) -> dict[str, dict[str, object]]:
    """The four display rows, in fixed order, so both columns stay row-aligned.

    Risk and reliability stay separate quantities throughout; they are never combined into one
    displayed number.
    """
    return {
        "deterioration_risk": {"label": "Deterioration Risk", "display": percent(risk), "raw": round(risk, 2)},
        "prediction_reliability": {"label": "Prediction Reliability", "display": reliability_band(reliability), "raw": round(reliability, 2)},
        "data_completeness": {"label": "Data Completeness", "display": percent(completeness), "raw": round(completeness, 2)},
        "uncertainty": {"label": "Uncertainty", "display": uncertainty_band(reliability), "raw": round(reliability, 2)},
    }
