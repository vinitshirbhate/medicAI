# Documented Failure Modes of AI Clinical Prioritisation — and Designed Mitigations

The case requires a mitigation for a failure mode **"reported in real deployments"** and
explicitly rules out "one you invented for convenience." Every entry below is from published
literature.

> **Verify each citation before presenting.** Figures here are reported from the literature but
> should be confirmed against the primary source. A misattributed statistic under hostile
> questioning costs more than omitting the claim. Log verification in `research-log-template.md`.

**Each failure mode below names the specific place in the prototype where its mitigation lives.**
A cited failure with no corresponding safeguard scores nothing.

---

## FM-1 — Vendor-reported performance does not survive external validation

**Source:** Wong A, Otles E, Donnelly JP, et al. *External Validation of a Widely Implemented
Proprietary Sepsis Prediction Model in Hospitalized Patients.* JAMA Internal Medicine, 2021.

**What happened.** The Epic Sepsis Model — deployed at hundreds of US hospitals — was externally
validated on ~38,000 hospitalisations at the University of Michigan. Reported findings:

| Metric | Result |
|---|---|
| AUC | **0.63** (vendor internal documentation reported 0.76–0.83) |
| Sensitivity | ~33% — it **missed roughly two thirds** of sepsis patients |
| Positive predictive value | ~12% — most alerts were false |
| Alert burden | Alerts generated on roughly **18% of all hospitalised patients** |

**Why it is the strongest failure mode to cite here.** It is famous, quantified, and its two
failures pull in opposite directions: it missed most true cases *while* alerting on nearly a fifth
of patients. That combination is the exact failure your system risks on a night with forty red
screens.

**Mitigations designed in:**

1. **Alert budgeting.** The system enforces a ceiling on simultaneous high-priority alerts. Past
   the ceiling it re-ranks rather than adding alerts. An alert that everyone ignores is worse than
   no alert — it trains clinicians to dismiss the system.
   → *Lives in:* the ranking policy, `/sundara-triage-engine`.
2. **Published local validation, not vendor claims.** Show a model card with performance on *your*
   cohort, with confidence intervals, and state the limits of synthetic-data validation honestly.
   → *Lives in:* model card, `/sundara-governance`.
3. **Rank, don't alarm.** A ranked queue degrades gracefully under a mediocre model; a binary
   alarm does not. This is a core architectural reason to output an ordering rather than alerts.

> **Judge-facing line:** "The most widely deployed sepsis model in America scored 0.63 on external
> validation and fired on 18% of inpatients. We designed for that outcome rather than assuming
> we'd avoid it — which is why we rank instead of alarm, and why we cap concurrent alerts."

---

## FM-2 — A biased proxy target encodes discrimination invisibly

**Source:** Obermeyer Z, Powers B, Vogeli C, Mullainathan S. *Dissecting racial bias in an
algorithm used to manage the health of populations.* Science, 2019.

**What happened.** A widely used population-health algorithm ranked patients by predicted
**healthcare cost** as a proxy for health **need**. Because less money is historically spent on
Black patients at equal levels of illness, Black patients had to be considerably sicker to receive
the same risk score. Correcting the target was reported to raise the proportion of Black patients
identified for additional help from roughly 17.7% to 46.5%.

**The lesson, precisely stated:** the model was not biased in its features or its algorithm. It was
biased in **what it was asked to predict**. No amount of explainability tooling on the wrong target
surfaces this.

**Mitigations designed in:**

1. **Predict a clinical outcome, never a proxy.** The target is physiological deterioration
   (ICU transfer, organ support, sustained vital derangement) — never cost, never length of stay,
   never "was this patient prioritised historically," which would launder existing triage bias
   into the model.
2. **Written, defended target definition.** The model card states the label, why it was chosen,
   and which tempting proxies were rejected.
   → *Lives in:* model card, `/sundara-governance`.
3. **Subgroup performance reporting** rather than a single aggregate metric.
   → *Lives in:* the equity guard, `/sundara-triage-engine`.

---

## FM-3 — A core input signal is systematically biased by patient characteristics

**Source:** Sjoding MW, Dickson RP, Iwashyna TJ, Gay SE, Valley TS. *Racial Bias in Pulse Oximetry
Measurement.* New England Journal of Medicine, 2020.

**What happened.** Pulse oximetry was found to overestimate true arterial oxygen saturation in
patients with darker skin. Occult hypoxemia — arterial SaO₂ below 88% while the pulse oximeter
reads a reassuring 92–96% — occurred at roughly **three times** the rate in Black patients
compared with White patients.

**Why this one matters most for Sundara.** SpO₂ is among the strongest features in any
deterioration model and is the most prominent number on your P-1042 card (89%). A model that
treats SpO₂ as ground truth inherits this bias **directly into the triage ranking** — and the
patients harmed are exactly those the system is least likely to have historical data on.

**Mitigations designed in:**

1. **SpO₂ never triggers alone.** Respiratory rate, heart rate, work of breathing and lactate
   corroborate. A *reassuring* SpO₂ alongside a rising respiratory rate **raises** concern rather
   than lowering it — the discordance is itself the signal.
