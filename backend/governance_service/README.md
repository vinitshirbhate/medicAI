# Governance Service

This service is Sundara Command's accountability boundary. It records AI recommendations and human accept/override decisions in an append-only SHA-256 hash chain.

It does not calculate risk, change a queue rank, or choose resources. A clinician override is preserved as a human decision with its reason and reassessment deadline; it never silently rewrites the algorithmic triage policy.

## Service boundary

```text
Triage assessment + resource context
              │
              ▼
POST /recommendations
              │
              ▼
Clinician accepts or overrides
              │
              ▼
Append-only audit entry → verification and review
```

Every message contains `assessment_id`, `patient_id`, `model_version`, and `correlation_id`. Keep these values unchanged across triage, resource, frontend, and governance calls.

## Run

From `backend/`:

```powershell
uv run uvicorn governance_service.main:app --reload --port 8003
```

The default local database is `governance_service/governance.db`; it is ignored by Git. Open `http://localhost:8003/docs` to use the interactive API.

## API contract

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/recommendations` | Append an AI recommendation before human action |
| `POST` | `/decisions/accept` | Append a clinician acceptance |
| `POST` | `/decisions/override` | Append a documented override and calculate reassessment due time |
| `GET` | `/decisions/{patient_id}` | Read human decisions for one patient |
| `GET` | `/audit` | Read the full chain or filter by `patient_id` |
| `GET` | `/audit/verify` | Recompute and validate the hash chain |
| `GET` | `/reassessments/due` | Return overrides past their reassessment deadline |
| `GET` | `/health` | Service readiness |

### Override request

```json
{
  "assessment_id": "assessment-p1042-001",
  "patient_id": "P-1042",
  "model_version": "sundara-triage-demo-0.1.0",
  "correlation_id": "demo-p1042-001",
  "actor": "Charge Nurse 27",
  "reason_code": "BEDSIDE_ASSESSMENT_DIFFERS",
  "reason_text": "Bedside reassessment differs from the available system data.",
  "new_rank": 3,
  "reassessment_minutes": 10
}
```

`reason_code` is required. The service returns the precise reassessment due time and writes the same information into the audit chain.

## Integration notes

1. Triage-service finishes an assessment and obtains resource context.
2. It records that recommendation through `POST /recommendations`.
3. The frontend sends an acceptance or override with the original assessment identifiers.
4. On successful response, refresh queue/audit views. Do not show a decision as saved before this response arrives.
5. Use `/audit/verify` in the demo to show that stored history has not changed.

## Files

| File | Responsibility |
|---|---|
| `main.py` | Decision and audit HTTP API |
| `audit.py` | Canonical JSON, hash chaining, persistence, and verification |
