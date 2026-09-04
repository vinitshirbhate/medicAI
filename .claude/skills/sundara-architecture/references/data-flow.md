# Data Flow — Ingestion to Features

## 1. End-to-end ingestion

```mermaid
graph TB
    subgraph src["SOURCES - existing systems, read only"]
        ADT["ADT / registration<br/>HL7 v2 A01, A04, A08"]
        LAB["Laboratory<br/>HL7 v2 ORU^R01"]
        MON["Monitors<br/>continuous vitals"]
        FHIR["FHIR<br/>Patient, Encounter, Condition"]
        MAN["Manual entry<br/>nurse intake form"]
        CAP["Capacity feed<br/>beds, roster, equipment"]
    end

    NORM["<b>NORMALISATION</b><br/>units, code systems, timezone<br/>pseudonymisation"]

    subgraph val["VALIDATION"]
        RANGE["Range checks<br/>HR 0-300, SpO2 0-100, GCS 3-15"]
        STALE["Staleness marking<br/>age_minutes, is_stale"]
    end

    MISS["<b>MISSINGNESS RESOLUTION</b><br/>value + explicit missing flag<br/><i>never impute to zero</i>"]

    subgraph feat["FEATURE ASSEMBLY"]
        TAB["Tabular features<br/>demographics, vitals, labs<br/>comorbidities, pathway"]
        SEQ["Sequence features<br/>vitals trajectory<br/>ordered, not collapsed"]
        TXT["Text features<br/>clinical notes"]
        CTX["Context features<br/>outbreak, mass casualty, strike"]
    end

    COMP["<b>COMPLETENESS SCORE</b><br/>overall + per category"]

    ADT --> NORM
    LAB --> NORM
    MON --> NORM
    FHIR --> NORM
    MAN --> NORM
    CAP --> NORM

    NORM --> RANGE --> STALE --> MISS
    MISS --> TAB
    MISS --> SEQ
    MISS --> TXT
    MISS --> CTX
    MISS --> COMP

    COMP -.->|"drives confidence,<br/>never risk"| OUT["To inference"]
    TAB --> OUT
    SEQ --> OUT
    TXT --> OUT
    CTX --> OUT
```

**Two rules are enforced structurally here, not by convention:**

1. **Missingness resolution is a mandatory stage** every value passes through. There is no path
   from a source to a feature that skips it, so imputation-to-zero cannot happen by accident.
2. **Completeness drives confidence, never risk.** The dotted edge is deliberate. A patient is not
   sicker because we know less about them — we are merely less sure. Wiring completeness into the
   risk path is the single most common way teams fail the T+8 challenge.

---

## 2. Missingness handling

```mermaid
graph LR
    IN["Incoming value"] --> Q{"Present?"}
    Q -->|Yes| V["value = x<br/>missing = 0"]
    Q -->|"No - not measured"| M1["value = null<br/>missing = 1"]
    Q -->|"No - explicitly unknown"| M2["value = null<br/>missing = 1<br/>unknown_declared = 1"]
    V --> MODEL["Model input pair"]
    M1 --> MODEL
    M2 --> MODEL
    M1 --> CONF["Completeness ↓<br/>Confidence ↓"]
    M2 --> CONF
```

The model always receives a **pair** — value and missingness flag — so it can learn what absence
itself predicts. A missing platelet count on a dengue patient at day 4 is informative: it usually
means the test has not come back yet, which is itself a fact about how recently the patient arrived.

`unknown_declared` separates *"nobody asked"* from *"we asked and the patient does not know."*
The case is explicit that Unknown must not be treated as No; this is where that is enforced.

---

## 3. Continuous re-assessment loop — where the theme lives

```mermaid
sequenceDiagram
    participant MON as Monitor feed
    participant ADAPT as Adapter
    participant FEAT as Feature service
    participant INFER as Inference
    participant DEC as Decision engine
    participant WS as WebSocket
    participant UI as Dashboard
    participant AUD as Audit

    loop every new observation
        MON->>ADAPT: vitals at T
        ADAPT->>FEAT: normalised + missingness
        FEAT->>INFER: features + trajectory
        INFER->>INFER: risk, spread, SHAP, OOD
        INFER->>DEC: risk + confidence, separately
        DEC->>DEC: rank within band, starvation guard,<br/>resource feasibility, alert budget
        DEC->>AUD: assessment, initiated_by = AI
        DEC->>WS: rank change
        WS->>UI: push - no refresh
    end

    Note over UI: The queue re-ranks while<br/>nobody is looking at it.
    Note over AUD: Card shows AI-ranked time<br/>vs human-opened time.
```

**This loop is "AI makes the first move" as a system property**, not a UI flourish. The
architecture is a continuous evaluator that pushes, not a scorer that answers when asked.

The `AI-ranked time` vs `human-opened time` gap on each card is the visible proof. Show a card
where the AI acted at 20:11:03 and the nurse opened it at 20:14:12 — three minutes in which the
system had already acted.

---

## 4. Degradation paths

```mermaid
graph TB
    CHK{"Feed health"}
    CHK -->|"Labs down"| D1["Labs marked stale with age<br/>completeness ↓, confidence ↓<br/><b>reason shown on screen</b>"]
    CHK -->|"Monitors down"| D2["Fall back to manual vitals<br/>trajectory features flagged unavailable"]
    CHK -->|"Model service down"| D3["Fall back to NEWS2-style score<br/><b>labelled FALLBACK on screen</b>"]
    CHK -->|"Adapter down"| D4["Queue freezes<br/><b>data as of HH:MM stamp</b>"]
    CHK -->|"Network link down"| D5["Edge continues<br/>cross-hospital routing unavailable"]

    D1 --> VIS["Every degraded state<br/><b>names itself on screen</b>"]
    D2 --> VIS
    D3 --> VIS
    D4 --> VIS
    D5 --> VIS
```

**Degrade visibly.** A system silently showing stale data as current is more dangerous than one
plainly offline, because it looks trustworthy while being wrong.

This is also the theme applied to the system's own failures: **the AI announces its degradation
before a clinician discovers it.** Worth saying aloud — it shows the theme is a design principle
rather than a feature list.

---

## 5. Privacy boundary

```mermaid
graph LR
    subgraph hosp["INSIDE HOSPITAL BOUNDARY"]
        PID["Identifiable data<br/>name, MRN, DOB"]
        PSEUDO["Pseudonymisation<br/>P-1042"]
        LOCAL["Local store + audit"]
    end
    subgraph netw["NETWORK COMMAND"]
        AGG["Counts, capacity<br/>pseudonymous risk tiers"]
    end
    PID --> PSEUDO --> LOCAL
    LOCAL -->|"aggregates only"| AGG
    AGG -.->|"cannot re-identify"| PID
    linkStyle 3 stroke:#c00,stroke-dasharray:3 3
```

Re-identification is possible **only inside the originating hospital**. The network layer is
structurally incapable of it, which is a stronger privacy answer than any policy, because it does
not depend on anyone behaving correctly.