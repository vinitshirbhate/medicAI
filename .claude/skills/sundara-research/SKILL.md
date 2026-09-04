---
name: sundara-research
description: Phase 1 of the Sundara Command hackathon - the deep research plan. Use when starting the project, when you need to justify a model or design choice to a judge, when writing the required underrepresentation position paper, or when asked where AI should assist versus where established clinical protocol must remain the sole authority. Covers triage frameworks (ESI, START, SALT, JumpSTART, NEWS2, qSOFA, SOFA, WHO dengue, ABA burn criteria), documented real-world AI triage failure modes with citations, and mitigation design.
license: MIT
metadata:
  suite: sundara-command
  role: phase
  phase: 1
---

# Phase 1 — Deep Research Plan

This phase serves the case's **Research Objective** track and, more importantly, supplies the
evidence that makes every later design choice defensible. A judge asking "why did you build it
that way?" should get a citation, not an opinion.

**Exit condition:** every significant model and interface choice traces to a cited finding.

## Why this phase is not optional

The brief demands mitigations for failure modes **"reported in real deployments"** and explicitly
warns against "one you invented for convenience." That is a direct instruction to do literature
work. It is also the cheapest differentiator in the competition: most teams skip straight to code,
so a team that can name the Epic Sepsis Model external validation result and show the specific
mitigation it drove is instantly in a different tier.

## The three research deliverables

| # | Deliverable | Reference | Feeds |
|---|---|---|---|
| 1 | Triage-framework analysis with the **authority boundary** — where AI assists vs. where protocol rules | `references/triage-frameworks.md` | The ranking policy in `/sundara-triage-engine` |
| 2 | Failure-mode catalogue, cited, each with a designed mitigation | `references/failure-modes.md` | Prototype safeguards, judge battle-cards |
| 3 | 1–2 page position paper on training-data underrepresentation | `references/position-paper.md` | Criterion 3 (15%), the equity guard |

Keep sources in `references/research-log-template.md`. **Verify every citation before you present
it** — a misattributed statistic under challenge costs more than omitting it.

## The finding that should shape your architecture

Read `references/failure-modes.md` in full, but if you read one thing, read this:

> **Sjoding et al., NEJM 2020** — pulse oximetry overestimates true oxygen saturation in patients
> with darker skin. Occult hypoxemia (arterial SaO₂ <88% while SpO₂ reads 92–96%) occurred at
> roughly three times the rate in Black patients compared with White patients.

SpO₂ is one of the strongest features in any deterioration model, and it is the single most
prominent number on your P-1042 demo card. A system that treats SpO₂ as ground truth inherits a
documented racial bias directly into its triage ranking.

**The mitigation, built in:** SpO₂ is never a solitary trigger. Respiratory rate, heart rate,
work-of-breathing and lactate corroborate it, and a normal-looking SpO₂ paired with a rising RR
raises rather than lowers concern. This is a research finding changing an architecture — exactly
what criterion 3 rewards, and a genuinely strong answer to "how does your system behave
differently for underrepresented patients?"

## The authority boundary — your headline research finding

The case asks you to "identify specifically where an AI layer should assist versus where
established clinical protocol should remain the sole authority." Answer it precisely:

| Layer | Authority | Rationale |
|---|---|---|
| **Acuity band assignment** (ESI 1–5, START Red/Yellow/Green/Black) | **Protocol — sole authority** | Validated, auditable, legally defensible, trained into every clinician. An AI overriding a band is unaccountable and untrainable. |
| **Ordering within a band** | **AI assists** | Protocol deliberately does not rank within a band. Ten ESI-2 patients arrive as an unordered set — this is the genuine, unfilled gap where AI adds value. |
| **Band escalation** | **AI proposes, human disposes** | The AI may flag "this ESI-3 is behaving like an ESI-2" as an explicit, confirmable escalation with its evidence. Never silent. |
| **Deterioration forecasting** | **AI leads** | Protocols score the present. Forecasting the next two hours is the capability humans lack under load — and is where "AI makes the first move" lives. |
| **Resource feasibility** | **AI leads** | Network-wide bed/staff optimisation under a transit strike is beyond human working memory. |
| **Final decision** | **Clinician — always** | Mandated by the brief. |

That table is a slide. It shows you understand that the value of AI here is filling a **specific
gap protocol leaves open**, not replacing a system that works.

## How to use this phase

1. Read `references/triage-frameworks.md` — establishes clinical vocabulary the judges use. Using
   "ESI-2" and "WHO dengue warning signs" correctly signals competence in seconds.
2. Read `references/failure-modes.md` — pick the failure mode you will mitigate publicly. The
   **Epic Sepsis Model alert-fatigue result** is the strongest choice: it is famous, it is
   quantified, and its mitigation (alert budgeting) is visible in your UI.
3. Draft `references/position-paper.md` early. It is graded and it takes longer than expected.
4. Feed the authority boundary into `/sundara-triage-engine` before writing ranking code.

## Guardrail

Research earns points only when it is **visible in the build**. A cited failure mode with no
corresponding safeguard in the prototype scores nothing. For each entry in the catalogue, name the
file or screen where its mitigation lives. If you cannot, either build it or drop the citation.