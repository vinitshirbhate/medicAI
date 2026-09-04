# Non-Technical Requirements — BR-nn

The Business Solution track is a graded objective, and governance (15%) plus staffing realism
(15%) are 30% of the rubric on their own. This is not deck filler; it is where a strong technical
team most often loses to a complete one.

> Regulatory positions below are a starting framework, not legal advice. Confirm current
> obligations before presenting them as settled.

---

## A. Regulatory & compliance

| ID | Requirement | Position to take |
|---|---|---|
| BR-01 | **Digital Personal Data Protection Act, 2023 (India)** compliance | Health data is personal data. Establish lawful basis, purpose limitation, retention limits, breach notification, and the rights of the Data Principal. Name a Data Protection Officer. |
| BR-02 | **Clinical decision support, not autonomous diagnosis** | Sundara Command recommends and ranks; a clinician decides. This boundary is what keeps the system in the CDS category, and it is a *design* commitment, not a disclaimer — hence FR-35's mandatory human action. |
| BR-03 | **CDSCO medical-device / SaMD assessment** | Assess classification before go-live. Software influencing clinical decisions may fall in scope; the assessment must be documented, not assumed away. |
| BR-04 | **Institutional ethics committee approval** | Required before any clinical deployment, including shadow mode. Budget calendar time for it — this is a schedule risk, not a form. |
| BR-05 | **ICMR ethical guidelines** for biomedical research and AI in health | Applies to the validation study. |
| BR-06 | **Data residency and minimisation** | Patient identifiers never leave the hospital boundary; the network layer sees aggregates and pseudonymised IDs only. |
| BR-07 | **No patient data in model training without governance approval** | Training corpus provenance documented in the model card. |

**The strong answer to a privacy question:** identifiable data stays inside the hospital; the
network command layer receives only counts, capacity, and pseudonymous risk tiers. Privacy is
achieved by **architecture**, not by policy promises — and it is why the network view shows
"Hospital B: 1 ICU bed", never a patient list.

---

## B. Governance & accountability

Detailed design in `/sundara-governance`. Requirements here.

| ID | Requirement |
|---|---|
| BR-08 | A **named accountable owner** for system-layer failure: the Chief Medical Information Officer. A role, never a committee, never "the team". |
| BR-09 | A **Clinical AI Safety Committee**: clinical, nursing, data science, ethics, and legal representation. Authority to suspend the system. |
| BR-10 | **Model change control** — no model reaches production without committee approval, version record, and audit entry. Silent retraining is prohibited. |
| BR-11 | **72-hour root-cause review** for any incident where a recommendation contributed to harm. |
| BR-12 | **Disclosure duty** — discovered bias or degradation is disclosed to the committee and affected hospital leadership within 72 hours, whether or not harm is demonstrated. |
| BR-13 | **Override-rate monitoring as a system health metric**, investigated as a system fault rather than as clinician non-compliance. |
| BR-14 | **Model cards** published per model: training population, performance overall and by subgroup, known limitations, intended and out-of-scope use. |

---

## C. Change management & workforce

Pointed, given that a labour dispute is part of the scenario.

| ID | Requirement |
|---|---|
| BR-15 | **Clinician training** before go-live, covering the system's limits as prominently as its capabilities. Training that only demonstrates strengths manufactures automation bias (FM-6). |
| BR-16 | **Alarm-fatigue mitigation** with a measured alert budget, reviewed monthly against override rates. |
| BR-17 | **Staff and union consultation.** The system recommends staff reallocation; if it is perceived as a management surveillance or rostering tool, clinicians will not trust its clinical output either. Consult before deployment, not after. |
| BR-18 | **Explicitly not a performance-management tool.** Override data is never used in individual staff appraisal. Publish this commitment — without it, override rates will be suppressed and the audit trail becomes worthless. |
| BR-19 | **Phased rollout**: shadow mode → 2 pilot hospitals → 10 → 40. No big-bang deployment. |
| BR-20 | **A named clinical champion per site.** Adoption is site-local. |

> BR-18 is worth saying aloud to judges. A team that recognises that *the audit trail's integrity
> depends on clinicians not fearing it* understands deployment, not just software.

---

## D. Legal & evidentiary

The case says this may end up in court. Answer that literally.

| ID | Requirement |
|---|---|
| BR-21 | **Evidentiary-standard record.** Every recommendation stores: inputs available at the time, model version, risk, confidence, the rationale shown, the human action, and the reason. Reconstructable to the second. |
| BR-22 | **Tamper-evident audit** — hash-chained append-only log (FR-39). A mutable log is not evidence. |
| BR-23 | **Retention** aligned to medical-record retention obligations, not to convenience. |
| BR-24 | **The clinician's decision is the medical record.** The AI recommendation is contemporaneous decision-support documentation, and is recorded as such — not as an instruction that was followed. |
| BR-25 | **Liability position:** the deploying organisation is accountable for the system; the clinician is accountable for the decision; the vendor is accountable for disclosed performance and drift monitoring. No layer can disclaim onto another. |

---

## E. Budget — ₹58 crore ceiling

Full allocation in `sundara-command/references/case-facts.md`. The defensible framing:

> **Integration and change management together (₹23 cr, 40%) exceed platform and ML build
> (₹10 cr, 17%).**

That ratio is the point. It signals the team knows that clinical AI programmes fail at integration
and adoption, not at modelling — and it is consistent with the "existing systems cannot be
replaced" constraint. A budget weighted toward ML build would suggest the opposite.

| ID | Requirement |
|---|---|
| BR-26 | Total programme cost **≤ ₹58 crore** over 12 months across 40 hospitals |
| BR-27 | ~12% contingency retained; state the trade-offs made to fit the ceiling |
| BR-28 | Clinical validation funded as a separate line (₹8 cr) — it cannot be absorbed into build |

---

## F. Measurable impact within 12 months

The brief requires measurable impact within 12 months **and** forbids achieving the wait-time
target by indefinitely deprioritising low-acuity patients.

| ID | Metric | Baseline | Target | Method |
|---|---|---|---|---|
| BR-29 | Average ED wait | 51 min | **≤ 35 min** | Earlier recognition shifts work left; measured per site, monthly |
| BR-30 | Critical identified after avoidable delay | 16% | **≤ 8%** | Retrospective chart review against forecast timestamps |
| BR-31 | **Low-acuity 90th-percentile wait** | measured at baseline | **Must not increase** | The honesty metric — published alongside BR-29 |
| BR-32 | Override rate | measured at baseline | Stable or falling, **investigated if rising** | System health, not compliance |
| BR-33 | Subgroup parity of model performance | measured at baseline | No widening gap | Quarterly, per model card |

**BR-31 is the requirement that answers the brief's hardest business question.** Anyone can lower
an average by starving the tail. Publishing the tail is what makes the average credible — and it
is enforced technically by the starvation guard (FR-18), not by policy. Requirement and mechanism
together is what makes it a real commitment.

### Measurement design

- **Baseline period** before go-live at each site; sites go live in waves (BR-19), so earlier
  waves act as a comparison group for later ones.
- **Shadow mode first** — the model predicts and logs without displaying, establishing performance
  on real local data before it influences a single decision.
- **Pre-registered metrics.** Fix the metric set before go-live. Choosing metrics after seeing
  results is how programmes report success they did not achieve.