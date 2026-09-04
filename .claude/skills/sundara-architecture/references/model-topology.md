# Model Topology — From Features to a Defensible Rank

## 1. The model stack

```mermaid
graph TB
    subgraph inputs["FEATURES"]
        TAB["Tabular<br/>demographics, vitals, labs<br/>comorbidities, pathway"]
        SEQ["Trajectory<br/>HR, SpO2, RR, temp, platelets<br/>ordered sequence"]
        TXT["Clinical text<br/>notes, chief complaint"]
        CTX["Context<br/>outbreak, mass casualty, strike"]
    end

    subgraph models["SPECIALIST MODELS - Tier 1 solid, Tier 2 optional"]
        XGB["<b>XGBoost</b><br/>structured risk<br/>+ SHAP"]
        GRU["<b>GRU</b><br/>trajectory and<br/>2-hour forecast"]
        BERT["<i>BioClinicalBERT</i><br/>Tier 2 - notes extraction"]
    end

    FUSE["<b>FUSION</b><br/>MLP over concatenated<br/>representations"]

    subgraph unc["UNCERTAINTY ENGINE"]
        ENS["Deep ensemble<br/>5 members - spread"]
        CAL["Calibration<br/>temperature / isotonic"]
        OOD["OOD detection<br/>Mahalanobis / Isolation Forest"]
        COMPL["Completeness signal"]
    end

    DEC["<b>DECISION ENGINE</b><br/>policy, not learned weights"]

    TAB --> XGB
    SEQ --> GRU
    TXT --> BERT
    CTX --> XGB
    CTX --> GRU

    XGB --> FUSE
    GRU --> FUSE
    BERT -.-> FUSE

    FUSE --> ENS --> CAL --> DEC
    OOD --> DEC
    COMPL --> DEC

    DEC ==> RISK["<b>Risk</b><br/>calibrated probability"]
    DEC ==> CONF["<b>Confidence</b><br/><i>separate output</i>"]
    DEC ==> RANK["<b>Rank</b><br/>within protocol band"]
```

**Specialist models plus fusion, not one large multimodal model.** Each component is separately
debuggable, separately explainable, and separately replaceable — which is what makes the 20%
explainability criterion attainable. You cannot SHAP your way out of a single opaque network.

**Note the three separate outputs.** Risk, confidence, and rank leave the decision engine as
distinct quantities and are never combined into one number anywhere downstream.

---

## 2. The uncertainty engine

```mermaid
graph TB
    P["Fused prediction"] --> E["Ensemble members<br/>82%, 91%, 86%, 80%, 87%"]
    E --> MEAN["Mean = 85.2%<br/><b>→ risk</b>"]
    E --> SPREAD["Spread<br/>disagreement signal"]

    SPREAD --> CONF["<b>CONFIDENCE</b>"]
    OODIN["OOD distance"] --> CONF
    COMPIN["Data completeness"] --> CONF

    CONF --> LOW{"Confidence<br/>below threshold?"}
    LOW -->|No| NORMAL["Standard ranking"]
    LOW -->|Yes| FLAG["⚠ HIGH UNCERTAINTY<br/>name the reasons<br/>route to human reassessment<br/><b>pre-draft the override</b>"]
```

Three independent contributors to confidence — **ensemble disagreement**, **distance from the
training distribution**, and **data completeness**. They answer different questions: *do my models
agree*, *have I seen patients like this*, and *do I have enough to go on*. A system using only one
of the three will be confidently wrong in the other two ways.

---

## 3. The ranking decision tree — the most defensible thing you build

