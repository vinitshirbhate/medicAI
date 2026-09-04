# Sundara Health Alliance AI Triage Case Study

## Case Study Context

**Case:** AI With Initiative: Who Gets Seen First

**Client:** Sundara Health Alliance, a 40 hospital metropolitan network.

### Case facts

- 40 hospitals in the network
- Average emergency department wait: **51 minutes**
- Critical cases identified after avoidable delay: **16%**
- ICU occupancy: **93%**
- Night shift clinical staff shortage: **21%**
- Maximum budget: **₹58 crore**
- Existing hospital systems cannot be replaced
- Human approval is mandatory for every life critical decision
- Patient privacy must be maintained
- Measurable impact is required within 12 months of go live

### Compounding night scenario

It is the third night of a city wide dengue outbreak.

At **7:50 PM**, an industrial fire sends **84 burn and smoke inhalation casualties** across four Sundara hospitals within 40 minutes.

A transit workers' strike means **24% of incoming night shift staff cannot reach their assigned hospitals**.

The system therefore has to handle:

1. Dengue outbreak
2. Mass casualty event
3. Staffing disruption
4. Very high ICU occupancy
5. Existing hospital system integration
6. Human clinical oversight

---

# Evaluation Criteria

The final evaluation rubric is:

| Criterion | Weight |
|---|---:|
| Innovation | **15%** |
| Business Fit | **20%** |
| UX | **10%** |
| Presentation & Story | **15%** |
| Working Demo | **40%** |
| **Total** | **100%** |

The **working demo is the most important component**, so the MVP should be designed around the live stress test.

---

# Proposed Product

## SUNDARA COMMAND

### AI Powered Emergency Response & Triage Orchestration

The product should not be presented as simply an AI triage dashboard.

The core positioning is:

> **Sundara Command continuously answers three questions: Who needs attention first? Who is likely to deteriorate next? And where should our limited resources go?**

The system operates at two levels:

### Hospital level

Used by doctors and nurses:

```text
Patients in ED
    ↓
Triage
    ↓
Deterioration prediction
    ↓
Local ICU / staff / equipment availability
    ↓
Clinician decision
```

### Network level

Used by administrators and network coordinators:

```text
Hospital A ─┐
Hospital B ─┤
Hospital C ─┼──→ Sundara Network Command
Hospital D ─┤
...         │
Hospital 40 ┘
```

The network layer can monitor:

- ICU beds
- ED capacity
- Available staff
- Incoming casualties
- Equipment
- Oxygen
- Ventilators
- Transit disruption
- Patient load

---

# Core Product Concept

The system follows:

> **Predict → Prioritize → Reallocate**

### Predict

Predict patient deterioration before the patient becomes critical.

### Prioritize

Prioritize patients using:

- Clinical acuity
- Deterioration risk
- Time sensitivity
- Data completeness
- Model confidence

### Reallocate

Recommend realistic allocation of:

- Staff
- ICU beds
- ED capacity
- Ventilators
- Oxygen
- Other equipment

while considering the actual staffing disruption.

---

# Working Demo Strategy

The live demo should be explicitly designed around the three judge interventions.

## T+0: Synthetic Patient Intake

Judges provide synthetic patient records containing:

- Dengue deterioration cases
- Burn cases
- Smoke inhalation cases
- Acute trauma cases

The system generates a prioritized patient queue.

Example:

```text
Patient P-1042

Priority: CRITICAL
Deterioration Risk: 87%
Confidence: 94%

Why?
- SpO₂ 89%
- HR 128
- Falling platelet count
- Increasing respiratory rate
- Persistent fever

Recommended:
Immediate clinician assessment
```

---

# T+8: Near Identical Acuity With Different Data Completeness

Two patients may have nearly identical acuity.

### Patient A

```text
Acuity: 8.5
Deterioration risk: 83%
Confidence: 96%
Data completeness: 94%
```

### Patient B

```text
Acuity: 8.5
Deterioration risk: 86%
Confidence: 58%
Data completeness: 41%
New / unknown patient
```

