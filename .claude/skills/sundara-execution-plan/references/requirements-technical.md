# Technical Requirements — FR / NFR

**Priority:** `P0` demo-critical (the stress test fails without it) · `P1` scored (a rubric
criterion depends on it) · `P2` if time.

Every requirement has a testable acceptance criterion. A requirement without one is a wish.

---

## A. Patient intake & data ingestion

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-01 | P0 | Register a patient with ID, age, sex, hospital, arrival time, arrival mode, chief complaint, symptom checkboxes | A nurse completes intake in **under 60 seconds** with no free-text required |
| FR-02 | P0 | Capture initial vitals: HR, BP, SpO₂, RR, temperature, GCS | Impossible values rejected (HR 0–300, SpO₂ 0–100, GCS 3–15) with an inline message |
| FR-03 | P0 | Event-specific pathway fields shown conditionally — dengue vs burn/smoke | Selecting "burn" reveals %TBSA, burn location, inhalation, exposure duration, airway concern; dengue fields hide |
| FR-04 | P0 | Every categorical field offers **Unknown**, stored distinctly from **No** | DB shows `NULL` + `*_missing = 1` for Unknown; never `false` |
| FR-05 | P0 | Simulated EHR feed supplies labs on submit (Hb, WBC, platelets, lactate, creatinine, glucose) | Labs appear within 2 s with source and timestamp displayed |
| FR-06 | P0 | Vitals time series streams to the client | Queue updates without a page refresh; P-1042's SpO₂ visibly falls 96→89 during the demo |
| FR-07 | P1 | Free-text clinical notes with structured extraction | "smoke exposure ~20 min" yields `smoke_exposure=true`, `exposure_duration_min=20` |
| FR-08 | P0 | Per-patient data completeness computed and displayed | Overall % plus per-category breakdown (vitals/labs/history/prior records) |

## B. Risk, forecasting & ranking

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-09 | P0 | Tabular deterioration risk model (XGBoost) with missingness indicators | Produces calibrated probability; no feature imputed to zero |
| FR-10 | P0 | Temporal model (GRU) over the vitals trajectory | Ranks a deteriorating-trajectory patient above a static patient at identical current vitals |
| FR-11 | P0 | 2-hour deterioration forecast with trajectory band | Displays `Moderate → High → Critical` with horizon stated |
| FR-12 | P0 | **Lexicographic ranking:** protocol band first, AI orders within band | A patient cannot be ranked above a higher acuity band by AI score alone |
| FR-13 | P0 | Band escalation is proposed, flagged, and human-confirmable — never silent | Escalation renders as a distinct badge with its evidence and a confirm action |
| FR-14 | P0 | **AI pre-drafts the override form when its own confidence is low** | Confidence < 65% → override modal opens pre-filled with the reason and missing-data list |
| FR-15 | P1 | SHAP contributions per patient, in clinical language | Shows "SpO₂ 89% +0.22", not "f_12 +0.22" |
| FR-16 | P1 | **"Why not the other patient?"** pairwise comparison | Selecting two patients states the marginal reason one outranks the other |
| FR-17 | P0 | Queue re-ranks autonomously and timestamps the AI action | Card shows AI-ranked time and human-opened time; the gap is visible |
| FR-18 | P0 | **Starvation guard** — wait time accrues priority, capped below genuine criticals | A low-acuity patient's rank rises monotonically with wait; can never pass an ESI-1/2 |
| FR-19 | P1 | Alert budget — ceiling on concurrent high-priority alerts | Past the ceiling the system re-ranks instead of adding alerts (FM-1, FM-4) |
| FR-20 | P1 | SpO₂ corroboration rule | A reassuring SpO₂ with rising RR does not lower priority; discordance flag raised (FM-3) |

## C. Uncertainty

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-21 | P0 | Confidence displayed separately from risk, always visible | Both numbers on every card; neither behind a click |
| FR-22 | P0 | Deep ensemble (≥5 members); disagreement drives confidence | Ensemble spread maps to a confidence value |
| FR-23 | P0 | **Confidence gates, never boosts** | Low confidence never promotes; never demotes below protocol band; routes to reassessment |
| FR-24 | P0 | Named reasons for low confidence | T+8 Patient B shows "no baseline SpO₂, no platelet trend, new patient" |
| FR-25 | P1 | OOD detection with an unfamiliar-profile banner | Paediatric burn against adult-dengue training triggers the banner and reduces confidence |
| FR-26 | P1 | Probability calibration (temperature scaling or isotonic) | Reliability plot produced; stated in the model card |
| FR-27 | P2 | Equity guard — subgroup support panel with auto-widened intervals | Thin-support cohorts flagged for mandatory human review |

