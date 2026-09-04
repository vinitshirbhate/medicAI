# Rubric Map — What Actually Earns Points

## ⚠ Your source materials contain two different rubrics

| Source | Criteria |
|---|---|
| **Case study PDF (Section 8)** | Clinical relevance & proactive capability **20%** · Explainability & defensibility of triage rationale, live stress test **20%** · Handling of uncertainty & underrepresented-patient risk **15%** · Realism of staffing/resource plan given transit strike **15%** · Governance & accountability design **15%** · Presentation, demo quality, storytelling **15%** |
| Team conversation notes | Innovation 15% · Business Fit 20% · UX 10% · Presentation & Story 15% · Working Demo 40% |

**The PDF governs.** It is the official case document and its criteria are specific to this case;
the conversation rubric is a generic hackathon sheet. Confirm with organisers if you can.

**Practical relief: both point the same direction.** A live, explainable, uncertainty-aware demo
scores at the top of either sheet. The one real difference is emphasis — the PDF rewards
*governance* and *staffing realism* as first-class criteria (30% combined) where the generic sheet
folds them into "Business Fit". So: **do not treat governance as a slide. Build it.**

---

## Criterion → owning skill → evidence a judge can see

### 1. Clinical relevance and proactive capability — 20%
**Owner:** `/sundara-triage-engine`, `/sundara-research`

This is where "AI makes the first move" is graded. Reactive scoring of current vitals scores
poorly here no matter how accurate it is.

- 2-hour deterioration forecast with a visible trajectory (Moderate → High → Critical)
- Queue re-ranks and alerts before a clinician opens the screen — timestamps prove it
- Pre-emptive resource hold on the last ICU bed
- Clinical pathways that a doctor recognises: WHO dengue warning signs, ABA burn criteria,
  airway risk in smoke inhalation. Generic "acuity score" reads as non-clinical.

### 2. Explainability and defensibility of triage rationale — 20%
**Owner:** `/sundara-triage-engine`, `/sundara-demo`

Graded **live, under challenge**. The single highest-leverage criterion, because it is tested
adversarially and most teams have only a SHAP bar chart.

- One-line rationale on every ranked patient, always visible — not behind a click
- SHAP contributions with clinical names, not feature names
- **"Why not the other patient?"** — the marginal reason A outranks B. This is the answer to the
  question that actually gets asked.
- The lexicographic ranking policy: protocol sets the band, AI orders within it. This is what makes
  the ranking *defensible* rather than merely *explained* — you can state the authority boundary.

### 3. Uncertainty and underrepresented-patient risk — 15%
**Owner:** `/sundara-triage-engine`, `/sundara-research`

Tested directly at T+8.

- Risk and confidence displayed as **separate** quantities, never fused into one number
- Confidence gates but never boosts; low confidence → priority human reassessment
- Named reasons for low confidence (no baseline, missing platelet trend, new patient)
- OOD flag for unfamiliar patient profiles (the pediatric-burn-in-adult-dengue-training case)
- Equity guard: subgroups with thin training support get widened intervals automatically
- The position paper on training-data underrepresentation

### 4. Realism of the staffing/resource plan — 15%
**Owner:** `/sundara-resource-engine`

The word in the rubric is **realism**. An optimiser that returns a clean optimal answer under a
strike is *less* credible, not more.

- Transit strike as a hard reachability constraint, not a label
- Scheduled vs. available shown as two numbers everywhere
- **The engine names what is impossible** — "Hospital C's nurse pool cannot reach Hospital A
  tonight; corridor down. Best feasible alternative: …". Naming the infeasible is the whole
  criterion.
- Compounding 21% chronic shortage with 24% strike unavailability, not conflating them

### 5. Governance and accountability design — 15%
**Owner:** `/sundara-governance`

The case says a court may eventually review this. Answer that literally.

- Three-layer accountability: decision (clinician) / system (named CMIO + Clinical AI Safety
  Committee) / oversight (drift monitoring + disclosure duty)
- Hash-chained append-only audit trail — tampering is detectable
- Override taxonomy with structured reasons, and reassessment timers
- Regret ledger: AI-right vs. clinician-right, published
- A written answer to "who is accountable when the system is wrong" that names a role, not a team

### 6. Presentation, demo quality, storytelling — 15%
**Owner:** `/sundara-demo`, `/sundara-mvp-refine`

- Open on the epigraph: *"Every triage system claims it never has to choose between two critical
  patients. Ours did, twice, before midnight."*
- Silent-mode replay — the night with AI off vs. on
- Rehearsed T+0 / T+8 / T+14 with a fallback for each
- Live demo, never a slide describing a demo. The brief says this explicitly.

---

## The three judge interventions are the exam

Everything else is preparation for these 14 minutes.

| Moment | What is tested | Your prepared answer |
|---|---|---|
| **T+0** | Can it rank a live mixed batch (dengue deterioration + burn/trauma) and explain each? | Prioritised queue, one-line rationale per row, forecast visible |
| **T+8** | Two near-identical acuities, different completeness — is the difference *defensible or arbitrary*? | Risk/confidence separation + the quadrant panel; B goes to reassessment, not to rank #1 |
| **T+14** | A fatigued charge nurse disagrees. Show the override and the audit trail. | Two clicks to override, structured reason, hash-chained entry, reassessment timer, no argument from the AI |

**T+8 is the criterion-3 exam and T+14 is the criterion-5 exam.** They are worth 30% combined and
they are the two moments teams most often improvise. Rehearse them until they are boring.

---

## Scoring your own build

Run `python scripts/rubric_selfaudit.py` and work your **lowest-weighted-score gap** first, not
your most interesting one. See `/sundara-mvp-refine`.