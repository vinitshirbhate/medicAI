---
name: sundara-command
description: Hub skill for the Sundara Health Alliance hackathon (Case Study 4 - "AI With Initiative - Who Gets Seen First"). Use when starting any Sundara work session, when deciding what to build next, when unsure which phase you are in, or when you need the case's canonical numbers, rubric weights, or scope fence. Routes to the three phase skills (research, execution plan, MVP refinement) and to the technical, governance, and demo skills. Enforces the theme "AI makes the first move".
license: MIT
metadata:
  suite: sundara-command
  role: hub
  case: "Case Study 4 - AI With Initiative"
  theme: "AI makes the first move"
---

# Sundara Command — Hub

You are building **Sundara Command**: an AI triage-and-resource orchestration system for a
40-hospital network, during a compounding night — dengue outbreak + 84 burn/smoke casualties +
a transit strike that strands 24% of night staff.

The graded question is not "can you rank patients." It is:

> Who does the system say should be seen next — and **can you defend that answer** to a room of
> exhausted doctors, an ethics board, and eventually a court?

## The theme is a mechanism, not a tagline

**"AI makes the first move."** Six behaviours enforce it. If a feature does not serve one of
these, it is not the theme — it is decoration.

| # | Mechanism | Proven at |
|---|---|---|
| 1 | **Pre-arrival ranking** — the queue re-ranks and alerts *before* a clinician opens it | T+0 |
| 2 | **Forecast, not report** — 2-hour deterioration trajectory, not current state | T+0 |
| 3 | **Pre-emptive resource hold** — AI provisionally reserves the last ICU bed, pending human confirm | T+0 |
| 4 | **Self-flagged doubt** — AI raises its own low confidence *before* a judge challenges it | T+8 |
| 5 | **Pre-drafted override** — on low confidence the AI pre-fills the override form | T+14 |
| 6 | **First-move ledger** — every AI-initiated action logged with latency-to-human-review | Audit |

Mechanism 5 is the beat that wins the room: **the AI is the one arguing for human review.**

## Read this before anything else

- `references/case-facts.md` — every number in the case, in one place. **Never retype a figure
  from memory or from a slide.** Cite this file. Numbers drifting between the deck, the dashboard,
  and the answer to a judge is a preventable, fatal credibility loss.
- `references/rubric-map.md` — the two conflicting rubrics in the source material, which one
  governs, and which skill earns each criterion.

## The three phases

Work them in order. Each phase skill owns its deliverables and its exit condition.

| Phase | Skill | Produces | Exit condition |
|---|---|---|---|
| **1. Research** | `/sundara-research` | Triage-framework analysis, documented failure modes + mitigations, the 1–2 page underrepresentation position paper | Every model choice traces to a cited finding |
| **2. Execution** | `/sundara-execution-plan` | Numbered technical + non-technical requirements, 48h schedule, data contracts, budget, 12-month impact plan | A developer can build without asking a question |
| **3. Refinement** | `/sundara-mvp-refine` | Rubric self-audit, ranked winnable features, demo risk register, narrative arc | You know your weakest criterion and have a fix scheduled |

## Supporting skills

| Skill | Use when |
|---|---|
| `/sundara-architecture` | You need any diagram — C4, data flow, model topology, the three stress-test sequences, deployment, rollout |
| `/sundara-triage-engine` | Building the ranking, risk, uncertainty, calibration, or OOD layer |
| `/sundara-resource-engine` | Building demand forecasting or the staffing/bed constraint optimiser |
| `/sundara-governance` | Answering "who is accountable when it's wrong", audit trail, override taxonomy, model cards |
| `/sundara-demo` | Rehearsing T+0 / T+8 / T+14, judge battle-cards, failure recovery |
| `/sundara-skill-creator` | Adding or editing a skill in this suite |

## Scope fence — hold this line

The single most common way this build fails is breadth. Tiering is not a suggestion.

**Tier 1 — must work live.** XGBoost + SHAP · GRU trajectory · uncertainty (deep ensemble) ·
resource forecast · constraint engine · dashboard · override · audit trail.

**Tier 2 — only if Tier 1 is demo-stable.** BioClinicalBERT notes extraction.

**Tier 3 — do not make this a dependency.** Medical imaging. Tabular + time series + text is
already genuinely multimodal. Adding an image model to *claim* multimodality is a net negative:
it consumes the hours that explainability and demo rehearsal need.

## Non-negotiable design rules

These come from the case constraints and from documented real-world failures. Violating any one
of them costs a graded criterion outright.

1. **The AI recommends and ranks. It never autonomously executes a triage decision.** Human
   approval is mandatory for every life-critical decision. Use "Suggested", never "Execute".
2. **Protocol sets the band; AI orders within it.** Established triage protocol (ESI/START) holds
   band authority. AI escalates a band only as a flagged, human-confirmable action.
   See `/sundara-triage-engine`.
3. **Confidence gates, it never boosts.** A low-confidence score never promotes a patient. It
   triggers priority *human reassessment*. Missing information must not become false certainty.
4. **Never impute missing values to zero.** Carry an explicit missingness indicator.
   `Platelets = NULL` and `Platelets = 0` are different clinical facts.
5. **Scheduled staff ≠ available staff.** The transit strike is a hard constraint in the
   optimiser, not a dashboard label.
6. **Existing hospital systems cannot be replaced.** Read-only adapter layer, zero write-back.
7. **No LLM as the final clinical scorer.** Deterministic/ML models produce risk and rank. An LLM
   may only verbalise already-approved structured evidence, and may not invent clinical reasoning.
8. **Wait time must accrue priority.** The case explicitly forbids hitting the wait-time target by
   indefinitely deprioritising low-acuity patients. The starvation guard is a requirement, not a
   nicety. See `/sundara-execution-plan`.

## Starting a session

1. Read `references/case-facts.md`.
2. Identify your current phase from the table above; invoke that phase skill.
3. If you are inside 12 hours of judging, go straight to `/sundara-mvp-refine` and `/sundara-demo` —
   at that point, polish and rehearsal outscore new features.