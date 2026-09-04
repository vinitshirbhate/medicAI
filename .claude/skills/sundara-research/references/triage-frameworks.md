# Clinical Triage Frameworks — and the Authority Boundary

Purpose: establish the clinical vocabulary judges expect, and answer the case's research question
— **where should an AI layer assist, and where should established protocol remain sole authority?**

> Verify details against current source guidelines before presenting. Clinical protocols are
> revised; a confidently-stated stale threshold is worse than a hedged current one.

---

## 1. ESI — Emergency Severity Index (routine ED triage)

Five-level algorithm, the dominant ED triage instrument in US emergency departments.

| Level | Meaning |
|---|---|
| **ESI-1** | Requires immediate life-saving intervention (intubation, resuscitation) |
| **ESI-2** | High risk, or confused/lethargic/disoriented, or severe pain/distress, or danger-zone vitals |
| **ESI-3** | Stable, but expected to need **two or more** resources |
| **ESI-4** | Expected to need **one** resource |
| **ESI-5** | Expected to need **no** resources |

**The gap AI fills:** ESI assigns a band, then stops. It provides **no ordering within a band**.
On a night when forty screens are red, a charge nurse faces an unordered set of ESI-2 patients and
no protocol to sequence them. That unfilled gap is the entire justification for Sundara Command —
say so explicitly. You are not replacing ESI; you are answering the question ESI declines to answer.

**Danger-zone vitals** drive ESI-2 assignment and are worth knowing, since your demo patient
P-1042 (HR 128, RR 29, SpO₂ 89%) trips them plainly.

---

## 2. START / SALT / JumpSTART (mass casualty — the 84 burn casualties)

When 84 casualties arrive in a 40-minute window, routine ED triage is not the operative protocol.
Knowing this distinction is a strong credibility signal.

**START — Simple Triage And Rapid Treatment.** Assessment in under 60 seconds per patient on
three axes (RPM):

| Axis | Trigger for IMMEDIATE (Red) |
|---|---|
| **R**espirations | Absent but returns with airway repositioning, or rate > 30/min |
| **P**erfusion | Radial pulse absent, or capillary refill > 2 s |
| **M**ental status | Cannot follow simple commands |

| Category | Meaning |
|---|---|
| **Red — Immediate** | Life-threatening, survivable with intervention |
| **Yellow — Delayed** | Serious, can tolerate delay |
| **Green — Minor** | Walking wounded |
| **Black — Expectant/Deceased** | |

**SALT** — Sort, Assess, Lifesaving interventions, Treatment/Transport — a national US
all-hazards guideline that adds a global sorting step before individual assessment.

**JumpSTART** — the paediatric adaptation of START (roughly ages 1–8), with age-appropriate
respiratory thresholds and a ventilation trial before assigning Expectant. **Relevant to your OOD
story:** paediatric physiology differs enough that adult protocols mis-triage children — which is
precisely the "unfamiliar patient profile" your model must flag rather than confidently score.

**The AI role in mass casualty is different, and you should say so.** START is deliberately crude
because speed dominates accuracy when 84 patients arrive at once. AI should **not** try to
out-triage START at the door. Its value is *after* the initial sort: re-assessing the Yellow pool
continuously, because that is where deterioration goes unnoticed while attention is on Red.

> **This is a strong, specific answer.** "Our AI watches the Yellow pile" demonstrates you
> understand mass-casualty doctrine rather than treating all triage as one problem.

---

## 3. Early warning scores — NEWS2, MEWS (deterioration detection)

**NEWS2** aggregates: respiratory rate · SpO₂ (with a separate scale for hypercapnic respiratory
failure) · air or supplemental oxygen · systolic BP · pulse · consciousness (ACVPU) · temperature.
Each is scored 0–3 and summed, with escalation thresholds by aggregate score and an escalation
trigger for any single parameter scoring 3.

**Why this matters to your build:** NEWS2 is your **baseline to beat and your fallback**. It is
simple, validated, and already trusted. Two consequences:

1. **Benchmark against it.** "Our model beats NEWS2 by X on the synthetic cohort" is a far
   stronger claim than a bare AUC, because judges know NEWS2 is the incumbent.
2. **Degrade to it.** If the model is unavailable or a patient is flagged out-of-distribution, the
   system should fall back to a NEWS2-style score and say so on screen. A graceful, named fallback
   is a governance answer, not just an engineering one.

**Caveat worth knowing:** NEWS2 uses SpO₂, so it carries the pulse-oximetry bias described in
`failure-modes.md`. Neither the incumbent nor your model escapes it — which is why corroboration
across RR/HR/lactate matters for both.

---

## 4. ICU severity scores — qSOFA, SOFA, APACHE II