The system must not pretend that both predictions are equally reliable.

Instead:

```text
Patient B

Risk estimate: 86%
Confidence: 58%

⚠ HIGH UNCERTAINTY

Reasons:
- Incomplete history
- No previous baseline
- Missing platelet trend
- Limited historical information

Action:
Priority clinical reassessment
and additional data collection
```

Core design principle:

> **The system separates clinical risk from confidence in the prediction. Missing information does not become false certainty.**

---

# T+14: Fatigued Charge Nurse Override

The AI recommends:

```text
RECOMMENDED PRIORITY

Patient P-1042
CRITICAL

[Accept Recommendation]
[Override]
```

The nurse selects **Override**.

The system asks:

```text
Why are you overriding?

○ New clinical information
○ AI recommendation inconsistent with bedside assessment
○ Resource constraint
○ Patient deterioration observed
○ Other
```

Example:

```text
Override confirmed.

Previous AI priority: #1
New priority: #3

Clinician: Charge Nurse #27
Reason: Bedside assessment
Time: 20:14:32

Reassessment recommended in 10 minutes.
```

The AI does not fight the clinician.

It should respond:

> **Override accepted. Reassessment recommended in 10 minutes.**

The override is stored in the audit trail.

---

# Triage Report

The triage report is the most important clinical screen.

It should answer:

> **Who needs attention first, why, how confident are we, what should happen next, and what happens if the clinician disagrees?**

The report is a clinical decision support report, not a diagnosis report.

---

## 1. Patient Identification

Example:

```text
Patient ID: P-1042
Age: 46
Sex: Female
Hospital: Sundara Central
Arrival: 19:58
Arrival mode: Ambulance
```

Clinical context:

```text
Presenting complaint:
Shortness of breath + high fever

Known conditions:
Dengue positive
```

---

## 2. Current Clinical Status

Example:

```text
CURRENT VITALS

Heart Rate:       128 bpm
Blood Pressure:   94/62 mmHg
SpO₂:              89%
Respiratory Rate:  29/min
Temperature:       39.4°C
GCS:               14
```

The UI should use clear severity indicators.

---

# 3. Triage Priority

Example:

```text
CRITICAL PRIORITY

Deterioration Risk: 87%
Confidence: 94%
Time Sensitivity: HIGH

Recommended:
Immediate clinician assessment
```

Do not call the result simply an "AI score."

Use:

- Clinical Priority
- AI Deterioration Risk
- Confidence

These are different concepts.

---

# 4. Why Is This Patient Prioritized?

This is one of the most important sections.

Example:

```text
WHY PRIORITIZED?

1. SpO₂ declining from 94% → 89%
2. Heart rate increased to 128 bpm
3. Platelet count falling rapidly
4. Respiratory rate increasing
5. Persistent high fever
```

Show trends:

```text
SpO₂
94 → 92 → 90 → 89

Platelets
128K → 110K → 96K → 82K
```

The clinician sees the evidence behind the recommendation.

---

# 5. Proactive Deterioration Forecast

Example:

```text
EARLY DETERIORATION FORECAST

Current status:
HIGH RISK

Probability of deterioration:
87%

Prediction horizon:
Next 2 hours
```

Risk trajectory:

```text
Now → 1 hour → 2 hours

Moderate → High → Critical
```

This demonstrates the "AI With Initiative" concept.

The AI is not waiting until the patient becomes critical.

---

# 6. Confidence and Uncertainty

Every important recommendation should expose uncertainty.

Example:

```text
Deterioration Risk: 84%
Confidence: 61% ⚠ LOW
```

Reasons:

```text
- No previous medical history
- Missing platelet trend
- Unknown baseline SpO₂
- Recently registered patient
```

System response:

```text
Do not treat the risk score as high certainty.

Recommended:
Priority clinical reassessment
and additional data collection.
```

---

# 7. Recommended Action

The AI should recommend actions, not independently perform life critical interventions.

Example:

```text
RECOMMENDED ACTION

Immediate clinician assessment

Suggested preparation:
- Continuous SpO₂ monitoring
- Prepare oxygen support
- Repeat CBC
- Consider higher acuity observation
```

