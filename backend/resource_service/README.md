# Sundara Command Resource Service

This service owns the operational context around a clinical assessment: hospital ICU/ED capacity, staff availability, network incidents, transfer feasibility, and resource-aware recommendations. It does not calculate clinical risk or alter the triage queue.

## Run locally

From `backend/`:

```powershell
uv run uvicorn resource_service.main:app --reload --port 8002
```

The default synthetic state is stored in `resource_service/resource.db`. Set `RESOURCE_DB_PATH` to use a different SQLite path.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/resources` | Full network capacity and incident state |
| `GET` | `/resources/hospitals/{hospital_id}` | Capacity for one hospital |
| `PUT` | `/resources/hospitals/{hospital_id}` | Update a hospital's synthetic capacity/staffing state |
| `GET`, `POST` | `/incidents` | Read or add network incidents |
| `POST` | `/network/plan` | Check an ICU transfer plan's feasibility |
| `POST` | `/recommendations/resource` | Generate a resource recommendation for a triage assessment |

`/recommendations/resource` requires the triage assessment identifiers (`assessment_id`, `patient_id`, `model_version`, and `correlation_id`) so its response remains traceable when recorded by governance-service.
