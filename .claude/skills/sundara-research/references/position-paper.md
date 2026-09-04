# Position Paper — Underrepresented Patients in Sundara Command

**Required deliverable (1–2 pages).** The brief asks: how would your system behave differently, if
at all, for a patient population your training data underrepresents — and what would your team do
if you discovered this bias only *after* go-live?

Use this as the working draft. Keep it to two pages; the discipline is part of the grade.

---

## 1. The problem, stated honestly

Sundara Command ranks patients by predicted deterioration. That prediction is learned from
historical patients. Where history is thin, the model is not neutral — **it is confidently wrong
in a direction we cannot see from aggregate metrics.**

Populations underrepresented in an Indian metropolitan ED corpus, and relevant tonight:

| Cohort | Why thin | Tonight's exposure |
|---|---|---|
| **Paediatric burn + inhalation** | Adult-dominated ED corpus; paediatric major burns are rare | The industrial fire may bring children |
| **New / unregistered patients** | No prior records, no baseline | 84 casualties arriving in 40 minutes are overwhelmingly unknown to the network |
| **Migrant and transient workers** | Fragmented or absent records across the network | A textile-warehouse fire affects exactly this workforce |
| **Elderly with atypical dengue** | Presents without classic fever pattern | Third night of an outbreak |
| **Pregnant patients** | Frequently excluded from training corpora | Altered physiological baselines invalidate standard thresholds |

**The compounding risk.** These cohorts overlap with *low data completeness*. A migrant worker
injured in the fire is both underrepresented in training **and** missing history at triage. Naive
systems fail such patients twice: once through a model that has not learned them, once through
imputation that invents a plausible-looking history. **Our design must not let the second failure
compound the first.**

---

## 2. How the system behaves differently — three mechanisms

### 2.1 Missingness is a signal, never a gap to fill

We never impute a missing value to zero or to a population mean. Every feature carries an explicit
missingness indicator, so `Platelets = NULL` and `Platelets = 0` remain different clinical facts,
and the model learns what absence itself predicts.

Consequence: data completeness is computed and displayed per patient (91% for an established
patient, 43% for a new arrival), and it drives the confidence estimate directly.

### 2.2 Confidence gates, it never boosts

The governing rule, and the answer to the T+8 challenge:

> A low-confidence risk estimate **never promotes** a patient up the queue. It **cannot demote**
> them below their protocol acuity band. It triggers **priority human reassessment** and names
> the missing information.

Patient B — risk 86%, confidence 58%, completeness 41% — does **not** outrank Patient A (risk 83%,
confidence 96%) on the strength of three percentage points the system does not trust. B is routed
to urgent human reassessment with "no baseline SpO₂, no platelet trend, no prior history" stated
on screen.

This is not a hedge. It is the correct decision: **the appropriate response to uncertainty about a
patient is to look at the patient**, not to reorder a queue on noise. Missing information must not
become false certainty.

### 2.3 Out-of-distribution detection widens uncertainty automatically

Mahalanobis distance / Isolation Forest against the training distribution. A patient whose profile
is unlike the training population — a severe paediatric burn against an adult-dengue-weighted
corpus — receives an explicit banner:

```
⚠ UNFAMILIAR PATIENT PROFILE
Model confidence reduced.
Reason: patient characteristics differ significantly from the training population.
Recommended: clinical review required.
```

The system says *"I have not seen patients like this"* rather than producing a confident number.
**Under the theme, the AI makes the first move toward its own limits** — it raises the doubt before
a clinician or a judge has to.

### 2.4 The equity guard

A live subgroup panel shows where training support is thin. For cohorts below a support threshold,
confidence intervals widen automatically and the cohort is flagged for mandatory human review.
Subgroup performance is reported alongside aggregate performance — never instead of it. Following
Obermeyer et al. (2019), an aggregate metric can look excellent while a subgroup is failed badly.

---

## 3. What we do if we discover the bias only after go-live

This is the harder half of the question and where the paper earns its marks. Our answer is a
**pre-committed protocol**, because the time to decide how to respond to bad news is before you
receive it.

**Hour 0–24 — Contain, do not conceal.**
Move the affected cohort to **shadow mode**: the model continues predicting and logging, but its
ranking is suppressed for that cohort and the interface falls back to a NEWS2-style protocol score
with the reason stated on screen. We degrade to the incumbent rather than switching off — an
abrupt withdrawal of decision support from a busy ED is itself a safety event.

**Hour 24–72 — Quantify and disclose.**
Root-cause review within 72 hours (see `/sundara-governance`). Retrospectively re-score affected
patients to estimate whether ranking harm actually occurred. **Disclose to the Clinical AI Safety
Committee and affected hospital leadership within 72 hours, whether or not harm is demonstrated.**

**Week 1–4 — Remediate.**
Targeted data collection for the cohort; retrain with reweighting or cohort-specific calibration;
re-validate in shadow mode against the incumbent before any re-enablement. Re-enable **only** on
demonstrated subgroup parity, approved by the committee, not by the engineering team.

**Standing commitments — what we will not do.**

- **We will not silently retrain.** Every model change is versioned, change-controlled, and
  recorded in the audit trail. A silent fix destroys the evidentiary record that the audit trail
  exists to preserve — and if this reaches a court, the version history is the defence.
- **We will not suppress the finding pending a fix.** Disclosure is not contingent on having a
  remedy.
- **We will not report only aggregate metrics** after discovering a subgroup failure.
- **We will not treat "no demonstrated harm" as "no problem."** Absence of measured harm in a
  cohort we under-observe is precisely the expected observation.

---

## 4. Accountability

Bias discovered post-deployment is a **system-layer** failure, not a clinician-layer one. The named
accountable owner is the **Chief Medical Information Officer**, supported by the Clinical AI Safety
Committee. No individual clinician is accountable for acting on a recommendation the system
presented as reliable. See `/sundara-governance` for the three-layer model.

---

## 5. Position

> A triage model that is confidently wrong about patients it has rarely seen is more dangerous than
> one that admits it does not know. Sundara Command is therefore designed so that **uncertainty is
> a first-class output, not a footnote** — separated from risk, displayed always, and acted upon by
> routing the patient to a human rather than to a rank.
>
> We accept a measurable cost for this: some genuinely critical patients with sparse data will be
> sent to human reassessment rather than automatically ranked first, which is slower than a
> confident system would be. We regard that as the correct trade, because the alternative failure —
> a confident ranking built on data we do not have — is invisible at the bedside, and the patients
> it harms are the ones already least well served.

---

### Drafting checklist

- [ ] Two pages maximum
- [ ] Names specific cohorts, not "underrepresented groups" generically
- [ ] Cites Obermeyer 2019 and Sjoding 2020 (see `failure-modes.md`), verified
- [ ] Answers the post-go-live question with a **pre-committed protocol**, not an intention
- [ ] States a cost the team accepts — a position paper conceding nothing reads as marketing
- [ ] Names an accountable role, not a team