Use "Suggested" rather than "Execute."

Human approval remains mandatory.

---

# 8. Resource Aware Recommendation

A normal AI system may say:

```text
Transfer to ICU
```

Sundara Command should consider actual network capacity.

Example:

```text
RESOURCE CONTEXT

Network ICU occupancy: 93%
Available ICU beds: 2

Hospital A: 0
Hospital B: 1
Hospital C: 1

Night staff availability: 76%
Transit availability: 76%
```

Recommendation:

```text
RESOURCE AWARE RECOMMENDATION

Preferred:
ICU transfer

Current constraint:
No ICU bed available at this hospital

Alternative:
High acuity stabilization bay

Network option:
Hospital B has 1 available ICU bed

Transport feasibility:
Available
```

---

# 9. Clinician Decision

At the bottom:

```text
CLINICIAN DECISION

[ACCEPT RECOMMENDATION]
[OVERRIDE]
[REQUEST MORE INFORMATION]
```

---

# 10. Audit Trail

Every important interaction should be recorded.

Example:

```text
AUDIT TRAIL

20:11:03
AI generated priority #1

20:11:04
Risk: 87%
Confidence: 94%

20:14:12
Charge nurse opened recommendation

20:14:32
Recommendation overridden

Reason:
Bedside assessment differs from system data

20:14:33
Patient moved to priority #3

20:14:34
Reassessment timer started
```

This answers:

- What did AI recommend?
- What information did it have?
- What did the clinician do?
- Why was it overridden?

---

# Triage Report Example

```text
╔════════════════════════════════════════════════════╗
║ P-1042                         SUNDARA CENTRAL      ║
║ 46F | Dengue | Arrived 19:58                       ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║ 🔴 CRITICAL PRIORITY                               ║
║                                                    ║
║ Deterioration Risk       87%                       ║
║ Confidence               94%                       ║
║ Time Sensitivity         HIGH                      ║
║                                                    ║
╠════════════════════════════════════════════════════╣
║ CURRENT STATUS                                     ║
║                                                    ║
║ HR 128       SpO₂ 89%       RR 29                 ║
║ BP 94/62     Temp 39.4°C    Platelets 82K         ║
║                                                    ║
╠════════════════════════════════════════════════════╣
║ WHY PRIORITIZED                                    ║
║                                                    ║
║ • SpO₂ declining                                   ║
║ • Rising heart rate                                ║
║ • Falling platelet count                           ║
║ • Increasing respiratory rate                       ║
║ • Persistent fever                                 ║
║                                                    ║
╠════════════════════════════════════════════════════╣
║ PROACTIVE FORECAST                                 ║
║                                                    ║
║ 2-hour deterioration probability: 87%              ║
║ Current → High Risk → Critical                     ║
║                                                    ║
╠════════════════════════════════════════════════════╣
║ RESOURCE CONTEXT                                   ║
║                                                    ║
║ ICU occupancy: 93%                                 ║
║ Available beds: 2                                 ║
║ Staff availability: 76%                            ║
║                                                    ║
║ Recommended: ICU / stabilization bay               ║
║                                                    ║
╠════════════════════════════════════════════════════╣
║ RECOMMENDED ACTION                                 ║
║                                                    ║
║ Immediate clinician assessment                     ║
║                                                    ║
║ [ACCEPT] [OVERRIDE] [MORE INFORMATION]             ║
╚════════════════════════════════════════════════════╝
```

---

# Inputs

The input system should not be one giant form.

Use four layers:

1. Patient intake
2. Continuous clinical updates
3. Hospital resources
4. Network events and constraints

The AI automatically combines them.

---

# 1. Patient Intake

Basic information:

```text
Patient ID        P-1042
Age               46
Sex               Female
Hospital          Sundara Central
Arrival time      19:58
Arrival mode      Ambulance / Walk-in / Transfer
```

Chief complaint:

