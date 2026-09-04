# Sundara Command Governance Service

This service owns the accountability boundary for clinical recommendations. It records AI recommendations, clinician accept/override decisions, reassessment deadlines, and an append-only hash-chained audit trail.

It does not calculate patient risk, alter protocol-band ranking, or decide resource allocation.

## Run locally

From `backend/`:

```powershell
uv run uvicorn governance_service.main:app --reload --port 8003
```

The service uses `governance_service/governance.db` by default. Set `GOVERNANCE_DB_PATH` to use a different SQLite path.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/recommendations` | Store an AI recommendation for an assessment |
| `POST` | `/decisions/accept` | Store an explicit clinician acceptance |
| `POST` | `/decisions/override` | Store a documented override and reassessment time |
| `GET` | `/decisions/{patient_id}` | Read a patient's human decisions |
| `GET` | `/audit` | Read the audit chain; optional `patient_id` filter |
| `GET` | `/audit/verify` | Validate the complete hash chain |
| `GET` | `/reassessments/due` | List overrides whose reassessment time has passed |

Every payload requires `assessment_id`, `patient_id`, and `model_version`. These identifiers keep triage recommendations and human decisions traceable across services.
