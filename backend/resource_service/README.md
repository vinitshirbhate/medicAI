# Resource Service

This service owns the operational context around emergency triage: hospital capacity, staffing availability, incidents, transport constraints, and feasible resource recommendations.

It does not calculate deterioration risk, alter protocol-band queue ranking, or create audit decisions. It answers a narrower question: **given an assessment, what operational option is feasible now?**

## Service boundary

```text
Triage assessment (risk and urgency)
              │
              ▼
Resource Service (capacity and constraints)
              │
              ▼
Resource recommendation → frontend and governance-service
```

The caller supplies `assessment_id`, `patient_id`, `model_version`, and `correlation_id`. The response carries the same identifiers, which lets governance-service record one traceable combined recommendation.

## Demo state and run

On first startup the service seeds the Sundara scenario: 93% network ICU occupancy, a dengue outbreak, mass-casualty pressure, transit disruption, no ICU bed at Sundara Central, and one at Sundara North. Its local SQLite state is `resource_service/resource.db` and is ignored by Git.

From `backend/`:

```powershell
uv run uvicorn resource_service.main:app --reload --port 8002
```

Open `http://localhost:8002/docs` for interactive testing.

## API contract

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/resources` | Complete network capacity, incidents, and known infeasibilities |
| `GET` | `/resources/hospitals/{hospital_id}` | Capacity and staffing at one hospital |
| `PUT` | `/resources/hospitals/{hospital_id}` | Replace synthetic capacity/staffing state for one hospital |
| `GET`, `POST` | `/incidents` | Read or add operational incidents |
| `POST` | `/network/plan` | Check whether a proposed ICU transfer is feasible |
| `POST` | `/recommendations/resource` | Turn one triage assessment into an operational recommendation |
| `GET` | `/health` | Service readiness |

### Recommendation request

```json
{
  "assessment_id": "assessment-p1042-001",
  "patient_id": "P-1042",
  "model_version": "sundara-triage-demo-0.1.0",
  "correlation_id": "demo-p1042-001",
  "hospital_id": "SUNDARA_CENTRAL",
  "deterioration_risk": 0.8,
  "time_sensitivity": "HIGH"
}
```

For risk below `0.65`, the service recommends ED observation. For higher risk, it checks the local ICU then finds another hospital with capacity. When Central has no ICU bed, the seeded response offers a high-acuity stabilisation bay and a feasible Sundara North option.

## Integration notes

1. Triage-service creates an assessment.
2. It calls `POST /recommendations/resource` with the assessment identifiers and urgency fields.
3. The frontend displays the clinical action and returned capacity context together.
4. Triage-service or a gateway sends the combined recommendation to governance-service.

If this service is unavailable, triage-service should still return its clinical assessment and explicitly mark the resource context unavailable. Capacity lookup failure must not hide a clinical priority.

## Files

| File | Responsibility |
|---|---|
| `main.py` | Resource HTTP API |
| `store.py` | Seeded state and SQLite persistence |
| `routing.py` | Transfer feasibility and recommendation rules |