```text
Chief Complaint:
[Shortness of breath]

Symptoms:
☑ Fever
☑ Breathlessness
☑ Dizziness
☐ Chest pain
☐ Bleeding
☐ Loss of consciousness
```

Free text:

```text
Patient exposed to smoke for approximately 20 minutes.
```

Clinical NLP extracts structured information.

---

# 2. Initial Vitals

Fast entry:

```text
Heart Rate          128 bpm
Blood Pressure      94/62 mmHg
SpO₂                89%
Respiratory Rate    29/min
Temperature         39.4°C
GCS                 14
```

Measurement timestamps should be automatic.

Input validation should prevent impossible values.

---

# 3. Clinical History

```text
KNOWN CONDITIONS

☑ Dengue
☐ Diabetes
☐ Hypertension
☐ Asthma
☐ Cardiac disease
☐ Renal disease
☐ None known
☐ Unknown
```

Additional information:

```text
Previous hospitalization: Yes / No / Unknown
Current medications: Free text
Drug allergies: Free text / None known / Unknown
```

The **Unknown** option is important.

Unknown must not be treated as No.

---

# 4. Event Specific Inputs

## Dengue pathway

```text
Dengue status:
Confirmed / Suspected / Unknown

Day of illness:
4

Platelet count:
82,000

Previous platelet count:
96,000

Bleeding:
None / Mild / Significant

Warning signs:
☑ Persistent vomiting
☑ Abdominal pain
☐ Bleeding
☐ Altered consciousness
```

## Burn / Smoke pathway

```text
Burn present:
Yes

Estimated burn area:
32%

Burn location:
☑ Face
☑ Chest
☐ Limbs

Smoke inhalation:
Yes

Exposure duration:
20 minutes

Airway concern:
Low / Medium / High

Trauma:
Yes / No
```

Different patients can receive different relevant input fields.

---

# 5. Laboratory Inputs

In production these should come from the existing hospital systems.

For the MVP, simulate the EHR feed.

Example:

```text
Hemoglobin       11.2 g/dL
WBC              13,400 /µL
Platelets        82,000 /µL
Lactate          3.1 mmol/L
Creatinine       1.4 mg/dL
Glucose          118 mg/dL
```

Show source and update time:

```text
Last updated: 20:04
Source: Laboratory System
```

---

# 6. Continuous Time Series

The system continuously receives:

```text
            19:55   20:00   20:05   20:10

HR            98      107     119     128
SpO₂          96       95      92      89
RR             21      23      26      29
Temp         38.8    39.0    39.2    39.4
Platelets     128K    110K     96K     82K
```

This goes into the time series model.

The important concept is:

> The model receives the trajectory, not just the latest value.

---

# 7. Clinical Notes

Simple notes box:

```text
Patient increasingly short of breath.
Family reports confusion for the last 30 min.
Smoke exposure approximately 20 min.
```

NLP extracts:

```text
Smoke exposure = Yes
Breathlessness = Yes
Confusion = Yes
Exposure duration = 20 min
```

These become structured model features.

---

# 8. Data Completeness

Calculated automatically:

```text
DATA COMPLETENESS

Overall: 91%

Vitals             100%
Labs                82%
History             70%
Previous records    100%
```

For a new patient:

```text
DATA COMPLETENESS

Overall: 43%

⚠ Limited history
⚠ No previous baseline
⚠ Missing platelet trend
```

This feeds the uncertainty engine.

---

# 9. Hospital Resource Inputs

These are primarily provided by hospital systems/admin users.

Example:

```text
HOSPITAL RESOURCE STATUS

ICU beds
Total: 40
Occupied: 38
Available: 2

ED beds
Total: 80
Occupied: 71
Available: 9

Ventilators
Total: 25
Available: 6

Oxygen supply
Status: Normal

Doctors
Scheduled: 22
Available: 19

Nurses
Scheduled: 48
Available: 37
```

Always distinguish:

**Scheduled staff**

from

**Actually available staff**

---

# 10. Transit Strike Input

Network event:

```text
NETWORK EVENT

Transit disruption

Affected night shift staff:
24%

Effective staff availability:
76%

Start:
19:00

Expected duration:
Until 06:00
```