## D. Resources & staffing

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-28 | P0 | Hospital resource state: ICU/ED beds, ventilators, oxygen, doctors, nurses | **Scheduled and available shown as two separate figures everywhere** |
| FR-29 | P0 | Transit strike as a hard reachability constraint | `R[origin][hospital] = 0` for struck corridors; optimiser cannot use those staff |
| FR-30 | P0 | Resource-aware recommendation | "Preferred ICU; no bed here; Hospital B has 1; transport feasible" |
| FR-31 | P0 | **Named infeasibility** in staffing output | Names impossible reassignments with the reason, then the best feasible alternative |
| FR-32 | P1 | 2-hour demand forecast for ICU, staff, equipment | "Oxygen concentrators: 12 available, 17 projected, gap 5" |
| FR-33 | P1 | Pre-emptive resource hold with countdown | AI provisionally reserves the last ICU bed pending human confirm |
| FR-34 | P1 | Network view across hospitals | Per-hospital ICU/ED/staff/burn beds with routing recommendation |

## E. Human control, audit & governance

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| FR-35 | P0 | Accept / Override / Request more information on every recommendation | All three equally weighted visually — override is not a buried escape hatch |
| FR-36 | P0 | Structured override reasons | New clinical information · inconsistent with bedside assessment · resource constraint · deterioration observed · other |
| FR-37 | P0 | Override completes in **≤ 2 clicks** and is never argued with | System responds "Override accepted. Reassessment recommended in 10 minutes." |
| FR-38 | P0 | Reassessment timer starts on override | Visible countdown on the patient card |
| FR-39 | P0 | **Hash-chained append-only audit trail** | Each entry hashes the previous; a verify command detects tampering |
| FR-40 | P0 | Audit records what the AI recommended, on what data, what the human did, and why | Full T+14 sequence reconstructable to the second |
| FR-41 | P1 | `initiated_by: AI \| HUMAN` on every entry, with latency-to-human-review | First-move ledger renders from audit data |
| FR-42 | P1 | Regret ledger — AI-right vs clinician-right tally | Visible on the governance panel |
| FR-43 | P2 | Silent-mode replay — the night with AI off vs on | Deterministic replay, side by side |

---

## Non-functional requirements

| ID | Pri | Requirement | Acceptance criterion |
|---|---|---|---|
| NFR-01 | P0 | Rank refresh **< 2 s** from new vitals to reordered queue | Measured under 40 concurrent patients |
| NFR-02 | P0 | Inference **< 500 ms** per patient including ensemble and SHAP | Logged per request |
| NFR-03 | P0 | Dashboard handles 40 concurrent patients without visible lag | The case says "every one of forty screens is red" — demo at 40, not at 5 |
| NFR-04 | P0 | Runs natively — **no Docker dependency** | `uv run` + `npm run dev` from a clean checkout |
| NFR-05 | P0 | Demo state resets in one command | `python scripts/reset_demo.py` restores the opening state in < 5 s |
| NFR-06 | P0 | Deterministic demo | Fixed seeds; identical results across runs |
| NFR-07 | P0 | **Read-only integration; zero write-back to hospital systems** | No write path exists in the adapter layer, by construction |
| NFR-08 | P1 | Degraded mode when models are unavailable | Falls back to a NEWS2-style protocol score and says so on screen |
| NFR-09 | P1 | No real patient data; synthetic only | Stated in the README and on a slide |
| NFR-10 | P1 | Audit entries immutable once written | Append-only; no UPDATE or DELETE path |
| NFR-11 | P1 | Model versioning | Every prediction records the model version that produced it |
| NFR-12 | P2 | Offline capable | Demo runs with networking disabled |

---

## P0 count and the reality check

There are **32 P0 requirements**. In 48 hours with a small team that is achievable only because
the models are small and the data is synthetic — but only if nobody starts a P2.

**If you are behind at hour 30**, cut in this order: FR-43 → FR-27 → FR-07 → FR-34 → FR-32.
Never cut FR-14, FR-23, FR-31, FR-37 or FR-39 — those five *are* the three judge interventions.