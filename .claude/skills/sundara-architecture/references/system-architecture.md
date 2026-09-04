# System Architecture — Context, Containers, Deployment

## 1. C4 Level 1 — System context

**Use this as your opening architecture slide.** It shows a modest system sitting *beside*
hospital infrastructure rather than replacing it, which is the single most reassuring thing you can
show a clinical audience.

```mermaid
graph TB
    subgraph people[" "]
        NURSE["Triage Nurse<br/>ranks and overrides"]
        DOC["ED Clinician<br/>accepts or overrides"]
        COORD["Network Coordinator<br/>routes and reallocates"]
        CMIO["CMIO / AI Safety Committee<br/>accountable owner"]
    end

    SC["<b>SUNDARA COMMAND</b><br/>Triage prioritisation and<br/>resource orchestration<br/><i>read-only sidecar</i>"]

    subgraph existing["Existing hospital systems - cannot be replaced"]
        HIS["HIS / EHR"]
        LIS["Laboratory system"]
        ADT["ADT / registration"]
        MON["Patient monitors"]
    end

    NURSE --> SC
    DOC --> SC
    COORD --> SC
    CMIO --> SC

    ADT -.->|"HL7 v2 read only"| SC
    LIS -.->|"ORU results read only"| SC
    MON -.->|"vitals stream read only"| SC
    HIS -.->|"FHIR read only"| SC

    SC -.->|"NO WRITE PATH"| HIS

    linkStyle 8 stroke:#c00,stroke-width:2px,stroke-dasharray:3 3
```

The crossed-out write path is deliberate. Point at it: *"There is no write path. Not disabled —
absent."*

---

## 2. C4 Level 2 — Containers

```mermaid
graph TB
    subgraph edge["HOSPITAL EDGE NODE - one per hospital"]
        ADAPT["<b>Adapter layer</b><br/>HL7 v2 / FHIR ingest<br/>normalise, pseudonymise<br/>READ ONLY"]
        FEAT["<b>Feature service</b><br/>assembly, missingness flags<br/>completeness scoring"]
        INFER["<b>Inference service</b><br/>XGBoost, GRU, ensemble<br/>SHAP, calibration, OOD"]
        DEC["<b>Decision engine</b><br/>lexicographic ranking<br/>starvation guard, alert budget"]
        RES["<b>Resource engine</b><br/>demand forecast<br/>constraint optimiser"]
        API["<b>API - FastAPI</b><br/>REST + WebSocket"]
        DB[("<b>Local store - SQLite</b><br/>patients, assessments<br/>hash-chained audit")]
        UI["<b>Dashboard - Next.js</b><br/>queue, triage report<br/>override, resources"]
    end

    subgraph net["NETWORK COMMAND - aggregates only"]
        AGG["<b>Aggregation service</b><br/>capacity, counts<br/>pseudonymous risk tiers"]
        NOPT["<b>Network optimiser</b><br/>cross-hospital routing<br/>reachability constraints"]
        NUI["<b>Network dashboard</b><br/>40-hospital view"]
    end

    ADAPT --> FEAT --> INFER --> DEC --> API
    RES --> DEC
    API <--> UI
    API --> DB
    DEC --> DB

    API -.->|"aggregates only<br/>no identifiers"| AGG
    AGG --> NOPT --> NUI
    NOPT -.->|"routing advice"| API
```

**The boundary between the two subgraphs is the privacy story.** Identifiable data lives only in
the edge node. Only counts, capacity, and pseudonymous tiers cross it — so the network view can
say "Hospital B: 1 ICU bed available" and can never show a patient list.

---

## 3. Deployment topology

```mermaid
graph LR
    subgraph h1["Hospital A"]
        E1["Edge node<br/>adapter + inference<br/>+ local audit"]
    end
    subgraph h2["Hospital B"]
        E2["Edge node"]
    end
    subgraph h40["Hospital 40"]
        E40["Edge node"]
    end

    NC["<b>Network Command</b><br/>aggregation + optimisation"]

    E1 <-->|"aggregates"| NC
    E2 <-->|"aggregates"| NC
    E40 <-->|"aggregates"| NC

    E1 -.->|"survives link loss"| E1
    E2 -.->|"survives link loss"| E2
```

**Every edge node functions standalone.** If the WAN drops, the ED keeps its triage support and
loses only cross-hospital routing advice — degraded, visibly, and never silently.

State that trade-off explicitly: on the night the network is most stressed is exactly the night a
centralised inference design would fail.

---

## 4. Component responsibilities

| Container | Owns | Explicitly does not |
|---|---|---|
| **Adapter** | Ingest, normalise, pseudonymise, buffer | Write anything back; interpret clinically |
| **Feature service** | Feature assembly, missingness flags, completeness | Impute missing values |
| **Inference** | Risk, trajectory, ensemble spread, SHAP, OOD | Rank patients; decide anything |
| **Decision engine** | Lexicographic ranking, starvation guard, alert budget, resource feasibility | Assign protocol bands; execute actions |
| **Resource engine** | Demand forecast, constraint optimisation, named infeasibility | Move staff or patients |
| **API** | REST + WebSocket, auth, audit writes | Business logic |
| **Dashboard** | Presentation, clinician actions | Compute risk or rank |
| **Network command** | Aggregation, cross-hospital routing | See identifiable patient data |

**The critical separation: inference produces numbers; the decision engine produces order.** They
are different services because they answer to different authorities — the model is a statistical
artefact, the ranking is a policy. Keeping them apart is what lets you tell a judge exactly where
the clinical policy lives and show it as readable code rather than as learned weights.

---

## 5. Technology choices

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js + TypeScript | Demo ceiling; the dashboard carries the UX and presentation criteria |
| Backend | FastAPI, Python 3.13 | Same runtime as the models; native WebSocket |
| Transport | REST + WebSocket | The queue must re-rank visibly without a refresh |
| Models | XGBoost, PyTorch GRU, scikit-learn, SHAP | Tier 1 only |
| Store | SQLite | Zero setup, file-based, resettable between demo runs in one command |
| Packaging | uv, npm | Both verified present on the build machine |

**No Docker.** It is not installed on the build machine, and adding a container dependency the day
before judging is an avoidable failure mode. Everything runs natively.