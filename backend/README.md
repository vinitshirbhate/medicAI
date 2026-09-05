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

## Advisory second opinion (OpenRouter)

`POST /api/v1/patients/{id}/second-opinion` asks a hosted model for its own reading of the same
patient and returns it **beside** the engine's, in four fixed lines:

```
                         SUNDARA ENGINE     ADVISORY MODEL
Deterioration Risk                  87%                74%
Prediction Reliability             HIGH               LOW
Data Completeness                   91%                88%
Uncertainty                         LOW              HIGH
```

The engine alone ranks the patient. The advisory reading is displayed, audited, and ignored by the
queue: `divergence.affects_rank` is a literal `false` in the wire format, `second_opinion.py` never
imports `main`, and a test asserts the queue and the stored assessment are byte-identical before and
after a wildly divergent opinion arrives.

**Nothing the model returns is shown unverified.** An opinion is discarded whole — with its reasons
on screen — if it cites a field absent from the payload, states a value the payload contradicts,
quotes a phrase that was never supplied, names a reliability reason outside the closed vocabulary,
returns a number outside 0-1, mentions ranking or treatment, or writes any number that does not
appear in its input. Partial trust is not a thing a clinical panel can render.

**What is sent:** age, sex, arrival mode, symptoms, known conditions, pathway detail, the latest
observation with its spoken evidence phrases, and trend features. **What is withheld:** the patient
identifier and arrival time, the raw transcript (free text carries identifiers, and re-sending it
would hand back values extraction refused as implausible), and every engine conclusion — an anchored
second opinion produces a divergence signal worth nothing.

Trend features come from the time-series service at `TIME_SERIES_URL` when it is reachable, and are
otherwise derived from this service's own series using that service's own functions. The response
always names which happened (`trend_source`, `trend_note`); locally derived features are never
presented as service-derived.

### Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Required. Read from `backend/.env`, which is gitignored |
| `SECOND_OPINION_MODEL` | `openai/gpt-4.1-nano` | Cheapest OpenAI model on OpenRouter with structured outputs, temperature and seed |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Point at a local OpenAI-compatible server and nothing leaves the building |
| `SECOND_OPINION_ENABLED` | `1` | Kill switch; set to `0` for an air-gapped demo |
| `SECOND_OPINION_CACHE_ONLY` | `0` | Serve only cached opinions; never call out |
| `SECOND_OPINION_MAX_CALLS_PER_RUN` | `50` | Spend guard |

Every failure — no key, kill switch, timeout, upstream error, unreadable output, rejected output —
returns HTTP 200 with the engine block intact and a named `degraded.reason_code`. The panel says
which state it is in; it never silently shows nothing.

Responses are cached in SQLite keyed by a hash of the input, prompt version and model, so a repeated
demo run is identical and free. Sampling parameters are best effort on a hosted model; **the cache is
what actually delivers reproducibility**, not `temperature: 0`.

**Assumptions needing sign-off:** `DIVERGENCE_RISK_PP = 15` is tuned for this demo, not derived. The
privacy stance is that data is synthetic (NFR-09), no identifier is sent, and in deployment this
component runs against a locally hosted OpenAI-compatible model at the hospital edge — the cloud
endpoint is a hackathon convenience, which is why `OPENROUTER_BASE_URL` is configurable.

## Staffing plan under the transit strike

`GET /api/v1/resources/staffing-plan` proposes tonight's staffing and, more importantly, names what
tonight makes impossible. The transit strike is a hard constraint here, not a label: a corridor with
reachability `0` means the allocator **cannot** use those staff.

```
Reassign 3 nurses from SUNDARA_NORTH to SUNDARA_CENTRAL          IMPOSSIBLE
  why      Transit corridor NORTH -> CENTRAL is closed for the 19:00-06:00 window.
           Those 5 movable nurses exist and are available at North; they cannot reach Central tonight.
  instead  Redeploy 3 nurses already on site at Central from general cover to the critical cohort.
```

Three properties make it a realistic plan rather than a theoretical one:

- **Staff already on site need no corridor.** `R[h][h]` is always 1, so within-hospital redeployment
  is structurally available — and it is **priced**: closing Central's gap thins low-acuity cover from
  1:4 to 1:6, and the action says so, because the low-acuity 90th-percentile wait is the honesty
  metric published alongside the headline.
- **When staff cannot travel, patients can.** Redirecting an eligible arrival to the hospital where
  the nurses already are is the substitute for moving nurses. The reachability matrix constrains
  **staff commuting on public transit**, not ambulance transport — the response says so in
  `applies_to` / `does_not_apply_to`, because it is the first thing a judge will ask.
- **The residual is always stated**, even at zero: *no staff were added to the network tonight; the
  gap was redistributed, not solved.*

Candidates are enumerated on the **gross** shortfall and only then split by reachability, so a
blocked reassignment cannot become a silent omission — an invariant asserted by a test. `available`
is the only allocator input; `scheduled` is read solely to be displayed, and both are always shown.

Pass `?at=<ISO-8601>` to evaluate at another instant: after 06:00 the corridor reopens and the
blocked reassignment becomes feasible. That is the demonstration that the constraint is code rather
than a dashboard label, and it is why the plan is evaluated at a pinned scenario instant instead of
wall-clock `now()` — running the demo in the morning would otherwise silently open every corridor.

The 21% chronic shortage and 24% strike unavailability **compound and are never added**: the response
carries the derivation (0.79 × 0.76 = 0.60 → 60% cover) and `naive_sum_not_used: 45`. Neither
percentage multiplies any observed headcount; the allocator consumes actual available counts only.

**It proposes; it never acts.** Every action is `SUGGESTED` and awaits a charge nurse. The output is
a count of a role in a unit — never an individual, never a roster, never attendance — and
unavailability is always attributed to the closed corridor rather than to a person. A staffing tool
that reads as surveillance forfeits the clinical trust the rest of the system depends on.

`/api/v1/resources` sources its `infeasibilities` from this module, so the capacity panel and the
staffing panel cannot state different things about the same night.

**Assumption needing sign-off:** the nurse- and doctor-per-bed ratios are Sundara demo policy
parameters, not case facts. Every requirement ships its derivation so a clinician can recompute it.
They must not be tuned to manufacture a shortfall — a test locks the seeded premise so a vanished gap
fails loudly instead of being quietly adjusted away.

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
