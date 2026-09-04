# Sundara Command — Frontend Workflow Guide

This document defines the frontend for **Sundara Command**, a clinical decision-support demo for emergency departments operating under pressure. It is written for the person building or presenting the interface: it explains what each page is responsible for, how users move between pages, and which backend response drives each view.

The product does not diagnose patients or perform clinical actions. It helps a clinician decide what to review first by bringing together patient condition, prediction reliability, and the resource situation across the network. Every recommendation remains subject to human approval.

## What the interface needs to prove

The demo should make one practical sequence easy to follow:

```text
Patient intake → assessment generated → triage queue updated
              → clinician reviews the evidence and capacity context
              → clinician accepts or overrides → audit record available
```

There are two important ideas to keep visible throughout the UI:

- Risk and reliability are separate. A high-risk estimate with incomplete information must be shown as uncertain, not presented as a fact.
- A recommendation is advisory. The clinician can accept it or override it, and the decision is recorded.

## Primary users

| User | Main job in the interface | Starting page |
|---|---|---|
| Triage nurse / charge nurse | Register a patient, inspect the prioritised queue, and make a documented decision | Triage queue |
| ED clinician | Review the patient evidence, trends, recommended preparation, and resource constraints | Patient assessment |
| Network coordinator | Check capacity, active incidents, and feasible alternatives at nearby hospitals | Network status |

For a short live demonstration, the charge-nurse journey is the main path. The network page should be reachable from it without interrupting the patient decision.

## Suggested route map

| Route | Page | Purpose | Main navigation |
|---|---|---|---|
| `/` | Triage queue | Default operational view; shows the current ranked queue | Open a patient, add patient, open network status |
| `/patients/new` | Patient intake | Fast, structured registration for a new arrival | Submit to assessment; cancel back to queue |
| `/patients/:patientId` | Patient assessment | Explain the prioritisation and collect a clinician decision | Back to queue; network status; audit trail |
| `/patients/:patientId/override` | Override dialog or route | Capture the reason for a different clinician decision | Confirm back to assessment, then queue |
| `/network` | Network status | Show capacity, incidents, transport limitations, and alternatives | Return to the previous patient or queue |
| `/audit` | Audit trail | Show decision history and audit-chain status | Filter/open related patient assessment |

Use the queue as the stable home screen. Opening a patient should preserve queue filters and scroll position so that a clinician can return to the same operating context after reviewing a case.

## Navigation model

```text
                         ┌───────────────┐
                         │ Triage queue  │
                         └───────┬───────┘
                 Add patient     │     Select patient
                       │          │          │
                       v          │          v
               ┌─────────────┐    │   ┌──────────────────┐
               │ Patient     │────┘   │ Patient assessment│
               │ intake      │        └───┬───────┬──────┘
               └──────┬──────┘            │       │
                      │                   │       │
                      └───────────────────┘       │
                     assessment appears            │
                                              Accept │ Override
                                                     v
                                               ┌──────────┐
                                               │ Decision │
                                               │ recorded │
                                               └────┬─────┘
                                                    v
                                              ┌──────────┐
                                              │ Audit log│
                                              └──────────┘

      Network status is available from the queue and assessment pages.
```

The network page should open in the current tab for a coordinator, but from a patient assessment it is better as a side panel or a back-navigation-safe page. The clinician should never lose the patient they were reviewing merely by checking a bed or transfer option.

## Page requirements

### 1. Triage queue (`/`)

This is the operational landing page. It should make the next patient to review obvious without reducing the decision to a single opaque score.

Each queue row or card should show:

- rank and protocol band;
- patient ID, age/sex when known, hospital, pathway, and arrival/waiting time;
- clinical priority/risk and time sensitivity;
- prediction reliability and a clear low-reliability warning when applicable;
- one short explanation such as “Oxygen saturation low; heart rate elevated; platelet count falling”; and
- a direct `Review assessment` action.

The queue is ordered by protocol band, then deterioration risk, time sensitivity, and waiting-time equity. Reliability must not alter rank; it changes how cautiously the recommendation is presented and can trigger reassessment guidance.

