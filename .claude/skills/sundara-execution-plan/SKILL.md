---
name: sundara-execution-plan
description: Phase 2 of the Sundara Command hackathon - the detailed execution plan with technical and non-technical requirements. Use when scoping what to build, when a developer needs an unambiguous specification, when planning the 48-hour schedule, when defining API contracts or data schemas, or when answering business-track questions about budget, regulation, privacy, change management, or the 12-month measurable impact plan. Covers numbered FR/NFR requirements, integration constraints against unreplaceable hospital systems, and the starvation guard.
license: MIT
metadata:
  suite: sundara-command
  role: phase
  phase: 2
---

# Phase 2 — Execution Plan

Turns the research findings into a specification a developer can build from without asking a
question, and a business case that survives the Business Solution track.

**Exit condition:** every Tier-1 feature has a numbered requirement, an acceptance criterion, and
an owner. No one on the team is guessing what "done" means.

## Where to look

| You need | Open |
|---|---|
| What to build, precisely — FR/NFR with acceptance criteria | `references/requirements-technical.md` |
| Budget, regulation, privacy, governance obligations, change management, 12-month impact plan | `references/requirements-nontechnical.md` |
| Hour-by-hour 48-hour schedule with cut lines | `references/build-schedule-48h.md` |
| How to integrate without replacing hospital systems | `references/integration-constraints.md` |
| JSON schemas for patient, vitals, resource, network event | `references/data-contracts.md` |

## Stack — decided, do not relitigate mid-build

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (React) + TypeScript** | Highest demo ceiling; the dashboard *is* 40% of the impression |
| Backend | **FastAPI (Python 3.13)** | Same language as the models; WebSocket support for live vitals |
| Live updates | **WebSocket** | The queue must visibly re-rank on its own — that is the theme, rendered |
| Models | XGBoost · GRU (PyTorch) · SHAP · scikit-learn | Tier 1 only |
| Store | **SQLite** | Zero-setup, file-based, trivially resettable between demo runs |
| Package mgmt | **uv** (Python) · **npm** (Node) | Both verified present |

**Docker is not installed on the build machine.** Everything must run natively. Do not add a
container dependency the day before judging.

## The five requirements most teams get wrong

Each is explicitly demanded by the brief and each is commonly missed.

1. **FR-18 Starvation guard.** Wait time must accrue priority so low-acuity patients cannot be
   deprioritised indefinitely. The brief forbids reaching the wait-time target "by simply
   deprioritizing lower-acuity patients." Publish the low-acuity 90th-percentile wait beside the
   headline average — that metric is what makes the headline believable.

2. **FR-23 Named infeasibility.** The staffing optimiser must state what is *impossible* tonight,
   not just what is optimal. "Hospital C's nurse pool cannot reach Hospital A — corridor down" is
   the criterion-4 answer. An optimiser returning a clean optimum under a transit strike is less
   credible, not more.

3. **FR-31 Hash-chained audit.** Each audit entry hashes its predecessor, so tampering is
   detectable. The brief says this may end up in court; a mutable log is not evidence.

4. **NFR-07 Read-only integration.** Zero write-back to hospital systems. "Existing hospital
   systems cannot be replaced" is a hard constraint, and a read-only sidecar is also the fastest
   route to hospital IT approval — a business answer as well as a technical one.

5. **FR-14 AI-drafted override.** When confidence is low, the AI pre-fills the override form.
   The system moves first toward its own reversal. This is the theme at its sharpest and the
   strongest available counter to automation bias (FM-6 in `/sundara-research`).

## Requirement numbering

- `FR-nn` functional · `NFR-nn` non-functional · `BR-nn` business/non-technical
- Every requirement carries a **priority** (`P0` demo-critical, `P1` scored, `P2` if time) and a
  **testable acceptance criterion**. A requirement without an acceptance criterion is a wish.
- **Cut P2 without discussion when behind schedule.** Deciding that in advance is what makes the
  cut possible at hour 30 — that is the moment teams instead try to finish everything and ship
  nothing that works.

## Working this phase

1. Read `references/requirements-technical.md` and assign owners to every P0.
2. Read `references/integration-constraints.md` before designing any data ingress — it constrains
   the architecture more than anything else in the brief.
3. Freeze `references/data-contracts.md` early. Frontend and backend will be built in parallel by
   different people; a schema change at hour 30 is the classic way a hackathon build dies.
4. Put `references/requirements-nontechnical.md` into the deck. The Business Solution track is a
   graded objective, and governance plus staffing realism are 30% of the rubric.
5. Track against `references/build-schedule-48h.md` and honour the cut lines.

## Guardrail

**The demo is the deliverable.** A requirement that does not appear on screen during the fourteen
minutes of the live stress test earns nothing, however well engineered. When forced to choose,
build the thing a judge will see.