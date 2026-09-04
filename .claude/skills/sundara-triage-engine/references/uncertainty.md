# Uncertainty — Ensembles, Calibration, OOD, Equity

Criterion 3 (15%) and the T+8 intervention live here. This is also where most teams have nothing
beyond a number labelled "confidence" with no mechanism behind it.

---

## 1. Three independent sources of doubt

They answer different questions, and a system using only one will be confidently wrong in the
other two ways.

| Source | Question | Mechanism |
|---|---|---|
| **Ensemble disagreement** | Do my models agree? | 5-member deep ensemble; spread |
| **Distributional distance** | Have I seen patients like this? | Mahalanobis / Isolation Forest |
| **Data completeness** | Do I have enough to go on? | Per-category completeness score |

```python
def confidence(p) -> float:
    return combine(
        1.0 - normalise(p.ensemble_spread),
        1.0 - normalise(p.ood_distance),
        p.data_completeness,
    )
```

Keep `combine` simple and monotone — a minimum or a weighted mean. You will have to explain it.

---

## 2. Deep ensemble

```python
ENSEMBLE = [train_model(seed=s) for s in range(5)]

def predict(features):
    preds = np.array([m.predict_proba(features)[:, 1] for m in ENSEMBLE])
    return preds.mean(axis=0), preds.std(axis=0)   # risk, disagreement
```

Five members trained with different seeds and bootstrap samples. Worked example:

```
Model 1  82%      Mean    85.2%   ->  risk
Model 2  91%      Spread   4.1pp  ->  high confidence
Model 3  86%
Model 4  80%
Model 5  87%
```

versus a patient with sparse data:

```
Model 1  61%      Mean    84.0%   ->  risk
Model 2  95%      Spread  14.8pp  ->  LOW confidence
Model 3  78%
Model 4  97%
Model 5  89%
```

**Same mean risk, completely different trustworthiness.** This is the clearest possible illustration
of why risk and confidence must be separate outputs — and it is worth showing on screen at T+8,
because it makes the abstraction concrete in about four seconds.

Deep ensembles are the right MVP choice: no architectural change, trivially parallel, and the
uncertainty signal is easy to explain to a non-ML audience. MC dropout or a Bayesian approach would
be defensible but harder to justify quickly.

---

## 3. Calibration

Raw model probabilities are not probabilities. If the interface says 87%, roughly 87 of 100 such
patients should deteriorate — otherwise the number is misleading clinicians.

```python
from sklearn.calibration import CalibratedClassifierCV
calibrated = CalibratedClassifierCV(base, method="isotonic", cv="prefit").fit(X_cal, y_cal)
```

- **Isotonic** with enough calibration data; **temperature scaling** ("sigmoid"/Platt) when data is
  scarce — isotonic overfits on small sets.
- **Calibrate on held-out data**, never on the training set.
- Produce a **reliability diagram** and put it in the model card.

> **Judge-facing line:** "We calibrated because an uncalibrated 87% isn't 87% of anything. If a
> clinician is going to act on that number, it has to mean what it says."

That sentence signals ML maturity in one line. Very few hackathon teams calibrate at all.

---

## 4. Out-of-distribution detection

```python
from sklearn.ensemble import IsolationForest
ood = IsolationForest(contamination=0.02, random_state=SEED).fit(X_train)
is_unfamiliar = ood.predict(X_new) == -1
```

Mahalanobis distance to the training distribution is the alternative and gives a continuous
distance rather than a binary flag — preferable if you have time.

When triggered:

```
⚠ UNFAMILIAR PATIENT PROFILE

Model confidence reduced.

Reason: patient characteristics differ significantly
        from the training population.

Recommended: clinical review required.
```

**The demo case:** a severe paediatric burn with smoke inhalation, against a model trained mostly
on adult dengue. The system lowers its own confidence *unprompted* — the cleanest possible
demonstration of the theme. The AI makes the first move toward acknowledging its own limits.

This also mitigates FM-5 (dataset shift): tonight's compounding scenario **is** a distribution
shift, and a system that cannot notice that is exactly the system the literature warns about.

