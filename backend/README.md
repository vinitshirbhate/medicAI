# Sundara Command backend

Synthetic-only FastAPI backend for the Sundara Command demo. It is a read-only clinical-system sidecar: it stores demo inputs and clinician decisions, but has no endpoint that writes back to a hospital system.

```powershell
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000
```

Open `http://localhost:8000/docs`. Demo state is seeded automatically and restored with `POST /api/v1/demo/reset`.

Risk and prediction reliability are separate. Protocol band dominates ranking; low reliability triggers reassessment but never changes rank. Every AI assessment and clinician decision is append-only and hash-chained.

## Local nurse voice intake

`openai/whisper-small` runs locally on CPU. Its model files are downloaded once, then cached. Upload
audio to `POST /api/v1/voice/transcribe`; the response includes the transcript and a **review-required**
structured intake draft. It never silently creates a patient or assigns a protocol band.

```powershell
curl.exe -X POST http://127.0.0.1:8000/api/v1/voice/transcribe -F "audio=@handoff.wav"
```

FFmpeg must be on `PATH`: it decodes browser WebM and resamples anything that is not already 16 kHz,
which keeps `torchaudio` out of the dependency set.

## Intake extraction

`intake_extraction.py` turns a transcript into the draft by deterministic slot filling — no model, no
inference. Each slot lists the words nurses actually use (`heart rate`, `HR`, `pulse`; `blood
pressure`, `BP`, `88/54`; `oxygen saturation`, `SpO2`, `sats`), tolerates speech between the label and
the number ("heart rate's running at 132"), reads digits or spoken words ("eighty two thousand"), and
converts Fahrenheit. Three rules keep it honest:

- **Evidence.** Every reading carries the phrase it came from, so review checks a source, not a guess.
- **Plausibility.** A value outside its range is reported as heard and left missing, never stored — a
  misheard "1180" for a heart rate cannot enter the draft.
- **Negation.** "No history of dengue" is `DENIED`; a bare mention is `MENTIONED_UNCLEAR`, not
  confirmation, and only `CONFIRMED`/`SUSPECTED` open a pathway.

Nothing here assigns a protocol band. `uv run pytest` covers the phrasings and the refusals.

## Serial vitals from a spoken trajectory

"Her saturation has been falling from 96 to 89" is a trajectory, not a reading. Extraction records it
as `trends`, and on nurse confirmation the console writes the earlier value as its own observation
before the current one, so the engine ranks the deterioration rather than the endpoint alone. This is
what `risk-models.md` requires: *never collapse a series to its latest value in transit*.

- **Ordering, not timing.** The spoken earlier value carries no clock time. It is stored as
  `source: NURSE_REPORTED_PRIOR` with `observed_at_estimated: true`, sorted ahead of the confirmed
  reading at an equal timestamp. Nothing in scoring reads the interval, only the order.
- **Like-for-like scoring.** `news2_pair` scores both observations over the parameters measured in
  **both**. A sparse prior reading would otherwise raise the aggregate through missingness rather
  than deterioration — 3 → 15 instead of the honest 3 → 8.
- **The band stays human.** Voice intake assigns no protocol band, so the console requires a nurse to
  select one before a record can be created.

**Assumption needing sign-off (research item R-07):** a NEWS2 aggregate rise of `NEWS2_RISE_POINTS`
(currently 2) across the series counts as deterioration and adds 0.18 to risk. The NEWS2 *bands* are
the published RCP ones; the *rise threshold* is Sundara's own choice informed by them, not taken from
the standard. It is one named constant in `main.py`.

The voice console at `http://127.0.0.1:8000/` shows a **live transcript** while the nurse is still
speaking. The browser runs two recorders on one microphone stream: a continuous one for the final
reviewed pass, and a rolling four-second one whose self-contained WebM segments go to
`POST /api/v1/voice/transcribe-segment`. That endpoint returns transcript text only — no extraction,
no clinical inference — and returns an empty string for near-silent chunks, because Whisper otherwise
invents speech during pauses. The reviewed intake draft always comes from one complete pass over the
whole recording, never from stitched segments. `POST /api/v1/voice/warmup` loads the model up front so
the first spoken segment is not the one that waits.

For offline-only operation after the cache is populated, run the API with:

```powershell
$env:WHISPER_LOCAL_ONLY="1"
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```