| Score | Use | Notes |
|---|---|---|
| **qSOFA** | Rapid bedside sepsis risk | RR ≥ 22 · altered mentation (GCS < 15) · SBP ≤ 100 mmHg. Two or more suggests higher risk. Screening only — poor sensitivity for early sepsis. |
| **SOFA** | Organ dysfunction, six systems (respiratory, coagulation, liver, cardiovascular, CNS, renal), 0–4 each | Requires labs; used for ICU trajectory |
| **APACHE II** | ICU severity within 24 h of admission | Physiology + age + chronic health |

**Relevance:** these justify ICU bed prioritisation to a clinical audience. When your resource
engine recommends who gets the last of the two available ICU beds, grounding it in recognised
organ-dysfunction scoring is far more defensible than a proprietary number.

---

## 5. WHO dengue classification (the outbreak pathway)

The primary clinical pathway on this night. Three categories:

1. **Dengue without warning signs**
2. **Dengue with warning signs** — abdominal pain or tenderness · persistent vomiting · clinical
   fluid accumulation · mucosal bleeding · lethargy or restlessness · liver enlargement ·
   **rising haematocrit with rapid fall in platelet count**
3. **Severe dengue** — severe plasma leakage (shock / fluid accumulation with respiratory
   distress) · severe bleeding · severe organ impairment

**Build implications, and this is the highest-value section of this document:**

- **The warning signs are your feature set.** Do not invent features when a validated,
  clinician-recognised list exists. When your SHAP explanation reads "falling platelets +
  persistent fever + abdominal pain", every clinician in the room recognises WHO warning signs —
  the explanation lands instantly because it speaks their language.
- **Rising haematocrit with falling platelets is a *conjunction*.** It is a trajectory pattern
  across two variables, which is exactly what your GRU is for and exactly what a single-timepoint
  model misses. P-1042's platelet trend (128K → 110K → 96K → 82K) is this signature.
- **Day of illness matters.** Dengue deterioration classically occurs around defalcation of fever
  (the critical phase, roughly days 3–7), not at peak fever. A patient improving on day 5 may be
  entering the critical phase. **This is a genuinely proactive signal** — a model that knows day-of-
  illness can raise concern while vitals still look reassuring. That is "AI makes the first move"
  with real clinical content behind it.

---

## 6. Burn and inhalation injury (the industrial fire)

| Tool | Use |
|---|---|
| **Rule of Nines** | Rapid %TBSA estimation |
| **Parkland formula** | Fluid resuscitation: 4 mL × body weight (kg) × %TBSA over the first 24 h, half within the first 8 h |
| **Baux / revised Baux score** | Mortality prediction: age + %TBSA, with the revised version adding a substantial penalty for inhalation injury |
| **ABA referral criteria** | Which burns need a burn centre: partial-thickness burns over a significant %TBSA, burns to face/hands/feet/genitalia/perineum/major joints, full-thickness burns, electrical and chemical burns, and **inhalation injury** |

**The clinical point that should drive your demo:** in smoke inhalation, **airway compromise is
time-critical and progressive, and the patient can look well initially.** Oedema develops over
hours; the window for elective intubation closes. A patient with facial burns, singed nasal hairs,
carbonaceous sputum and hoarseness is a different clinical urgency from their current vitals.

**This is your strongest "AI makes the first move" burn case:** a patient whose vitals are
currently acceptable but whose exposure history predicts airway compromise within hours should be
escalated *now*. A reactive system waits for the SpO₂ to fall — by which time the airway may be
unintubatable. Revised Baux also means **inhalation injury changes prognosis sharply**, which
justifies weighting exposure history heavily rather than treating it as a checkbox.

---

## 7. Summary — the authority boundary

| Function | Sole authority | Rationale |
|---|---|---|
| Acuity band (ESI 1–5, START colours) | **Protocol** | Validated, auditable, universally trained, legally defensible |
| Mass-casualty initial sort | **Protocol (START/SALT)** | Speed dominates; AI cannot beat 60-second RPM at the door |
| Ordering within a band | **AI assists** | Protocol leaves this genuinely unfilled |
| Continuous re-assessment of the Yellow/Delayed pool | **AI leads** | Where deterioration is missed under load |
| Deterioration forecast (next 2 h) | **AI leads** | Humans cannot hold 40 trajectories under load |
| Network resource feasibility | **AI leads** | Beyond human working memory |
| Band escalation | **AI proposes, human confirms** | Must never be silent |
| Final disposition | **Clinician** | Mandated by the brief |

Carry this table into `/sundara-triage-engine`. It is the justification for the lexicographic
ranking policy: **AI orders within protocol bands rather than replacing them.**