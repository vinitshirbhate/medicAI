# Case Facts — Single Source of Numeric Truth

**Rule: every number that appears in the dashboard, the deck, or an answer to a judge comes from
this file.** If a figure is not here, it is either derived (show the derivation) or invented (do
not use it). Numbers that drift between artifacts destroy credibility faster than a missing
feature does.

Source: Case Study 4 — *AI With Initiative: Who Gets Seen First*, Sundara Health Alliance
(fictional client), plus the team conversation notes.

---

## 1. Business snapshot (baseline, pre-intervention)

| Metric | Value | Constant name |
|---|---|---|
| Hospitals in network | 40 | `NETWORK_HOSPITALS` |
| Emergency patients per day (network-wide) | 8,600 | `DAILY_ED_PATIENTS` |
| Average emergency wait time | 51 minutes | `BASELINE_WAIT_MIN` |
| Critical cases identified after avoidable delay | 16% | `BASELINE_DELAYED_CRITICAL_PCT` |
| ICU occupancy | 93% | `BASELINE_ICU_OCCUPANCY_PCT` |
| Night-shift clinical staff shortage | 21% | `BASELINE_NIGHT_SHORTAGE_PCT` |

**Derived, and useful in the pitch:** 16% of 8,600 ≈ **1,376 patients per day** network-wide whose
critical status is recognised late. Per hospital that is ~34 per day. State it as a derivation, not
as a case fact.

## 2. Constraints (hard — violating any of these fails the brief)

| Constraint | Detail |
|---|---|
| Budget ceiling | **₹58 crore** — cannot be exceeded |
| Existing systems | **Cannot be replaced** — integrate only |
| Human approval | **Mandatory for every life-critical decision.** System may recommend and rank, never autonomously execute a triage decision |
| Patient privacy | Must be maintained throughout |
| Time to impact | Measurable impact within **12 months** of go-live |
| Staffing realism | The staffing module must account for **at least one real-world availability constraint** (the transit strike), not an idealised fully-staffed baseline |

## 3. The compounding night

Third night of a city-wide dengue outbreak.

| Event | Detail | Constant name |
|---|---|---|
| Industrial fire | **7:50 PM**, textile warehouse | `FIRE_TIME` |
| Casualties | **84** burn + smoke-inhalation | `FIRE_CASUALTIES` |
| Arrival window | **40 minutes**, across **4** hospitals | `FIRE_ARRIVAL_WINDOW_MIN`, `FIRE_HOSPITALS` |
| Transit strike | **24%** of incoming night-shift staff cannot reach assigned hospitals | `STRIKE_STAFF_UNAVAILABLE_PCT` |
| Effective staff availability | **76%** | `STRIKE_STAFF_AVAILABLE_PCT` |
| Strike window | 19:00 → 06:00 | `STRIKE_START`, `STRIKE_END` |
| Dengue surge | Expected additional arrivals **+35%** | `DENGUE_ARRIVAL_UPLIFT_PCT` |

Six simultaneous pressures: dengue outbreak · mass casualty · staffing disruption · 93% ICU
occupancy · legacy system integration · mandatory human oversight.

**Note the 21% vs 24% distinction — do not conflate them.** 21% is the *chronic baseline*
night-shift shortage. 24% is *tonight's additional* strike-driven unavailability. They compound.

## 4. Demo reference patients

Used by `scripts/generate_synthetic_patients.py` and the demo script. Keep these exact.

### P-1042 — the T+0 anchor case
46F · Sundara Central · arrived 19:58 by ambulance · dengue positive, day 4 ·
presenting with shortness of breath + high fever.

| Vital | Value | Trend (19:55 → 20:10) |
|---|---|---|
| HR | 128 bpm | 98 → 107 → 119 → 128 |
| SpO₂ | 89% | 96 → 95 → 92 → 89 |
| RR | 29/min | 21 → 23 → 26 → 29 |
| Temp | 39.4 °C | 38.8 → 39.0 → 39.2 → 39.4 |
| BP | 94/62 mmHg | — |
| GCS | 14 | — |
| Platelets | 82,000/µL | 128K → 110K → 96K → 82K |

