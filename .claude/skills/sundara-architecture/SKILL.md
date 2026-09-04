---
name: sundara-architecture
description: Architecture and diagrams for Sundara Command. Use when you need any system diagram - C4 context or container view, data flow, model topology, the ranking decision tree, the three live stress-test sequence diagrams (T+0 intake, T+8 uncertainty divergence, T+14 override), the governance RACI swimlane, deployment topology, or the 12-month rollout. Also use when explaining the architecture to a judge, choosing where a component belongs, or preparing architecture slides. All diagrams are Mermaid, renderable on GitHub and in artifacts.
license: MIT
metadata:
  suite: sundara-command
  role: technical
---

# Sundara Command — Architecture

Every diagram in this skill is **Mermaid inside markdown**, so it renders directly on GitHub, in
Claude artifacts, and in most markdown tooling — no build step, and one source of truth. Copy a
fenced block straight into a slide tool that supports Mermaid, or screenshot the rendered view.

## Diagram index

| You need | Open | Diagrams |
|---|---|---|
| The whole system, who uses it, how it deploys | `references/system-architecture.md` | C4 context · C4 container · deployment topology |
| How data gets in and becomes features | `references/data-flow.md` | Read-only ingestion · normalisation · feature assembly · degradation paths |
| The model stack and how a rank is produced | `references/model-topology.md` | Multimodal fusion · uncertainty engine · **ranking decision tree** · resource constraint flow |
| The three judge interventions, step by step | `references/sequence-diagrams.md` | T+0 · T+8 · T+14 · governance RACI swimlane |
| Getting from prototype to 40 hospitals | `references/rollout-roadmap.md` | 12-month phased rollout |

## The one-paragraph architecture

> Sundara Command is a **read-only sidecar**. Per-hospital adapters consume ADT, labs, and vitals
> from systems that cannot be replaced, normalise them, and never write back. Inference runs at the
> **hospital edge** so an emergency department keeps working when the network link does not.
> Specialist models — gradient boosting on tabular features, a GRU on vitals trajectories, and
> optionally a clinical text model — feed a fusion layer, then an uncertainty engine that reports
> confidence **separately** from risk. A decision engine orders patients *within* protocol-assigned
> acuity bands, applies resource feasibility and a starvation guard, and presents a ranked queue
> with a one-line rationale. Every clinician action, and every AI-initiated action, lands in a
> hash-chained audit trail. Only aggregates leave the hospital boundary.

That paragraph answers most architecture questions a judge will ask. Learn it.

## Four decisions that define the architecture

Each is defensible under challenge, and each maps to a rubric criterion.

| Decision | Instead of | Why |
|---|---|---|
| **Read-only sidecar, no write path** | Middleware the HIS depends on | Cannot corrupt the medical record; approvable in weeks not quarters; switch it off and every hospital works as before |
| **Specialist models + fusion** | One large multimodal model | Each component is debuggable, explainable, and independently replaceable. A single opaque model cannot survive the 20% explainability criterion. |
| **Inference at the edge** | Central inference for all 40 sites | Latency, resilience, and privacy all point the same way — and the ED keeps triage support on exactly the night the network is stressed |
| **Uncertainty as a separate output** | One blended "AI score" | Risk and confidence are different quantities. Fusing them is the T+8 failure. |

## Where "AI makes the first move" lives in the architecture

Not a UI veneer — three structural features:

1. **A continuous re-ranking loop**, not a request/response scorer. The system re-evaluates on
   every new observation and pushes over WebSocket. The queue changes while nobody is looking at
   it, and the timestamps prove it.
2. **A forecast horizon in the model layer.** The GRU predicts forward two hours; the architecture
   emits a trajectory, not a state.
3. **AI-initiated actions as first-class audit events.** `initiated_by: AI` is in the schema, so
   the first-move ledger is a query over the audit trail rather than a bolted-on feature.

## Using this skill

- Building a component? Open `references/model-topology.md` or `references/data-flow.md` first —
  they define the boundaries, and boundary drift is what makes parallel work collide.
- Preparing slides? Take C4 context + model topology + one sequence diagram. **Three diagrams,
  not eleven.** The rest are for answering questions, not for presenting.
- Asked "where does X live?" — the container diagram in `references/system-architecture.md`
  answers it.

## Guardrail

**Do not present the full model topology as your opening architecture slide.** It shows eight
boxes and invites questions about the ones you did not build. Lead with the C4 context diagram —
which shows a modest sidecar beside systems you respect — and go deeper only when asked. Judges
reward architecture that looks deployable more than architecture that looks ambitious.