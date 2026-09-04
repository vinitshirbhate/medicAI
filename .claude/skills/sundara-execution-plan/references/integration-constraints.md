# Integration Constraints — Building Beside Systems You Cannot Replace

> **"Existing hospital systems cannot be replaced."**

This single constraint shapes the architecture more than anything else in the brief. It is also a
business-track opportunity: the read-only sidecar is both the fastest thing to build and the
easiest thing for hospital IT to approve. Say both.

---

## 1. The architectural position

Sundara Command is a **read-only sidecar**, not a replacement and not a middleware layer that
hospital systems depend on.

```
┌─────────────────────────────────────────┐
│   EXISTING HOSPITAL SYSTEMS (untouched) │
│   HIS · EHR · LIS · ADT · Monitors      │
└───────────────┬─────────────────────────┘
                │  READ ONLY  (HL7 v2 / FHIR / DB replica)
                ▼
┌─────────────────────────────────────────┐
│   SUNDARA ADAPTER LAYER (per hospital)  │
│   normalise · pseudonymise · buffer     │
└───────────────┬─────────────────────────┘
                ▼
┌─────────────────────────────────────────┐
│   SUNDARA COMMAND  (own store, own UI)  │
└─────────────────────────────────────────┘
                │
                ▼   Recommendations surface in the Sundara UI only.
            CLINICIAN          Never written back into the HIS.
```

**There is no write path. Not disabled — absent.** (NFR-07.)

**Why this is the right answer, and how to defend it:**

1. **Safety.** A system that cannot write cannot corrupt the medical record. Under the "who is
   accountable when it's wrong" question, "the system is physically incapable of altering the
   record" is a far stronger answer than a permissions policy.
2. **Approvability.** Hospital IT approves read-only integrations in weeks and write integrations
   in quarters. Across 40 hospitals in a 12-month programme, that difference decides feasibility.
3. **Reversibility.** If Sundara Command is switched off tomorrow, every hospital operates exactly
   as it did before. Nothing depends on it. That is what makes a pilot politically possible.
4. **Cost.** It is why integration is ₹14 cr rather than several times that.

**The clinician's decision is recorded in the hospital's own system, as it is today.** Sundara
records the recommendation and the decision for audit; the medical record remains the HIS's.

---

## 2. Interfaces to consume

| Source | Standard | Carries | Notes |
|---|---|---|---|
| **ADT** | HL7 v2 (A01/A04/A08) | Admissions, registrations, transfers | Triggers patient creation |
| **Labs** | HL7 v2 ORU^R01 | Results | Platelets, lactate, CBC — display source and timestamp (FR-05) |
| **Orders/obs** | HL7 v2 / FHIR `Observation` | Vitals | Where monitors feed the HIS |
| **Patient/encounter** | FHIR `Patient`, `Encounter`, `Condition` | Demographics, history | Modern sites only |
| **Monitors** | Vendor feed / HL7 | Continuous vitals | Highest-value, hardest to obtain |
| **Capacity** | DB replica or CSV/API | Beds, staff rosters, equipment | Frequently a spreadsheet in practice — **plan for that** |

**Assume heterogeneity.** Across 40 hospitals you will find modern FHIR at a few sites, HL7 v2 at
most, and manual exports at some. The adapter layer exists precisely to absorb that, and saying so
demonstrates operational realism.

**For the MVP:** simulate this feed. Do not build a real HL7 parser during a hackathon — build the
adapter *interface* and simulate behind it, so the architecture is honest even though the source
is synthetic. Say exactly that to judges; it reads as engineering judgement rather than a gap.

---

## 3. Degradation — required, not optional

Feeds fail. Design for it explicitly (NFR-08):

| Failure | Behaviour |
|---|---|
| Lab feed down | Labs marked stale with age; completeness drops; **confidence drops**; system says why |
| Monitor feed down | Falls back to manually entered vitals; trajectory features flagged unavailable |
| Model service down | Falls back to a NEWS2-style protocol score, **labelled on screen as fallback** |
| Adapter down | Queue freezes with a visible "data as of HH:MM" stamp — never silently shows stale data as live |

**The rule: degrade visibly.** A system that silently shows stale data as current is more dangerous
than one that is plainly offline. Every degraded state names itself on screen.

This connects to the theme: the AI makes the first move about **its own failures too**, announcing
degradation before a clinician discovers it.

---

## 4. Privacy by architecture

| Layer | Sees |
|---|---|
| **Hospital node** | Full patient data, inside the hospital boundary |
| **Network command** | Aggregates only — counts, capacity, pseudonymous risk tiers |

Identifiable data never leaves the hospital. The network view shows "Hospital B: 1 ICU bed
available," never a patient list. Pseudonymous IDs at the network layer, re-identifiable only
within the originating hospital.

This satisfies BR-06 by construction rather than by policy — and it is a much better answer to a
privacy question, because it does not depend on anyone behaving correctly.

---

## 5. Deployment topology

| Tier | Runs | Why |
|---|---|---|
| **Hospital edge node** | Adapter, inference, local queue, audit | Continues working if the network link drops — an ED cannot depend on a WAN |
| **Network command** | Aggregation, cross-hospital optimisation, network dashboard | Needs the whole picture |

**Inference runs at the edge.** Latency, resilience, and privacy all point the same way, and it
means a hospital keeps its triage support during exactly the kind of night when the network is
most stressed.

---

## 6. Requirements this section imposes

| ID | Requirement |
|---|---|
| NFR-07 | Read-only; no write path exists in the adapter layer |
| NFR-08 | Named, visible degraded modes for every feed |
| BR-06 | Identifiers never leave the hospital boundary |
| — | Adapter interface built and simulated for the MVP; interface honest, source synthetic |
| — | Every displayed value carries a source and a timestamp |
| — | Edge node functions without the network link |

## What to say to a judge

> "We don't replace anything and we don't write anything. We read ADT, labs and vitals through a
> per-hospital adapter, run inference at the edge so the ED keeps working if the network drops, and
> surface recommendations in our own interface. If you switch us off tomorrow, every hospital
> operates exactly as it did before. That's why integration is fourteen crore and not fifty, and
> it's why hospital IT can approve this in weeks."