```mermaid
graph TB
    START["New or updated patient"] --> BAND["<b>Protocol band</b><br/>ESI or START<br/><i>authority: protocol</i>"]

    BAND --> ESC{"AI sees evidence<br/>for a higher band?"}
    ESC -->|Yes| PROP["<b>Propose escalation</b><br/>flagged, evidence shown<br/>awaiting human confirmation<br/><i>never auto-applied</i>"]
    ESC -->|No| WITHIN
    PROP --> WITHIN["<b>Order within band</b><br/><i>authority: AI</i>"]

    WITHIN --> R1["1. Deterioration risk<br/>calibrated"]
    R1 --> R2["2. Time to harm<br/>forecast slope"]
    R2 --> R3["3. Wait-time equity<br/><b>starvation guard</b>"]
    R3 --> GATE{"Confidence<br/>adequate?"}

    GATE -->|Yes| FEAS["4. Resource feasibility"]
    GATE -->|"No"| REASSESS["<b>Route to priority<br/>human reassessment</b><br/>name missing data<br/>hold position in band<br/><i>never promote on low confidence</i>"]

    REASSESS --> FEAS
    FEAS --> BUDGET["5. Alert budget<br/>cap concurrent alerts"]
    BUDGET --> OUT["<b>Ranked queue</b><br/>+ one-line rationale"]
```

### The two rules that make this defensible

**Rule 1 — Lexicographic, not blended.** Protocol assigns the acuity band; AI orders *within* it.
A patient can never be ranked above a higher acuity band by AI score alone.

*Why it matters:* a single blended score cannot answer "what authority did you override, and on
what basis?" A lexicographic policy can, in one sentence: *"We never override protocol. Protocol
doesn't order within a band — that's the gap we fill."*

**Rule 2 — Confidence gates, never boosts.** A low-confidence estimate never promotes a patient,
never demotes them below their protocol band, and routes them to priority human reassessment.

*Why it matters:* this is the T+8 answer. Patient B at 86% risk / 58% confidence does not outrank
Patient A at 83% / 96% on three percentage points the system does not trust. **The correct response
to uncertainty about a patient is to look at the patient**, not to reorder a queue on noise.

The decision engine is **readable policy code, not learned weights**. That is intentional — you can
put it on screen during questioning and walk a clinician through it line by line. A learned ranker
would score marginally better and be indefensible.

---

## 4. Resource constraint flow

```mermaid
graph TB
    subgraph demand["DEMAND"]
        ARR["Current arrivals"]
        FCAST["2h forecast<br/>LightGBM"]
        INC["Active incidents<br/>outbreak +35%, fire 84, strike"]
    end
    subgraph supply["SUPPLY - as it actually is"]
        BEDS["ICU / ED / burn beds"]
        SCHED["Staff scheduled"]
        AVAIL["Staff <b>available</b>"]
        EQUIP["Ventilators, oxygen"]
    end

    REACH["<b>REACHABILITY MATRIX</b><br/>R[origin][hospital]<br/>strike ⇒ 0 = hard constraint"]

    OPT["<b>CONSTRAINT OPTIMISER</b><br/>feasible allocations only"]

    ARR --> OPT
    FCAST --> OPT
    INC --> FCAST
    BEDS --> OPT
    SCHED -.->|"never used alone"| AVAIL
    AVAIL --> OPT
    EQUIP --> OPT
    REACH ==> OPT

    OPT --> FEASIBLE["<b>Feasible plan</b><br/>what can happen tonight"]
    OPT --> INFEASIBLE["<b>Named infeasible</b><br/>what cannot, and why<br/><i>and the best alternative</i>"]
```

**The `INFEASIBLE` output is a deliverable, not an error branch.** An optimiser that returns a
clean optimum during a transit strike is less credible, not more. Naming what is impossible —
"Hospital C's nurse pool cannot reach Hospital A tonight; corridor down" — is what earns the
staffing-realism criterion.

`SCHED -.-> AVAIL` is dotted because **scheduled staff are never used as an input to the
optimiser**. Only availability is. That single edge is the transit strike modelled properly.

---

## 5. Tier discipline

| Tier | Components | Rule |
|---|---|---|
| **Tier 1 — must work** | XGBoost + SHAP · GRU · ensemble + calibration · OOD · decision engine · resource optimiser | Demo fails without these |
| **Tier 2 — if stable** | BioClinicalBERT notes extraction | Dotted line in diagram 1 — the architecture is honest without it |
| **Tier 3 — do not build** | Medical imaging | Tabular + trajectory + text is already genuinely multimodal |

**Say the Tier 3 decision out loud to judges.** "We deliberately did not add an imaging model. It
would let us claim multimodality, and it would have cost the hours that explainability and
rehearsal needed." Stating a scope decision and its reason reads as engineering maturity —
considerably better than a half-working image classifier.