Use visual hierarchy carefully: reserve the strongest red treatment for critical urgency, and use an amber warning for uncertainty. Do not make green/red colour the only signal; include labels and icons so the page remains readable under stress and accessible to colour-blind users.

The page should refresh when the queue WebSocket reports an update. If the connection is unavailable, keep the most recent list on screen, show a small “live updates paused” state, and allow manual refresh.

### 2. Patient intake (`/patients/new`)

Intake must be quick enough for a busy ED. Avoid a single long form. Use progressive sections and only show pathway-specific fields after the pathway is selected.

**Required first-screen fields**

- patient ID, age, sex, hospital, arrival mode, and arrival time;
- chief complaint and symptoms;
- pathway: dengue, burn/smoke, trauma, or general;
- protocol band; and
- initial vital signs.

**Conditional details**

- Dengue: status, platelet trend, bleeding/warning signs, and relevant laboratory inputs.
- Burn/smoke: burn area, smoke exposure, airway concern, and trauma details.
- Any pathway: free-text clinical note and whether the patient is new to the system.

Values that are not available should be marked as **Unknown** or **Not yet measured**, never silently treated as normal. Validate vital ranges before submission and place an error beside the field, not only in a generic banner.

On successful submission, send the user directly to `/patients/:patientId`. The assessment page can show a brief “assessment updated” state while the response is rendered. The new patient should then be visible in the queue through the real-time update.

### 3. Patient assessment (`/patients/:patientId`)

This is the clinical explanation page and the centre of the demo. Put the decision summary at the top, the supporting evidence in the middle, and clinician controls at the bottom or in a persistent action area.

Recommended page order:

1. **Patient context** — identifier, demographic details, arrival information, hospital, pathway, complaint.
2. **Triage recommendation** — protocol band, deterioration risk, prediction reliability, time sensitivity, and recommended next action.
3. **Why this patient is prioritised** — contribution list from the assessment response. Phrase these as clinical observations, not model internals.
4. **Current observations and trend** — latest vitals plus a compact trend view when historical values are available.
5. **Forecast and uncertainty** — two-hour horizon, expected trajectory, completeness, missing-data reasons, out-of-distribution flag where relevant, and ensemble spread only as a secondary technical detail.
6. **Resource-aware recommendation** — preferred destination, current constraint, alternative stabilisation option, network option, and transport feasibility.
7. **Clinician decision** — `Accept recommendation`, `Override`, and optionally `Request more information` as a local note/action until a backend endpoint exists.
8. **Audit activity** — latest related events with a link to the full audit view.

Use the backend language exactly where it matters: display **Deterioration risk** for `deterioration_risk` and **Prediction reliability** for `prediction_reliability`. Avoid calling either value an “AI score.”

When `uncertainty.is_low_confidence` is true, place an explicit warning next to the reliability value and present the supplied reasons. The recommended action will normally shift to priority clinical reassessment. This is the key contrast between the two seeded demo patients.

### 4. Override capture (`/patients/:patientId/override`)

An override should be a focused modal or a short route, never a destructive confirmation with no context. Keep the original recommendation visible while the clinician records their decision.

Capture:

- clinician/actor name;
- reason: new clinical information, bedside assessment differs, resource constraint, deterioration observed, or other;
- optional supporting note; and
- optional new rank.

`reason_code` is mandatory for an override. After confirmation, show the server response: “Override accepted. Reassessment recommended in 10 minutes,” including the reassessment due time. Return to the assessment page first, then let the clinician go back to the queue. This makes the recorded human decision visible before the wider worklist resumes.

### 5. Network status (`/network`)

This page supports resource-aware decisions; it is not a generic analytics dashboard. Present the current network ICU occupancy, active outbreak/mass-casualty/transit events, and a compact hospital capacity comparison.

For each hospital, show available and occupied ICU/ED capacity plus doctor and nurse availability. Keep infeasible requests visible as constraints with their alternative, for example routing an eligible high-acuity arrival to Sundara North when staff cannot be reassigned during the strike.

From a patient assessment, provide a `Back to patient` control and retain the selected patient ID in navigation state.

### 6. Audit trail (`/audit`)

