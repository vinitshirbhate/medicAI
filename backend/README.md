# Sundara Command backend

Synthetic-only FastAPI backend for the Sundara Command demo. It is a read-only clinical-system sidecar: it stores demo inputs and clinician decisions, but has no endpoint that writes back to a hospital system.

```powershell
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000/docs`. Demo state is seeded automatically and restored with `POST /api/v1/demo/reset`.

Risk and prediction reliability are separate. Protocol band dominates ranking; low reliability triggers reassessment but never changes rank. Every AI assessment and clinician decision is append-only and hash-chained.
