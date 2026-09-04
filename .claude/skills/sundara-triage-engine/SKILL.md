---
name: sundara-triage-engine
description: The ranking, risk, uncertainty, and explainability core of Sundara Command. Use when building or defending the patient ranking, when a judge asks why one patient outranks another, when implementing XGBoost, GRU, SHAP, deep ensembles, calibration, or out-of-distribution detection, when handling low-confidence or unfamiliar patients, or when preparing for the T+8 near-identical-acuity challenge. Defines the lexicographic ranking policy and the rule that confidence gates but never boosts.
license: MIT
metadata:
  suite: sundara-command
  role: technical
---

# Sundara Triage Engine

The part of the system that decides who is seen next — and, more importantly, the part that can
explain why under hostile questioning. Criteria 1, 2 and 3 (55% of the rubric combined) all land
here.

## Where to look

| You need | Open |
|---|---|
| How the rank is produced, and why it is defensible | `references/ranking-policy.md` |
| XGBoost, GRU, features, missingness, training | `references/risk-models.md` |
| Ensembles, calibration, OOD, the equity guard | `references/uncertainty.md` |
| SHAP, one-line rationales, "why not the other patient?" | `references/explainability.md` |

## Two rules govern everything here

**Rule 1 — Lexicographic, not blended.**

> Protocol assigns the acuity band (ESI 1–5, START colours). The AI orders patients **within** a
> band. A patient can never be ranked above a higher band by AI score alone. Band escalation is
> proposed, flagged, and human-confirmable — never silent.

**Rule 2 — Confidence gates, it never boosts.**

> A low-confidence estimate never promotes a patient, never demotes them below their protocol
> band, and routes them to priority human reassessment with the missing information named.

Both exist because the rubric grades *defensibility*, not accuracy. A single blended score cannot
answer "what authority did you override, and on what basis?" These rules can, in one sentence
each. **Learn to state them from memory** — they are the answer to the two hardest judge questions.

## The separation that must survive the whole pipeline

```
deterioration_risk   →   how sick we think this patient is
confidence           →   how much we trust that estimate
```

These are **different quantities** and are never combined into one number, anywhere — not in the
schema, not in the ranking, not on screen. If they are ever multiplied together, criterion 3 (15%)
is lost and the T+8 intervention fails.

Three independent inputs drive confidence, because they answer different questions:

| Input | Question it answers |
|---|---|
| Ensemble disagreement | Do my models agree with each other? |
| OOD distance | Have I seen patients like this before? |
| Data completeness | Do I have enough to go on? |

A system using only one will be confidently wrong in the other two ways.

## Model stack — Tier 1 only

| Task | Model | Purpose |
|---|---|---|
| Structured risk | **XGBoost** + SHAP | Primary tabular risk, with per-feature attribution |
| Trajectory & forecast | **GRU** | Learns the trend, not the snapshot; emits the 2-hour forecast |
| Uncertainty | **Deep ensemble**, 5 members | Disagreement is the signal |
| Calibration | Temperature scaling or isotonic | Makes 87% mean 87% |
| OOD | Mahalanobis or Isolation Forest | Unfamiliar patient profiles |

Clinical text (BioClinicalBERT) is Tier 2 — add only if Tier 1 is demo-stable. Imaging is Tier 3;
do not build it. See `/sundara-architecture` for the topology.

## Design rules carried from the research

Each traces to a documented failure mode in `/sundara-research`. These are not preferences.

1. **Never impute to zero.** Every feature is a `(value, missing)` pair. `Platelets = NULL` and
   `Platelets = 0` are different clinical facts.
2. **SpO₂ never triggers alone** (FM-3, Sjoding et al. 2020). RR, HR and lactate corroborate. A
   *reassuring* SpO₂ with a rising respiratory rate **raises** concern — the discordance is the
   signal.
3. **Predict a clinical outcome, never a proxy** (FM-2, Obermeyer et al. 2019). The label is
   physiological deterioration. Never cost, never length of stay, and never "was this patient
   historically prioritised" — that last one would launder existing triage bias into the model.
4. **Rank, don't alarm** (FM-1, FM-4). A ranked queue degrades gracefully under a mediocre model;
   a binary alarm does not. Enforce an alert budget.
5. **The decision engine is readable policy code, not learned weights.** You must be able to put it
   on screen and walk a clinician through it line by line. A learned ranker would score marginally
   better and be indefensible.

## The T+8 answer — rehearse this verbatim

> "Patient B's risk estimate is higher, but our confidence in it is 58%. We don't promote a patient
> on a number we don't trust, and we don't demote them either. B goes to priority human
> reassessment with the missing data named — no baseline SpO₂, no platelet trend, new patient. The
> correct response to uncertainty about a patient is to look at the patient, not to reorder a queue
> on noise."

That answers *"defensible rather than arbitrary"* head-on: both patients get the same stated
policy applied identically. The difference in outcome comes from the policy, not from a score.

## Guardrail

**Do not tune for accuracy at the cost of explicability.** A model that scores marginally better
but cannot be explained in one line per patient loses more on criterion 2 (20%) than it gains on
criterion 1. When forced to choose, choose the model you can defend at 3 a.m. to a tired doctor.