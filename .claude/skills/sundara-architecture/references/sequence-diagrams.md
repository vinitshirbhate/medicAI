# Sequence Diagrams — The Three Judge Interventions

These fourteen minutes are the exam. Each diagram below is the system behaviour you must be able to
show live **and** narrate while it runs.

---

## T+0 — Synthetic intake, prioritised queue

Judges hand you a batch of dengue-deterioration and burn/trauma records. Tests criterion 1
(clinical relevance and proactive capability, 20%).

```mermaid
sequenceDiagram
    autonumber
    participant J as Judges
    participant UI as Dashboard
    participant API as API
    participant FEAT as Feature service
    participant INF as Inference
    participant DEC as Decision engine
    participant AUD as Audit

    J->>UI: batch of synthetic intake records
    UI->>API: POST /patients/batch
    API->>FEAT: normalise, missingness flags
    FEAT->>FEAT: completeness per patient
    FEAT->>INF: tabular + trajectory + context

    par per patient
        INF->>INF: XGBoost risk + SHAP
        INF->>INF: GRU 2-hour forecast
        INF->>INF: ensemble spread, OOD
    end

    INF->>DEC: risk and confidence, separately
    DEC->>DEC: protocol band → order within band<br/>starvation guard → feasibility → alert budget
    DEC->>AUD: assessment, initiated_by = AI, t = 20:11:03
    DEC-->>UI: push ranked queue over WebSocket

    Note over UI: Queue renders BEFORE anyone opens a patient.<br/>Card shows AI-ranked 20:11:03 / opened 20:14:12.

    J->>UI: opens P-1042
    UI->>AUD: VIEW, initiated_by = HUMAN
    UI-->>J: CRITICAL · risk 87% · confidence 94%<br/>why prioritised · 2h trajectory · resource context
```

**Narrate step 11.** The queue ranked itself at 20:11:03 and a human opened it at 20:14:12. Point at
the timestamps: *"The system had already acted for three minutes before anyone looked."* That is
the theme, evidenced rather than asserted.

---

## T+8 — Near-identical acuity, different completeness

Judges introduce two patients with near-identical acuity, one with full history and one unknown,
and ask you to show live how confidence and ranking differ — **and why that difference is
defensible rather than arbitrary.** Tests criterion 3 (15%) and criterion 2 (20%).

```mermaid
sequenceDiagram
    autonumber
    participant J as Judges
    participant UI as Dashboard
    participant FEAT as Feature service
    participant INF as Inference
    participant DEC as Decision engine

    J->>UI: Patient A - full history<br/>Patient B - new, unknown
    UI->>FEAT: both
    FEAT->>FEAT: completeness A = 94%, B = 41%
    FEAT->>INF: features + missingness flags

    par Patient A
        INF->>INF: ensemble tight → risk 83%, spread low
    and Patient B
        INF->>INF: ensemble wide → risk 86%, spread high<br/>no baseline, no platelet trend
    end

    INF->>DEC: A risk 83 / conf 96 · B risk 86 / conf 58
    DEC->>DEC: same protocol band<br/>B confidence below threshold

    Note over DEC: Confidence GATES, never boosts.<br/>B is NOT promoted on 3 points of untrusted risk.<br/>B is NOT demoted below its band.

    DEC-->>UI: A ranked on risk<br/>B → PRIORITY REASSESSMENT + reasons
    UI-->>J: A: 83% / 96% — standard ranking<br/>B: 86% / 58% ⚠ HIGH UNCERTAINTY<br/>"No baseline SpO2 · no platelet trend · new patient"<br/>Action: priority clinical reassessment
```

**The sentence that wins this intervention** — rehearse it verbatim:

> "Patient B's risk estimate is higher, but our confidence in it is 58%. We don't promote a patient
> on a number we don't trust, and we don't demote them either. B goes to priority human
> reassessment with the missing data named. The correct response to uncertainty about a patient is
> to look at the patient — not to reorder a queue on noise."

That answers "defensible rather than arbitrary" directly: the difference in treatment comes from a
stated policy applied identically to both, not from a score.

