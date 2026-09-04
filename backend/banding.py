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

    Deriving it keeps this line identical to the engine's own `uncertainty.is_low_confidence`, and
    removes one number the advisory model would otherwise be free to invent.
    """
    return "HIGH" if reliability < CONFIDENCE_THRESHOLD else "LOW"


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