At hospital level:

```text
Hospital A

Scheduled night staff: 100
Expected unavailable: 24
Effective staff: 76
```

---

# 11. Network Incident Input

```text
ACTIVE INCIDENTS

Dengue outbreak
Severity: High
Expected additional arrivals: +35%

Industrial fire
Casualties: 84
Arrival window: 40 min
Affected hospitals: 4

Transit strike
Staff availability: 76%
```

This feeds resource demand forecasting.

---

# 12. Hospital to Hospital Data

Each hospital reports:

```text
Hospital A
ICU: 0 available
ED: 9 available
Staff: 76%
Burn beds: 3

Hospital B
ICU: 1 available
ED: 14 available
Staff: 89%
Burn beds: 7

Hospital C
ICU: 1 available
ED: 4 available
Staff: 71%
Burn beds: 2
```

The AI can then make network recommendations.

Example:

> Hospital A is approaching critical staffing and ICU capacity. Route appropriate incoming high acuity patients to Hospital B.

---

# Complete Input Architecture

```text
USER / SYSTEM INPUTS
        │
 ┌──────┼─────────┐
 │      │         │
 ▼      ▼         ▼
Patient Time     Context
Data    Series
 │       │          ├── Dengue outbreak
 │       │          ├── Industrial fire
 │       │          └── Transit strike
 │       │
 ├── Demographics
 ├── Symptoms
 ├── Medical history
 ├── Vitals
 ├── Labs
 ├── Clinical notes
 └── Event specific information

             +

      HOSPITAL RESOURCE DATA
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
   ICU      Staff   Equipment
   beds     nurses  oxygen
   ED beds  doctors ventilators

             +

         NETWORK DATA
              │
     ┌────────┼────────┐
     ▼        ▼        ▼
 Hospital A Hospital B Hospital C...
```

---

# Multimodal Architecture

Do not build one giant multimodal model.

Use specialist models for each modality followed by a fusion and safety layer.

```text
                       EXISTING HOSPITAL
                           SYSTEMS
                              │
                              ▼
                     DATA NORMALIZATION
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
       EHR / LABS        VITAL TIME SERIES    CLINICAL NOTES
          │                   │                   │
          ▼                   ▼                   ▼
     TABULAR ML           TEMPORAL MODEL       NLP MODEL
     XGBoost /            GRU / TFT            ClinicalBERT
     LightGBM
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ▼
                     MULTIMODAL FUSION
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
       TRIAGE MODEL     DETERIORATION     RESOURCE
                        MODEL             FORECAST
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                    UNCERTAINTY ENGINE
                              │
                              ▼
                    CLINICAL DECISION ENGINE
                              │
                              ▼
                     SUNDARA DASHBOARD
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
                 ACCEPT              OVERRIDE
                    │                   │
                    └─────────┬─────────┘
                              ▼
                         AUDIT TRAIL
```

---

# Modalities

## A. Structured / Tabular

Examples:

- Age
- Sex
- Blood pressure
- HR
- SpO₂
- Respiratory rate
- Temperature
- Platelets
- WBC
- Hemoglobin
- Comorbidities
- Previous admissions
- Arrival mode
- Time since symptom onset

This will probably be the most important modality.

## B. Time Series

Examples:

```text
HR:
98 → 105 → 117 → 128

SpO₂:
96 → 94 → 92 → 89

Platelets:
128K → 110K → 96K → 82K
```

## C. Clinical Text

Examples:

```text
Patient reports worsening breathlessness.

Known dengue positive for 4 days.

Family reports increased confusion.

Smoke inhalation exposure approximately 30 min.
```

## D. Images

Potentially:

- Chest X ray
- Burn images
- Ultrasound
- Radiology images

However, imaging should be optional in the MVP unless a trustworthy dataset is available.

Do not add medical image analysis merely to claim multimodality.

---

# Recommended ML Models

