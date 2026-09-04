# Time-Series Service

This service is the clinical-observation store for Sundara Command. It writes immutable vital and laboratory readings to TimescaleDB, then returns factual trend features to the triage service.

It does **not** assign clinical priority, rank patients, allocate beds, or record clinician decisions. Those boundaries prevent two services from making competing triage decisions.

## Ownership and integration

```text
Monitor / EHR / triage intake
          │
          ▼
Time-Series Service ──► timestamped observations and trend features
          │
          ▼
Triage Service ──────► risk, reliability, forecast, queue
```

The triage service calls this service after initial intake and every new vital/lab event. It uses the feature response as input to its assessment engine; a slope or delta is evidence, not a diagnosis.

## Storage rules

- Observations are append-only. A correction is a new observation, never an update to a prior clinical record.
- `observed_at` is the clinical measurement time; `received_at` is assigned by the database.
- Send `source_event_id` whenever the upstream source supplies one. Repeated delivery of the same ID returns `duplicate` rather than inserting a second row.
- Vital observations are stored in `vital_observations`; laboratory measurements are stored in `lab_observations`.
- Both tables are TimescaleDB hypertables, indexed by patient and descending observation time.

## Configuration

Copy `.env.example` to `.env`, then set a real TimescaleDB connection URL:

```dotenv
TIMESCALE_DATABASE_URL=postgresql://username:password@host:5432/sundara_timeseries?sslmode=require
```

The folder-local `.env` is loaded automatically for local development and is ignored by Git. A deployment environment variable takes precedence. An ordinary PostgreSQL server is not sufficient: the target database must have the `timescaledb` extension enabled.

## Run

From `backend/`:

```powershell
uv sync
uv run uvicorn time_series_service.main:app --reload --port 8001
```

Open `http://localhost:8001/docs` for interactive API documentation.

## API contract

| Method | Endpoint | Consumer | Result |
|---|---|---|---|
| `POST` | `/observations/vitals` | Triage/EHR adapter | Stores one timestamped vital observation |
| `POST` | `/observations/labs` | Triage/EHR adapter | Stores one timestamped lab result |
| `GET` | `/patients/{patient_id}/observations` | Triage/frontend | Reads recent raw observations |
| `GET` | `/patients/{patient_id}/features` | Triage service | Returns neutral trend and quality features |
| `GET` | `/health` | Gateway/monitoring | Confirms service readiness |

### Vital ingestion example

```json
{
  "patient_id": "P-1042",
  "observed_at": "2026-09-04T20:10:00Z",
  "source": "SIMULATED_EHR",
  "source_event_id": "ehr-vitals-p1042-2010",
  "heart_rate": 128,
  "systolic_bp": 94,
  "diastolic_bp": 62,
  "spo2": 89,
  "respiratory_rate": 29,
  "temperature_c": 39.4,
  "gcs": 14
}
```

At least one vital measurement is required. The API validates physiological ranges before writing data.

## Feature response

`GET /patients/P-1042/features?window_minutes=120` returns each vital's first/latest/minimum/maximum value, change, slope per hour, and measurement count. The quality block reports observation count, age of the latest reading, missing latest metrics, and metrics with at least two readings. Triage should reduce confidence when there is no baseline or readings are stale.

Laboratory series are available through `/observations`; request a specific test with `?test_code=PLATELET_COUNT`.

## Test checklist

1. Start the service and call `GET /health`.
2. Post four observations for one patient at increasing timestamps.
3. Repeat one request with the same `source_event_id`; confirm `status` is `duplicate`.
4. Call the features endpoint and confirm SpO2, heart-rate, and respiratory-rate changes match the input series.
5. Post a platelet lab series and retrieve it from the observations endpoint.

## Files

| File | Responsibility |
|---|---|
| `main.py` | HTTP interface and request validation |
| `repository.py` | TimescaleDB schema, writes, and reads |
| `features.py` | Pure trend calculations; no clinical decision logic |
| `.env.example` | Safe configuration template |