2. **Discordance flag.** When SpO₂ appears normal but other respiratory indicators are
   deteriorating, the system surfaces "oximetry may be unreliable — corroborate clinically."
3. **Never let a single reassuring input suppress a rank.** Reassurance requires agreement across
   signals; concern does not.
   → *All three live in:* feature design and the ranking policy, `/sundara-triage-engine`.

> This is the flagship answer to "how would your system behave differently for an underrepresented
> patient population?" — a published finding that changed the architecture.

---

## FM-4 — Alert fatigue destroys the intervention

**Sources:** the ~18% alert rate in Wong et al. 2021 (FM-1); the broader CDS override literature,
in which override rates for medication and clinical alerts are frequently reported in the range of
roughly half to over 90% of alerts fired.

**What happens.** Above a threshold volume, clinicians dismiss alerts reflexively — including the
true ones. The system's measured effect can go to zero, or negative, while its dashboard metrics
look healthy.

**Mitigations designed in:**

1. **Alert budget** — hard cap on concurrent high-priority alerts (FM-1).
2. **Ranking as the primary interface.** The queue is always-on and ambient; interruptive alerts
   are reserved for genuine escalations.
3. **Override-rate monitoring as a first-class health metric.** A rising override rate is treated
   as a system fault to be investigated, not as clinician non-compliance to be corrected.
   → *Lives in:* the regret ledger, `/sundara-governance`.

That third point is a governance answer as much as a technical one, and it lands well: the system
watches itself for the failure mode rather than blaming its users.

---

## FM-5 — Dataset shift silently degrades a deployed model

**Source:** Finlayson SG, Subbaswamy A, Singh K, et al. *The Clinician and Dataset Shift in
Artificial Intelligence.* New England Journal of Medicine, 2021. Widely observed during COVID-19,
when patient mix and care patterns changed faster than models were revalidated.

**Direct relevance:** tonight *is* a distribution shift. A model trained on ordinary ED traffic is
being asked to rank a mixed dengue-outbreak and mass-casualty-burn population under a staffing
disruption. The compounding scenario is textbook dataset shift.

**Mitigations designed in:**

1. **Out-of-distribution detection** (Mahalanobis distance or Isolation Forest) with confidence
   reduced — not suppressed — for unfamiliar profiles.
2. **Explicit "unfamiliar patient profile" banner** with a stated reason and a recommendation for
   clinical review, rather than a confident score.
3. **Drift monitoring with a named owner** and a shadow-mode rollback path.
   → *Lives in:* uncertainty engine, `/sundara-triage-engine`; drift ownership,
   `/sundara-governance`.

> **Demo opportunity:** a severe paediatric burn with smoke inhalation, against a model trained
> mostly on adult dengue, is a legitimate OOD case. Showing the system *lower its own confidence*
> unprompted is the cleanest possible demonstration of the theme.

---

## FM-6 — Automation bias: the tool degrades the clinician

**Source:** Goddard K, Roudsari A, Wyatt JC. *Automation bias: a systematic review of frequency,
effect mediators, and mitigators.* JAMIA, 2012.

**What happens.** Clinicians accept incorrect recommendations they would have caught unaided, and
stop looking for disconfirming evidence. The decision support degrades the decision-maker.

**Why it is uniquely dangerous here.** Your T+14 scenario is a **fatigued** charge nurse at
20:14 during a mass-casualty event. Fatigue and time pressure are documented amplifiers of
automation bias. The single most likely real-world harm from Sundara Command is not a wrong
ranking — it is a right-looking ranking accepted without thought.

**Mitigations designed in:**

1. **Confidence is always visible**, never buried behind a click.
2. **Override is a first-class action, not a buried escape hatch** — same visual weight as Accept.
3. **The AI pre-drafts the override when its own confidence is low.** The system moves first
   toward its own reversal. This is the deepest expression of the theme and the strongest possible
   counter to automation bias: the tool actively resists being trusted blindly.
4. **Regret ledger** publishes when the clinician was right and the AI was wrong, keeping
   scepticism calibrated and alive.
   → *Lives in:* override flow, `/sundara-governance`; UI weighting, `/sundara-demo`.

---

## Summary — coverage map

| ID | Failure mode | Primary mitigation | Built in |
|---|---|---|---|
| FM-1 | External validation gap + alert flood | Alert budget; rank don't alarm; local model card | Triage engine, governance |
| FM-2 | Biased proxy target | Clinical outcome label; documented target; subgroup reporting | Triage engine, governance |
| FM-3 | Biased input signal (SpO₂) | Corroboration rule; discordance flag | Triage engine |
| FM-4 | Alert fatigue | Alert budget; ambient ranking; override-rate monitoring | Triage engine, governance |
| FM-5 | Dataset shift | OOD detection; unfamiliar-profile banner; drift owner | Triage engine, governance |
| FM-6 | Automation bias | Visible confidence; equal-weight override; AI-drafted override; regret ledger | Governance, demo |

**Pick FM-1 or FM-3 as the one you present.** FM-1 is the most recognisable; FM-3 is the most
architecturally impressive because it visibly changed the design. If you have time for two, use
FM-3 for criterion 3 (uncertainty/underrepresentation) and FM-1 for criterion 5 (governance).