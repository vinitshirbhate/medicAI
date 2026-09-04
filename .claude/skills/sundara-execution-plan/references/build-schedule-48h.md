# 48-Hour Build Schedule

Assumes a team of 4. Adjust hours, keep the **checkpoints and cut lines** — those are what save
the build.

**The governing rule:** a demo-able vertical slice must exist by hour 12 and must never be broken
after that. Teams fail this case by having eight excellent components and nothing that runs.

---

## Roles

| Role | Owns |
|---|---|
| **ML** | Feature pipeline, XGBoost, GRU, ensemble, calibration, SHAP, OOD |
| **Backend** | FastAPI, WebSocket, SQLite, audit chain, ranking service, constraint engine |
| **Frontend** | Next.js dashboard, triage report, override flow, resource panel |
| **Story** | Deck, research deliverables, position paper, demo script, rehearsal — **not a part-time job** |

The Story role is the one teams under-resource. Presentation and demo quality is 15%, the research
deliverables are a graded track, and the person doing them cannot also be debugging at hour 44.

---

## Hours 0–6 — Foundations

| Owner | Task |
|---|---|
| All | Read `/sundara-command` and `case-facts.md`. Agree the scope fence. **30 minutes, together.** |
| Backend | Repo scaffold, FastAPI skeleton, SQLite schema from `data-contracts.md`, health endpoint |
| ML | `generate_synthetic_patients.py` — cohorts, trajectories, completeness variation |
| Frontend | Next.js scaffold, layout shell, patient-card component with mock data |
| Story | Read `/sundara-research`; start the failure-mode catalogue |

**✅ Checkpoint H6:** backend serves a hardcoded patient list; frontend renders it. End to end,
however fake.

---

## Hours 6–12 — The vertical slice

| Owner | Task |
|---|---|
| ML | XGBoost trained on synthetic data; risk endpoint returns a probability |
| Backend | `/patients` and `/rank` wired to the model; WebSocket pushing vitals updates |
| Frontend | Live queue rendering real ranks; vitals updating without refresh |
| Story | Triage-framework analysis; the authority-boundary table (deck slide) |

**🚨 CUT LINE 1 — H12.** If the queue is not rendering live model output, stop all feature work and
fix it. Nothing downstream matters. Drop the GRU to a rule-based trend feature if necessary — a
working reactive system beats a broken proactive one, and the GRU can return at H24.

---

## Hours 12–20 — The theme

Now build what makes it *proactive*, not merely accurate.

| Owner | Task |
|---|---|
| ML | GRU trajectory model; 2-hour forecast; deep ensemble (5 members) → confidence |
| Backend | Lexicographic ranking (FR-12); starvation guard (FR-18); risk/confidence separation |
| Frontend | Triage report: priority, risk, confidence, **why prioritised**, forecast trajectory |
| Story | Failure-mode catalogue complete; position-paper first draft |

**✅ Checkpoint H20:** P-1042 shows CRITICAL, 87% risk, 94% confidence, five reasons, and a
2-hour trajectory. **This is your T+0 answer.** Screenshot it — that screenshot is your fallback if
the live system fails at judging.

---

## Hours 20–28 — Uncertainty and resources

| Owner | Task |
|---|---|
| ML | Calibration; OOD detection; low-confidence reason generation (FR-24) |
| Backend | Resource state; transit-strike reachability constraint; named infeasibility (FR-31) |
| Frontend | **Risk × Confidence quadrant panel**; resource-context panel; scheduled-vs-available everywhere |
| Story | Deck structure; narrative arc; begin demo script |

**✅ Checkpoint H28:** the T+8 twins work. Patient B shows 86% risk / 58% confidence, HIGH
UNCERTAINTY, named missing data, and routes to reassessment **without outranking A**. Rehearse
saying why out loud — that sentence is worth 15%.

---

## Hours 28–34 — Override and audit

| Owner | Task |
|---|---|
| Backend | Hash-chained audit (FR-39); override endpoint; reassessment timer |
| Frontend | Override modal, structured reasons, ≤2 clicks; audit trail view |
| ML | **AI-drafted override on low confidence (FR-14)** — the signature feature |
| Story | Governance answer written; accountability table; model card |

**🚨 CUT LINE 2 — H34.** All three judge interventions must now work end to end. If any does not,
**cut every remaining P1 and P2** and fix it. From here on the build is closed to new features.

---

## Hours 34–40 — Hardening and the winnable features

Only if all three interventions are solid. In strict order — stop when time runs out:

1. **"Why not the other patient?"** (FR-16) — highest score-per-hour in the build
2. Regret ledger (FR-42)
3. Pre-emptive resource hold (FR-33)
4. Silent-mode replay (FR-43)
5. Equity guard (FR-27)

| Owner | Task |
|---|---|
| Backend/ML | Winnable features, in order |
| Frontend | Visual polish. **The dashboard is 15% of the grade** — spacing, colour severity, typography |
| Story | Deck complete; **first full rehearsal at H38** |

---

## Hours 40–46 — Rehearsal

**Feature freeze at H40. No exceptions.** The most common way a good build loses is a bug
introduced at hour 44 by someone who could not stop improving it.

| Owner | Task |
|---|---|
| All | Full run-through: T+0, T+8, T+14 — **three times minimum** |
| All | `/sundara-demo` battle-cards; each person answers hostile questions in their area |
| Backend | Demo reset command (NFR-05); deterministic seeds (NFR-06); test on the presentation machine |
| Story | Screenshots and a recorded video as fallback for every demo beat |

**✅ Checkpoint H46:** anyone on the team can run the full demo alone. Judges ask questions
mid-demo; whoever is driving must be able to keep going while someone else answers.

---

## Hours 46–48 — Reserve

Do not schedule work here. This buffer is for the projector that will not connect, the laptop that
will not wake, and the dependency that vanishes. Every team that schedules into this window
presents something broken.

---

## Cut-line summary

| Hour | Gate | If failed |
|---|---|---|
| **H12** | Live queue with real model output | Stop everything else; simplify the model |
| **H34** | All three judge interventions working | Cut all P1/P2; fix the interventions |
| **H40** | Feature freeze | No new code — rehearse |

## Never cut

FR-14 (AI-drafted override) · FR-23 (confidence gates) · FR-31 (named infeasibility) ·
FR-37 (2-click override) · FR-39 (hash-chained audit).

Those five *are* the three judge interventions. Everything else is negotiable.