---

## T+14 — The fatigued charge nurse overrides

Judges roleplay a charge nurse who disagrees with the top recommendation and ask you to show, on
screen, exactly how she overrides it and what happens to the audit trail. Tests criterion 5 (15%).

```mermaid
sequenceDiagram
    autonumber
    participant N as Charge Nurse 27
    participant UI as Dashboard
    participant API as API
    participant DEC as Decision engine
    participant AUD as Audit - hash chained

    Note over UI: AI recommends P-1042 as priority #1

    N->>UI: opens recommendation
    UI->>AUD: seq 38 · VIEW · HUMAN · 20:14:12
    N->>UI: clicks OVERRIDE

    alt AI confidence is low
        UI-->>N: override form PRE-FILLED by the AI<br/>reason and missing data already populated
        Note over UI: The AI moves first toward its own reversal.
    else confidence is adequate
        UI-->>N: structured reason options
    end

    N->>UI: "Bedside assessment differs from system data"
    UI->>API: POST /override  (click 2 of 2)
    API->>DEC: recompute ranking with override
    DEC-->>UI: P-1042 #1 → #3
    API->>AUD: seq 39 · OVERRIDE · HUMAN · 20:14:32<br/>prev 1 → new 3 · reason code · prev_hash → hash
    API->>AUD: seq 40 · REASSESSMENT_TIMER_STARTED · 20:14:33

    UI-->>N: "Override accepted.<br/>Reassessment recommended in 10 minutes."
    Note over UI: The AI does not argue.<br/>No confirmation nag, no justification prompt.

    N->>UI: opens audit trail
    UI-->>N: full sequence, hash-chained, tamper-evident
```

**Three things to point at while this runs:**

1. **Two clicks.** Override is not a buried escape hatch — it carries the same visual weight as
   Accept. A hard-to-find override is how automation bias gets designed in.
2. **The AI does not argue.** No "are you sure?", no justification demand. It accepts, and it
   schedules a reassessment. Say: *"The system defers. It just doesn't forget."*
3. **The hash chain.** Run the verify command live. Altering entry 39 invalidates 40 onward. *"The
   brief says this might end up in court. A log you can edit isn't evidence."*

---

## Governance — accountability swimlane

Who is answerable, for what, when the system is wrong. Detail in `/sundara-governance`.

```mermaid
graph TB
    subgraph L1["DECISION LAYER — the individual decision"]
        CL["<b>Clinician</b><br/>accountable for the decision made<br/>with the information available"]
    end
    subgraph L2["SYSTEM LAYER — the system's behaviour"]
        CMIO["<b>Chief Medical Information Officer</b><br/>named accountable owner"]
        CAISC["<b>Clinical AI Safety Committee</b><br/>authority to suspend"]
    end
    subgraph L3["OVERSIGHT LAYER — performance over time"]
        MON["<b>Drift monitoring</b><br/>subgroup performance"]
        DISC["<b>Disclosure duty</b><br/>72 hours, harm or not"]
    end

    EVENT["A recommendation<br/>turns out wrong"] --> TRIAGE{"What failed?"}
    TRIAGE -->|"Decision, given<br/>what was shown"| CL
    TRIAGE -->|"System presented it<br/>as more reliable<br/>than it was"| CMIO
    TRIAGE -->|"Degraded over time,<br/>undetected"| MON

    CL --> RCA["<b>72-hour root-cause review</b>"]
    CMIO --> RCA
    MON --> RCA
    CAISC --> RCA
    RCA --> DISC
    RCA --> CHANGE["Model change control<br/>versioned, audited<br/><i>never silent</i>"]
```

**The answer to "who is accountable when the system is wrong" is not one name — it is a triage.**
The wrong question produces the wrong answer, so ask *what* failed first. A clinician is
accountable for a reasonable decision made on what they were shown; they are **not** accountable
for a system that presented a recommendation as more reliable than it was. That is the CMIO's.

Being able to state that distinction cleanly is most of criterion 5.