Labs: Hb 11.2 g/dL · WBC 13,400/µL · Lactate 3.1 mmol/L · Creatinine 1.4 mg/dL · Glucose 118 mg/dL.

Output: **CRITICAL** · deterioration risk **87%** · confidence **94%** · time sensitivity HIGH.

### The T+8 twins — near-identical acuity, divergent completeness

| | Patient A | Patient B |
|---|---|---|
| Acuity | 8.5 | 8.5 |
| Deterioration risk | 83% | **86%** |
| Confidence | **96%** | **58%** |
| Data completeness | 94% | 41% |
| History | Full | New / unknown patient |

**B has the higher risk number and the lower confidence.** This pair exists to prove the system
separates clinical risk from confidence in the prediction. B must *not* outrank A on the strength
of a number the system does not trust — B is routed to priority human reassessment with the
missing data named (no baseline SpO₂, no platelet trend, no history).

### T+14 override
Charge Nurse #27 · 20:14:32 · reason "bedside assessment differs from system data" ·
P-1042 moves priority #1 → #3 · reassessment timer 10 minutes.

## 5. Resource state on the night

Network ICU occupancy 93% · **2** ICU beds available network-wide.

| Hospital | ICU avail | ED avail | Staff | Burn beds |
|---|---|---|---|---|
| A | 0 | 9 | 76% | 3 |
| B | 1 | 14 | 89% | 7 |
| C | 1 | 4 | 71% | 2 |

Single-hospital detail (Sundara Central): ICU 40 total / 38 occupied / **2 available** ·
ED 80 total / 71 occupied / **9 available** · ventilators 25 total / **6 available** ·
oxygen normal · doctors 22 scheduled / **19 available** · nurses 48 scheduled / **37 available**.

**Always display scheduled and available as two separate figures.** The gap *is* the story.

## 6. Budget model — ₹58 crore

Indicative allocation for the 12-month programme across 40 hospitals. Present as a defensible
estimate with stated assumptions, never as a quote.

| Line | ₹ crore | Note |
|---|---:|---|
| Integration layer (40 sites, HL7 v2 / FHIR read-only adapters) | 14 | The real cost driver — legacy systems cannot be replaced |
| Platform build + ML development | 10 | |
| Infrastructure & hosting, 12 months | 6 | Hospital edge nodes + network command |
| Clinical validation & shadow deployment | 8 | Non-negotiable before any live ranking |
| Change management & training, 40 sites | 9 | Alarm-fatigue mitigation, clinician onboarding |
| Governance, compliance, audit | 4 | |
| Contingency (~12%) | 7 | |
| **Total** | **58** | At ceiling — state that trade-offs were made to fit |

If a judge presses on the split, the defensible point is that **integration + change management
(₹23 cr, 40%) exceeds platform + ML (₹10 cr, 17%)** — which is what real clinical deployments
actually cost, and signals that the team has deployed software into a hospital before.

## 7. Targets — state these as commitments with a method

Do not invent a target without a mechanism. Each must survive "how?"

| Metric | Baseline | Target | Mechanism |
|---|---|---|---|
| Average ED wait | 51 min | **≤ 35 min** (−31%) | Earlier recognition shifts work left; no gain from deprioritising low-acuity — enforced by the starvation guard |
| Critical identified after avoidable delay | 16% | **≤ 8%** (−50%) | 2-hour deterioration forecast + pre-arrival ranking |
| Low-acuity 90th-percentile wait | — | **Must not increase** | The honesty metric. Publishing it is what makes the other two believable |

That third row is the one most teams omit. The case explicitly demands a plan that does not
achieve its wait-time reduction "by simply deprioritizing lower-acuity patients indefinitely."
Reporting the low-acuity tail alongside the headline is the proof.