---

## 5. Naming the reasons — do not show a bare number

A confidence score with no explanation is not usable. FR-24 requires named reasons:

```python
def name_missing_information(p) -> list[str]:
    reasons = []
    if p.is_new_patient:                  reasons.append("New patient - no prior records")
    if p.missing("baseline_spo2"):        reasons.append("No baseline SpO2 for comparison")
    if p.missing("platelet_trend"):       reasons.append("No platelet trend - single value only")
    if p.missing("history"):              reasons.append("Medical history unknown")
    if p.labs_stale_minutes > 60:         reasons.append(f"Labs {p.labs_stale_minutes} min old")
    if p.ood_flag:                        reasons.append("Patient profile unlike training population")
    if p.ensemble_spread > SPREAD_HIGH:   reasons.append("Models disagree on this patient")
    return reasons
```

For T+8 Patient B this produces exactly the display the case describes:

```
Risk estimate: 86%
Confidence:    58%   ⚠ HIGH UNCERTAINTY

Reasons:
  - New patient - no prior records
  - No baseline SpO2 for comparison
  - No platelet trend - single value only
  - Medical history unknown

Action: Priority clinical reassessment
        and additional data collection
```

**Each reason is actionable.** "No platelet trend" tells the clinician what to order. That turns
uncertainty from an apology into a task — which is what a clinician actually needs.

---

## 6. The Risk × Confidence quadrant

The visual that makes the abstraction land instantly.

```
              HIGH CONFIDENCE
                     │
   Act on rank       │      ACT NOW
   (low risk,        │      (high risk,
    trusted)         │       trusted)
                     │
 ────────────────────┼──────────────────── HIGH RISK →
                     │
   Monitor           │      ⚠ REASSESS
   (low risk,        │      (high risk,
    untrusted)       │       untrusted)
                     │        ← Patient B
              LOW CONFIDENCE
```

Each quadrant carries **its own action policy**, not just a colour. Patient B lands in the
bottom-right, and the panel states the policy: *priority human reassessment, do not reorder*.

Judges remember quadrants. This is a two-hour build that pays for itself in the T+8 answer.

---

## 7. The equity guard

Live subgroup panel showing where training support is thin:

```python
def equity_check(p) -> EquityFlag | None:
    cohort = classify_cohort(p)   # e.g. paediatric_burn, elderly_dengue, unknown_history
    support = TRAINING_SUPPORT[cohort]
    if support < MIN_SUPPORT:
        return EquityFlag(
            cohort=cohort,
            n_training=support,
            action="WIDEN_INTERVALS_AND_FLAG_FOR_REVIEW",
        )
    return None
```

Thin-support cohorts get widened confidence intervals automatically and are flagged for mandatory
human review. Subgroup performance is reported **alongside** aggregate performance, never instead
of it — following Obermeyer et al. (2019), an aggregate metric can look excellent while a subgroup
is failed badly.

This is the running mechanism behind the position paper (`/sundara-research`), which turns a
written commitment into something visible on screen.

---

## 8. Thresholds — tune, then justify

| Constant | Starting value | Justification to give |
|---|---|---|
| `CONFIDENCE_THRESHOLD` | 0.65 | Below this, a risk estimate should not drive ordering |
| `SPREAD_HIGH` | 0.10 | Ensemble disagreement above 10pp is material |
| `ESCALATION_CONFIDENCE_THRESHOLD` | 0.80 | Never propose an escalation we are unsure of |
| `MIN_SUPPORT` | 200 | Below this, subgroup performance is not estimable |

**Be honest that these are tuned, not derived.** The right answer to "why 0.65?" is:

> "It's tuned on our synthetic cohort to the point where the reassessment queue stays manageable.
> In deployment this is a parameter the Clinical AI Safety Committee sets and reviews against
> observed override rates — it's a clinical policy decision, not an engineering one."

That is a much stronger answer than a fabricated derivation, and it hands a governance question a
governance answer.