The audit view demonstrates accountability. Show timestamp, event type, initiator (AI or human), actor, patient ID, model version, and the decision payload. A patient filter makes it useful during the live walkthrough.

Include an `Audit chain verified` status driven by the verification endpoint. The UI should report a failed verification plainly and should not imply that an unverified chain is trustworthy.

## Backend integration contract

The backend is a synthetic-demo-only FastAPI service, normally available at `http://localhost:8000`. Configure this as an environment value such as `VITE_API_BASE_URL`; do not hard-code it throughout components.

| Frontend need | Endpoint | Use in the interface |
|---|---|---|
| Service status | `GET /health` | Optional startup/readiness indicator |
| Queue | `GET /api/v1/queue` | Initial queue load and manual refresh |
| Live queue | `WS /ws/queue` | Replace/update queue after assessments and decisions |
| Create patient | `POST /api/v1/patients` | Intake submission; response is the initial assessment |
| Add observations | `POST /api/v1/patients/{patientId}/vitals` | Future/manual vital update control |
| Assessment | `GET /api/v1/patients/{patientId}/assessment` | Assessment-page data and re-fetch |
| Accept | `POST /api/v1/patients/{patientId}/accept` | Record clinician acceptance |
| Override | `POST /api/v1/patients/{patientId}/override` | Record the override and reassessment time |
| Resource state | `GET /api/v1/resources` | Network-status page and patient resource panel |
| Audit entries | `GET /api/v1/audit` | Audit trail |
| Verify audit | `GET /api/v1/audit/verify` | Audit-chain status |
| Reset demo | `POST /api/v1/demo/reset` | Presenter-only reset control, behind a confirmation |

The API currently does not expose full patient demographics or historical vitals as separate reads. The assessment screen should therefore be built from the queue item plus its assessment response, and trend rendering should gracefully show “latest observation only” where history is unavailable. Do not invent clinical data in the UI.

## Demonstration walkthrough

Start with the backend’s seeded state. It intentionally includes two similar dengue cases:

- `P-1042` has low oxygen saturation, elevated heart and respiratory rates, and a falling platelet trend. Its assessment should convey high risk with stronger reliability.
- `P-1043` has a similar acute presentation but is a new patient with missing oxygen baseline and platelet trend. Its risk should be presented with a prominent uncertainty/reassessment message.

Walk the audience through the following sequence:

1. Open the queue and explain that protocol band drives the first level of ordering. Point out that the queue shows both urgency and reliability.
2. Open `P-1042`. Review the clinical evidence, two-hour forecast, and the resource panel showing that the local ICU has no bed while Sundara North has one.
3. Open `P-1043` and contrast the warning state. Explain that missing records lower confidence but do not produce a false “safe” result or secretly change the rank.
4. Return to `P-1042`, choose `Override`, select “Bedside assessment differs,” and submit. Show the reassessment timing returned by the server.
5. Open the audit trail, filter for `P-1042`, and show both the original AI assessment and the human override. Verify the audit chain.
6. If needed, use the presenter-only reset control to restore the seeded cases before another run.

This tells a complete story without claiming autonomous care: the system surfaces an actionable recommendation, explains its limits, accounts for capacity, and records the clinician’s final call.

## Implementation notes

- Keep clinical copy direct and calm. “Suggested preparation” and “Immediate clinician assessment” are preferable to commands that imply automatic treatment.
- Show times with a timezone and use relative time only as a helpful secondary label.
- Treat API errors as operational states: retain form input after a failed intake request; show a retry state for queue/network calls; never report a decision as saved until the server confirms it.
- Keep the reset action out of normal clinical navigation. It is for demonstrations only and should request confirmation.
- The backend permits browser origins on ports `3000` for local development. Adjust its CORS configuration if the frontend runs elsewhere.

## Local backend for frontend development

```powershell
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000/docs` to inspect request schemas and exercise the synthetic-demo API while building the frontend.

## Scope and safety

Sundara Command is a demonstration of clinical decision support using synthetic data. It is not a medical device, not a diagnosis tool, and not connected to a live hospital system. The frontend must preserve that boundary in labels, interactions, and presentation language.