| Task | Recommended Model | Purpose |
|---|---|---|
| Structured clinical risk | **XGBoost** | Main tabular risk model |
| Alternative structured model | **LightGBM** | Fast tabular modeling |
| Deterioration from vitals | **GRU** | Time series trends |
| Advanced time series | **Temporal Fusion Transformer** | Future research/upgrade |
| Clinical text | **BioClinicalBERT** | Clinical text understanding |
| Text embeddings | **PubMedBERT / BioBERT** | Medical representations |
| Multimodal fusion | **MLP / attention fusion** | Combine modalities |
| Uncertainty | **Deep Ensemble** | Prediction uncertainty |
| Calibration | **Temperature Scaling / Isotonic Regression** | Reliable probabilities |
| OOD detection | **Mahalanobis / Isolation Forest** | Detect unfamiliar patients |
| Resource forecasting | **LightGBM / XGBoost** | ICU/staff/equipment demand |
| Resource allocation | **Constraint optimization / MILP** | Feasible network allocation |
| Explainability | **SHAP** | Feature level explanation |

---

# Recommended Model Stack

## 1. XGBoost

Use for structured clinical risk.

Example:

```text
Age
HR
BP
SpO₂
RR
Temperature
Platelets
WBC
Dengue status
Burn severity
Smoke exposure
Comorbidities
Time since arrival
```

Output:

```text
Deterioration Risk = 87%
```

Use SHAP to explain:

```text
SpO₂ 89%             +0.22
HR 128                +0.18
Falling platelets     +0.15
RR 29                 +0.11
Persistent fever      +0.08
```

---

# 2. GRU

Use for proactive deterioration.

Example:

```text
HR:
98 → 104 → 111 → 119 → 128

SpO₂:
97 → 96 → 94 → 92 → 89
```

The model learns the trajectory rather than just the current value.

For the MVP, GRU is preferable to starting with a complicated Transformer because it is easier to train, deploy, debug and demonstrate.

---

# 3. BioClinicalBERT

Use for clinical notes.

Input:

```text
Patient exposed to warehouse smoke for approximately 20 minutes.
Increasing breathlessness and dizziness.
```

Extract:

```text
Smoke exposure = YES
Exposure duration = 20 min
Breathlessness = YES
Dizziness = YES
```

These structured features enter the risk model.

---

# 4. Multimodal Fusion

Combine:

```text
Tabular embedding
+
Temporal embedding
+
Text embedding
        ↓
      Fusion
        ↓
    MLP / Attention
        ↓
Final patient representation
```

Output:

```text
Final deterioration probability = 87%
```

---

# 5. Uncertainty Engine

The system should show:

```text
Risk = 87%
Confidence = 94%
```

versus:

```text
Risk = 84%
Confidence = 58%
```

A practical MVP approach is a **deep ensemble**.

Example:

```text
Model 1 = 82%
Model 2 = 91%
Model 3 = 86%
Model 4 = 80%
Model 5 = 87%
```

Mean:

```text
85.2%
```

The disagreement provides an uncertainty signal.

---

# 6. Calibration

Use:

- Temperature scaling
- Isotonic regression

Pipeline:

```text
Raw model probability
        ↓
Calibration
        ↓
Clinically interpretable probability
```

---

# 7. Missing Data

Never blindly replace missing values with zero.

Use:

```text
Value
+
Missingness indicator
```

Example:

```text
Platelets = NULL
Platelet_missing = 1
```

This allows the model to distinguish:

> No platelet result exists

from:

> Platelet count is actually zero.

---

# 8. Out of Distribution Detection

A model can encounter patients unlike its training population.

Example:

```text
Training:
Mostly adult dengue patients

New:
Severe pediatric burn + smoke inhalation
```

Instead of false confidence:

```text
Risk = 93%
Confidence = 97%
```

show:

```text
⚠ UNFAMILIAR PATIENT PROFILE

Model confidence reduced.

Reason:
Patient characteristics differ significantly
from training population.

Recommended:
Clinical review required.
```

For the MVP, Isolation Forest or Mahalanobis distance can demonstrate this capability.

---

# 9. Resource Forecasting

Predict:

### ICU demand

```text
Current ICU: 93%
Projected in 2 hours: 97%
```

### Staff requirement

```text
Required nurses: 18
Available: 14
Projected gap: 4
```

### Equipment

```text
Oxygen concentrators:
Available: 12
Projected requirement: 17
Gap: 5
```

Use LightGBM/XGBoost with:

- Current patient arrivals
- Dengue cases
- Burn cases
- Historical demand
- ICU occupancy
- Staff availability
- Transit disruption
- Hospital capacity

---

# 10. Transit Strike in the Model

The strike should be an actual constraint, not merely a dashboard label.

Example:

```text
Hospital A

Scheduled night staff: 100
Unavailable: 24
Effective staff: 76
```

Resource optimization then uses:

```text
Available Staff ≠ Scheduled Staff
```

Potential recommendation:

```text
Hospital A:
Critical nursing shortage

Hospital B:
Underutilized ICU capacity
+ 8 available nurses

Recommendation:
Redirect eligible incoming patients to Hospital B
```

---

# 11. LLM Usage

Do not use an LLM as the final clinical triage scorer.

Avoid:

```text
LLM → "This patient seems critical."
```

Instead use deterministic/ML models for risk and ranking.

An LLM can optionally verbalize already approved structured evidence:

```text
SpO₂ ↓
HR ↑
Platelets ↓
Risk = 87%
```

into:

> The patient is prioritized because oxygen saturation is declining, heart rate is elevated, and platelet count is falling.

The LLM should not invent clinical reasoning.

---

# Final Recommended Architecture

```text
              PATIENT DATA
                   │
        ┌──────────┴──────────┐
        │                     │
     EHR DATA             LIVE VITALS
        │                     │
        └──────────┬──────────┘
                   ↓
            DATA QUALITY
              ANALYSIS
                   │
                   ↓
        ┌─────────────────────┐
        │   AI RISK MODELS    │
        │                     │
        │ XGBoost             │
        │ GRU                 │
        │ BioClinicalBERT     │
        └──────────┬──────────┘
                   ↓
             Fusion Network
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
 Deterioration Risk      Patient Priority
        │                     │
        └──────────┬──────────┘
                   ▼
             Uncertainty
               Engine
                   │
                   ▼
             Resource Forecast
                   │
                   ▼
             Constraint Engine
                   │
                   ▼
             Clinical Ranking
                   │
                   ▼
              Triage Report
                   │
              ┌────┴────┐
              ▼         ▼
            Accept    Override
              │         │
              └────┬────┘
                   ▼
               Audit Log
```

---

# What Should Actually Be Implemented for the Competition

Do not implement every model equally.

## Tier 1: Must work

- XGBoost + SHAP
- GRU
- Uncertainty estimation
- Resource forecasting
- Constraint engine
- Dashboard
- Override
- Audit trail

## Tier 2: Add if time permits

- BioClinicalBERT

## Tier 3: Do not make this a dependency

- Medical image model

A strong live system can use **tabular + time series + text**, which is already genuinely multimodal.

The most important chain to demonstrate is:

> **Patient data → AI prediction → uncertainty → explanation → resource aware recommendation → clinician decision → audit trail**

---

# Final Input UX

The nurse should not see 50 fields.

### Step 1: Register patient

```text
Patient ID
Age
Chief complaint
Symptoms
Initial vitals
Relevant event
```

### Step 2: Submit

The system automatically pulls:

```text
Labs
Medical history
Prior records
Live vitals
Clinical notes
```

### Step 3: AI analyzes

```text
Risk
Deterioration probability
Confidence
Missing information
```

### Step 4: Nurse sees

```text
🔴 CRITICAL

Risk: 87%
Confidence: 94%

WHY?
• SpO₂ 89%
• HR 128
• Platelets falling
• Respiratory rate increasing

NEXT ACTION
Immediate clinician assessment

RESOURCE STATUS
ICU capacity critical
```

The guiding architecture is:

> **Patient State + Hospital State + Network State + External Crisis Context → AI Decision Support**

This makes Sundara Command a network aware emergency response system rather than a generic patient classifier.
