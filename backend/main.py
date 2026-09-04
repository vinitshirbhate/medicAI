"""Synthetic, read-only-sidecar API for the Sundara Command demo."""
from __future__ import annotations

import asyncio, hashlib, json, os, sqlite3
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from banding import CONFIDENCE_THRESHOLD, ESCALATION_CONFIDENCE_THRESHOLD, uncertainty_band
from intake_extraction import extract_intake
from second_opinion import run_second_opinion
from trend_features import features_for, summarise
from voice_intake import load_model, model_status, transcribe, transcribe_segment

DB = Path(os.getenv("SUNDARA_DB_PATH", Path(__file__).with_name("sundara.db")))
MODEL_VERSION = "sundara-triage-demo-0.1.0"  # The engine. An advisory model logs its own id per entry.
UTC = timezone.utc

def now() -> str: return datetime.now(UTC).isoformat()
def dump(v: Any) -> str: return json.dumps(v, sort_keys=True, separators=(",", ":"), default=str)
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row; return c

class Value(BaseModel):
    value: float | None = None
    missing: bool = False
    def model_post_init(self, __context: Any) -> None:
        if self.value is None: self.missing = True

class Vitals(BaseModel):
    observed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source: Literal["MONITOR", "MANUAL", "SIMULATED_EHR", "NURSE_REPORTED_PRIOR"] = "MANUAL"
    # A value spoken as "falling from 96 to 89" has no stated time. Only its order is trusted:
    # nothing in scoring reads the interval, and the estimated stamp is carried into the audit log.
    observed_at_estimated: bool = False
    heart_rate: Value = Field(default_factory=Value)
    systolic_bp: Value = Field(default_factory=Value)
    diastolic_bp: Value = Field(default_factory=Value)
    spo2: Value = Field(default_factory=Value)
    respiratory_rate: Value = Field(default_factory=Value)
    temperature_c: Value = Field(default_factory=Value)
    gcs: Value = Field(default_factory=Value)
    @field_validator("heart_rate")
    @classmethod
    def hr(cls, v: Value) -> Value:
        if v.value is not None and not 0 < v.value <= 300: raise ValueError("heart_rate must be 1–300")
        return v
    @field_validator("spo2")
    @classmethod
    def oxygen(cls, v: Value) -> Value:
        if v.value is not None and not 0 <= v.value <= 100: raise ValueError("spo2 must be 0–100")
        return v
    @field_validator("gcs")
    @classmethod
    def consciousness(cls, v: Value) -> Value:
        if v.value is not None and not 3 <= v.value <= 15: raise ValueError("gcs must be 3–15")
        return v

class Patient(BaseModel):
    patient_id: str = Field(min_length=1, max_length=64)
    hospital_id: str = "SUNDARA_CENTRAL"
    age: int = Field(ge=0, le=130)
    sex: Literal["F", "M", "OTHER", "UNKNOWN"] = "UNKNOWN"
    arrival_time: datetime = Field(default_factory=lambda: datetime.now(UTC))
    arrival_mode: Literal["AMBULANCE", "WALK_IN", "TRANSFER", "UNKNOWN"] = "WALK_IN"
    is_new_patient: bool = False
    chief_complaint: str = ""
    pathway: Literal["DENGUE", "BURN_SMOKE", "TRAUMA", "GENERAL"] = "GENERAL"
    protocol_band: int = Field(ge=1, le=5)
    symptoms: dict[str, bool | None] = Field(default_factory=dict)
    known_conditions: dict[str, str] = Field(default_factory=dict)
    pathway_detail: dict[str, Any] = Field(default_factory=dict)
    notes: str = ""
    vitals: Vitals

class SecondOpinionRequest(BaseModel):
    intake_draft: dict[str,Any] | None = None
    actor: str = "VOICE_CONSOLE"
    force_refresh: bool = False

class Decision(BaseModel):
    actor: str = Field(min_length=1)
    reason_code: Literal["NEW_CLINICAL_INFORMATION", "BEDSIDE_ASSESSMENT_DIFFERS", "RESOURCE_CONSTRAINT", "DETERIORATION_OBSERVED", "OTHER"] | None = None
    reason_text: str = ""
    new_rank: int | None = Field(default=None, ge=1)

class QueueHub:
    clients: set[WebSocket] = set()
    async def broadcast(self) -> None:
        payload = {"type": "queue.updated", "at": now(), "queue": queue()}
        for client in list(self.clients):
            try: await client.send_json(payload)
            except Exception: self.clients.discard(client)
hub = QueueHub()

def audit(event_type: str, initiated_by: str, actor: str, patient_id: str | None, payload: dict[str, Any]) -> dict[str, Any]:
    with conn() as c:
        last = c.execute("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").fetchone()
        previous = last["hash"] if last else "GENESIS"
        entry = {"timestamp": now(), "event_type": event_type, "initiated_by": initiated_by, "actor": actor, "patient_id": patient_id, "model_version": MODEL_VERSION, "payload": payload, "prev_hash": previous}
        h = hashlib.sha256((previous + dump(entry)).encode()).hexdigest()
        cursor = c.execute("INSERT INTO audit(entry,prev_hash,hash) VALUES(?,?,?)", (dump(entry), previous, h))
    return {**entry, "seq": cursor.lastrowid, "hash": h}

def vitals_for(patient_id: str) -> list[dict[str, Any]]:
    with conn() as c: rows = c.execute("SELECT id,payload FROM vitals WHERE patient_id=? ORDER BY id", (patient_id,)).fetchall()
    series = [(row["id"], json.loads(row["payload"])) for row in rows]
    series.sort(key=lambda item: (datetime.fromisoformat(item[1]["observed_at"]), not item[1].get("observed_at_estimated", False), item[0]))
    return [payload for _, payload in series]

# NEWS2 bands (RCP). Used here for the trajectory signal and as the named degraded-mode fallback.
NEWS2_BANDS = {
    "respiratory_rate": ((8, 3), (11, 1), (20, 0), (24, 2), (float("inf"), 3)),
    "spo2": ((91, 3), (93, 2), (95, 1), (float("inf"), 0)),
    "systolic_bp": ((90, 3), (100, 2), (110, 1), (219, 0), (float("inf"), 3)),
    "heart_rate": ((40, 3), (50, 1), (90, 0), (110, 1), (130, 2), (float("inf"), 3)),
    "temperature_c": ((35.0, 3), (36.0, 1), (38.0, 0), (39.0, 1), (float("inf"), 2)),
}
# A rise of this much across the observed series is treated as deterioration. Sundara's own choice,
# informed by NEWS2 parameters rather than taken from them: research item R-07 must confirm it.
NEWS2_RISE_POINTS = 2

def news2_points(v: dict[str, Any], names: set[str]) -> int:
    total = 0
    for name in names:
        value = v[name]["value"]
        total += (3 if value < 15 else 0) if name == "gcs" else next(points for edge, points in NEWS2_BANDS[name] if value <= edge)
    return total  # NEWS2 scores any consciousness state other than alert as 3; GCS < 15 stands in.

def news2_measured(v: dict[str, Any]) -> set[str]:
    return {name for name in (*NEWS2_BANDS, "gcs") if v.get(name, {}).get("value") is not None}

def news2_aggregate(v: dict[str, Any]) -> int | None:
    """Partial NEWS2 over the parameters this demo records. None when nothing was measured."""
    measured = news2_measured(v)
    return news2_points(v, measured) if measured else None

def news2_pair(earlier: dict[str, Any], later: dict[str, Any]) -> tuple[int | None, int | None]:
    """Score both observations over the parameters measured in both.

    A nurse-reported prior reading carries only the vitals that were spoken. Scoring it against a
    fuller current row would make the aggregate rise from missingness rather than from deterioration.
    """
    shared = news2_measured(earlier) & news2_measured(later)
    if not shared: return None, None
    return news2_points(earlier, shared), news2_points(later, shared)

def quality(p: dict[str, Any], v: dict[str, Any]) -> tuple[float, dict[str, float], list[str]]:
    values = [value for key, value in v.items() if isinstance(value, dict)]
    breakdown = {"vitals": round(sum(not x.get("missing", True) for x in values) / len(values), 2), "labs": 1.0 if p["pathway_detail"].get("platelet_trend") else .45, "history": .35 if p["is_new_patient"] else .85, "previous_records": 0.0 if p["is_new_patient"] else 1.0}
    missing = []
    if p["is_new_patient"]: missing += ["New patient; no previous baseline", "No prior medical history"]
    if v["spo2"].get("missing"): missing.append("No baseline SpO2")
    if not p["pathway_detail"].get("platelet_trend"): missing.append("No platelet trend")
    return round(sum(breakdown.values()) / 4, 2), breakdown, missing

def resources(p: dict[str, Any], risk: float) -> dict[str, Any]:
    if risk < .65: return {"preferred": "ED observation", "constraint": None, "alternative": None}
    return {"preferred": "ICU transfer", "constraint": "No ICU bed available at this hospital", "alternative": "High-acuity stabilization bay", "network_option": "SUNDARA_NORTH has 1 available ICU bed", "transport_feasible": True}

def calculate(p: dict[str, Any]) -> dict[str, Any]:
    series = vitals_for(p["patient_id"]); v = series[-1]; d = p["pathway_detail"]; risk = .12; contributions = []
    def add(condition: bool, points: float, feature: str, label: str) -> None:
        nonlocal risk
        if condition: risk += points; contributions.append({"feature": feature, "clinical_label": label, "contribution": points})
    spo2, hr, rr = v["spo2"]["value"], v["heart_rate"]["value"], v["respiratory_rate"]["value"]
    add(spo2 is not None and spo2 < 92, .24, f"SpO2 {spo2}%", "Oxygen saturation low")
    add(hr is not None and hr >= 120, .16, f"HR {hr}", "Heart rate elevated")
    add(rr is not None and rr >= 28, .13, f"RR {rr}", "Respiratory rate elevated")
    first, last = news2_pair(series[0], v) if len(series) > 1 else (None, None)
    rose = first is not None and last is not None and last - first >= NEWS2_RISE_POINTS
    add(rose, .18, f"NEWS2 {first} to {last}", f"Vital signs deteriorating across observations (NEWS2 {first} to {last})")
    trend = d.get("platelet_trend") or []  # A voice draft carries explicit nulls, not absent keys.
    add(len(trend) >= 2 and trend[-1] < trend[0] * .8, .15, "platelets falling", "Platelet count falling")
    add(d.get("airway_concern") == "HIGH", .24, "high airway concern", "Progressive airway risk")
    add(bool(d.get("smoke_inhalation")), .10, "smoke inhalation", "Smoke inhalation exposure")
    add((d.get("tbsa_pct") or 0) >= 20, .16, f"TBSA {d.get('tbsa_pct')}%", "Large burn area")
    # Strongest driver first, so the one-line explanation names what actually moved the score.
    contributions.sort(key=lambda item: item["contribution"], reverse=True)
    risk = round(min(risk, .98), 2); complete, breakdown, missing = quality(p, v)
    ensemble = [max(.01, min(.99, risk + shift)) for shift in (-.025, .015, -.01, .02, 0)]
    spread = round(max(ensemble) - min(ensemble), 3); ood = p["age"] < 16 and p["pathway"] == "BURN_SMOKE"
    reliability = round(max(.2, min(.98, .94 - spread * 2.5 - (1 - complete) * .45 - (.18 if ood else 0))), 2)
    low = reliability < CONFIDENCE_THRESHOLD
    escalation = {"to_band": p["protocol_band"] - 1, "status": "AWAITING_CONFIRMATION", "evidence": [x["clinical_label"] for x in contributions[:3]]} if risk >= .8 and reliability >= ESCALATION_CONFIDENCE_THRESHOLD and p["protocol_band"] > 1 else None
    return {"patient_id": p["patient_id"], "assessed_at": now(), "initiated_by": "AI", "model_version": MODEL_VERSION, "protocol_band": p["protocol_band"], "deterioration_risk": risk, "prediction_reliability": reliability, "data_completeness": complete, "completeness_breakdown": breakdown, "time_sensitivity": "HIGH" if risk >= .65 else "MODERATE", "forecast": {"horizon_hours": 2, "trajectory": ["MODERATE", "HIGH", "CRITICAL"] if risk >= .7 else ["LOW", "MODERATE", "HIGH"], "probability": risk}, "explanation": {"one_line": "; ".join(x["clinical_label"] for x in contributions[:3]) or "No high-risk feature identified.", "contributions": contributions}, "observations_used": len(series), "news2": {"first": first, "latest": last, "rise_points": NEWS2_RISE_POINTS}, "uncertainty": {"is_low_confidence": low, "reasons": missing if low else [], "ood_flag": ood, "ensemble_spread": spread}, "proposed_escalation": escalation, "recommended_action": {"primary": "Priority clinical reassessment" if low else "Immediate clinician assessment" if risk >= .65 else "Clinical assessment when available", "preparation": ["Continuous SpO2 monitoring", "Repeat CBC"] if risk >= .65 else [], "verb": "SUGGESTED"}, "prefilled_override": {"reason_code": "BEDSIDE_ASSESSMENT_DIFFERS", "reason_text": "System uncertainty: " + "; ".join(missing), "reassessment_minutes": 10} if low else None, "resource_recommendation": resources(p, risk)}

def save_assessment(p: dict[str, Any]) -> dict[str, Any]:
    a = calculate(p)
    with conn() as c: c.execute("INSERT OR REPLACE INTO assessments VALUES(?,?,?)", (p["patient_id"], dump(a), a["assessed_at"]))
    audit("AI_ASSESSMENT", "AI", "SUNDARA_TRIAGE_ENGINE", p["patient_id"], {"risk": a["deterioration_risk"], "prediction_reliability": a["prediction_reliability"], "protocol_band": a["protocol_band"]})
    return a

def queue() -> list[dict[str, Any]]:
    with conn() as c: rows = c.execute("SELECT p.payload patient,a.payload assessment FROM patients p JOIN assessments a USING(patient_id)").fetchall()
    result = []
    for row in rows:
        p, a = json.loads(row["patient"]), json.loads(row["assessment"])
        waited = max(0, (datetime.now(UTC) - datetime.fromisoformat(p["arrival_time"])).total_seconds() / 60)
        # Lexicographic policy: reliability is intentionally absent; it gates actions only.
        rank_key = (a["protocol_band"], -a["deterioration_risk"], -int(a["time_sensitivity"] == "HIGH"), -min(waited / 600, .09), p["arrival_time"])
        result.append((rank_key, {**a, "patient": {key: p[key] for key in ("patient_id", "hospital_id", "age", "sex", "pathway", "chief_complaint", "arrival_time")}, "minutes_waiting": round(waited, 1)}))
    result.sort(key=lambda x: x[0]); seen: dict[int, int] = {}
    for index, (_, item) in enumerate(result, 1):
        band = item["protocol_band"]; seen[band] = seen.get(band, 0) + 1; item["global_rank"] = index; item["rank_within_band"] = seen[band]
    return [item for _, item in result]

def seed() -> None:
    base = datetime.now(UTC) - timedelta(minutes=16)
    cases = [
        ({"patient_id":"P-1042","hospital_id":"SUNDARA_CENTRAL","age":46,"sex":"F","arrival_time":base.isoformat(),"arrival_mode":"AMBULANCE","is_new_patient":False,"chief_complaint":"Shortness of breath and high fever","pathway":"DENGUE","protocol_band":2,"symptoms":{"fever":True,"breathlessness":True},"known_conditions":{"dengue":"CONFIRMED"},"pathway_detail":{"platelet_trend":[128000,110000,96000,82000],"lactate_mmol_l":3.1},"notes":"Synthetic demo case"}, {"heart_rate":128,"systolic_bp":94,"diastolic_bp":62,"spo2":89,"respiratory_rate":29,"temperature_c":39.4,"gcs":14}),
        ({"patient_id":"P-1043","hospital_id":"SUNDARA_CENTRAL","age":46,"sex":"UNKNOWN","arrival_time":(base+timedelta(minutes=2)).isoformat(),"arrival_mode":"AMBULANCE","is_new_patient":True,"chief_complaint":"Fever and dizziness","pathway":"DENGUE","protocol_band":2,"symptoms":{"fever":True},"known_conditions":{"dengue":"UNKNOWN"},"pathway_detail":{},"notes":"Synthetic demo case"}, {"heart_rate":126,"systolic_bp":96,"diastolic_bp":64,"spo2":None,"respiratory_rate":28,"temperature_c":39.1,"gcs":14}),
    ]
    for patient, values in cases:
        with conn() as c:
            existing = c.execute("SELECT payload FROM patients WHERE patient_id=?", (patient["patient_id"],)).fetchone()
            has_assessment = c.execute("SELECT 1 FROM assessments WHERE patient_id=?", (patient["patient_id"],)).fetchone()
            if existing and has_assessment:
                continue
        if existing:
            save_assessment(json.loads(existing["payload"]))
            continue
        observation = {"observed_at":now(),"source":"SIMULATED_EHR", **{k:{"value":v,"missing":v is None} for k,v in values.items()}}
        with conn() as c:
            c.execute("INSERT INTO patients VALUES(?,?,?)", (patient["patient_id"],dump(patient),now()))
            c.execute("INSERT INTO vitals(patient_id,payload) VALUES(?,?)", (patient["patient_id"],dump(observation)))
        save_assessment(patient)

def list_patients() -> list[dict[str, Any]]:
    with conn() as c: rows = c.execute("SELECT payload FROM patients").fetchall()
    return [json.loads(row["payload"]) for row in rows]

def network_resources() -> dict[str, Any]:
    return {"network_icu_occupancy_pct":93,"active_events":[{"type":"OUTBREAK","severity":"HIGH"},{"type":"MASS_CASUALTY","casualties":84},{"type":"TRANSIT_DISRUPTION","staff_unavailable_pct":24}],"hospitals":[{"hospital_id":"SUNDARA_CENTRAL","icu":{"total":40,"occupied":40,"available":0},"ed":{"total":80,"occupied":71,"available":9},"staff":{"doctors":{"scheduled":22,"available":19},"nurses":{"scheduled":48,"available":37}}},{"hospital_id":"SUNDARA_NORTH","icu":{"total":30,"occupied":29,"available":1},"ed":{"total":60,"occupied":46,"available":14},"staff":{"doctors":{"scheduled":18,"available":16},"nurses":{"scheduled":38,"available":34}}}],"infeasibilities":[{"request":"Reassign nurses from SUNDARA_EAST to SUNDARA_CENTRAL","status":"IMPOSSIBLE","reason":"Transit corridor unavailable during strike","alternative":"Route eligible high-acuity arrivals to SUNDARA_NORTH"}]}

def setup() -> None:
    with conn() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS patients(patient_id TEXT PRIMARY KEY,payload TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS vitals(id INTEGER PRIMARY KEY AUTOINCREMENT,patient_id TEXT NOT NULL,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS assessments(patient_id TEXT PRIMARY KEY,payload TEXT NOT NULL,assessed_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,entry TEXT NOT NULL,prev_hash TEXT NOT NULL,hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS second_opinions(fingerprint TEXT PRIMARY KEY,patient_id TEXT NOT NULL,model_id TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);""")
    seed()

@asynccontextmanager
async def lifespan(_: FastAPI):
    setup(); yield

app = FastAPI(title="Sundara Command API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000","http://127.0.0.1:3000"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health() -> dict[str,str]: return {"status":"ok","mode":"synthetic-demo-only"}
@app.get("/api/v1/voice/model-status")
def voice_model_status() -> dict[str,Any]: return model_status()
@app.post("/api/v1/voice/warmup")
async def voice_warmup() -> dict[str,Any]:
    """Load Whisper before recording starts so the first live segment is not the one that waits."""
    try:
        await asyncio.to_thread(load_model)
    except Exception as error:
        raise HTTPException(503, "Local Whisper model could not be loaded. Check dependencies and the model cache.") from error
    return model_status()
@app.post("/api/v1/voice/extract-text")
def extract_from_text(transcript: str) -> dict[str,Any]:
    """Development/review endpoint for checking the conservative extraction contract."""
    return extract_intake(transcript)
@app.post("/api/v1/voice/transcribe")
async def transcribe_nurse_handoff(audio: UploadFile = File(...)) -> dict[str,Any]:
    """Transcribe an audio handoff locally and return a nurse-reviewable intake draft."""
    if audio.content_type and not audio.content_type.startswith("audio/"):
        raise HTTPException(415, "Upload an audio file (for example WAV, MP3, or FLAC).")
    content = await audio.read()
    if not content: raise HTTPException(422, "Audio file is empty.")
    if len(content) > 25 * 1024 * 1024: raise HTTPException(413, "Audio file exceeds the 25 MB demo limit.")
    try:
        transcript = await asyncio.to_thread(transcribe, content)
    except Exception as error:
        raise HTTPException(503, "Local Whisper transcription unavailable. Confirm dependencies, audio decoding support, and the model cache.") from error
    return {**extract_intake(transcript), "audio_filename": audio.filename, "transcription_model": "openai/whisper-small"}
@app.post("/api/v1/voice/transcribe-segment")
async def transcribe_voice_segment(audio: UploadFile = File(...)) -> dict[str,str]:
    """Short streaming-style chunk for the live transcript; no clinical extraction occurs here."""
    if audio.content_type and not audio.content_type.startswith("audio/"):
        raise HTTPException(415, "Upload an audio file.")
    content = await audio.read()
    if not content: raise HTTPException(422, "Audio segment is empty.")
    if len(content) > 10 * 1024 * 1024: raise HTTPException(413, "Audio segment exceeds 10 MB.")
    try:
        transcript = await asyncio.to_thread(transcribe_segment, content)
    except Exception as error:
        raise HTTPException(503, "Local Whisper segment transcription unavailable.") from error
    return {"transcript": transcript}
@app.get("/api/v1/queue")
def get_queue() -> dict[str,Any]: return {"updated_at":now(),"ranking_policy":"protocol band, then risk, time sensitivity, wait equity; reliability gates only","patients":queue()}
@app.post("/api/v1/patients",status_code=201)
async def create_patient(payload: Patient) -> dict[str,Any]:
    with conn() as c:
        if c.execute("SELECT 1 FROM patients WHERE patient_id=?",(payload.patient_id,)).fetchone(): raise HTTPException(409,"patient_id already exists")
        patient = payload.model_dump(mode="json",exclude={"vitals"}); c.execute("INSERT INTO patients VALUES(?,?,?)",(payload.patient_id,dump(patient),now())); c.execute("INSERT INTO vitals(patient_id,payload) VALUES(?,?)",(payload.patient_id,dump(payload.vitals.model_dump(mode="json"))))
    assessment=save_assessment(patient); await hub.broadcast(); return assessment
@app.post("/api/v1/patients/{patient_id}/vitals")
async def add_vitals(patient_id:str,payload:Vitals)->dict[str,Any]:
    with conn() as c:
        row=c.execute("SELECT payload FROM patients WHERE patient_id=?",(patient_id,)).fetchone()
        if not row: raise HTTPException(404,"patient not found")
        c.execute("INSERT INTO vitals(patient_id,payload) VALUES(?,?)",(patient_id,dump(payload.model_dump(mode="json"))))
    assessment=save_assessment(json.loads(row["payload"])); await hub.broadcast(); return assessment
@app.post("/api/v1/patients/{patient_id}/second-opinion")
async def second_opinion(patient_id:str,payload:SecondOpinionRequest)->dict[str,Any]:
    """An advisory reading beside the engine's. Never ranks, never escalates, always logged."""
    with conn() as c:
        patient_row=c.execute("SELECT payload FROM patients WHERE patient_id=?",(patient_id,)).fetchone()
        assessment_row=c.execute("SELECT payload FROM assessments WHERE patient_id=?",(patient_id,)).fetchone()
    if not patient_row: raise HTTPException(404,"patient not found")
    if not assessment_row: raise HTTPException(409,"no engine assessment yet; create the record first")
    patient,assessment=json.loads(patient_row["payload"]),json.loads(assessment_row["payload"])
    series=vitals_for(patient_id)
    trends=await asyncio.to_thread(lambda:summarise(features_for(patient_id,series)))
    result=await asyncio.to_thread(run_second_opinion,patient=patient,assessment=assessment,latest=series[-1] if series else {},
        trends=trends,intake_draft=payload.intake_draft,connect=conn,force_refresh=payload.force_refresh,generated_at=now())
    advisory=result["second_opinion"]
    audit("LLM_SECOND_OPINION","AI","OPENROUTER_SECOND_OPINION",patient_id,{
        "status":result["status"],"role":"ADVISORY_ONLY","trend_source":result.get("trend_source"),
        "advisory_model_id":advisory.get("advisory_model_id"),"prompt_version":advisory.get("prompt_version"),
        "payload_fingerprint":advisory.get("payload_fingerprint"),"cached":advisory.get("cached",False),"forced":payload.force_refresh,
        "engine":{key:result["engine"][key] for key in ("deterioration_risk","prediction_reliability","data_completeness")},
        "second_opinion":{key:advisory.get(key) for key in ("deterioration_risk","prediction_reliability","data_completeness")},
        "divergence":{key:result["divergence"].get(key) for key in ("status","risk_delta_pp","threshold_pp","differing_lines")},
        "affected_rank":False,"rejection_reasons":(result.get("degraded") or {}).get("detail",[])})
    return result
@app.get("/api/v1/patients/{patient_id}/trends")
def patient_trends(patient_id:str)->dict[str,Any]:
    """Factual trend features from the time-series service, or locally derived and labelled as such."""
    with conn() as c:
        if not c.execute("SELECT 1 FROM patients WHERE patient_id=?",(patient_id,)).fetchone(): raise HTTPException(404,"patient not found")
    return features_for(patient_id,vitals_for(patient_id))
@app.get("/api/v1/patients/{patient_id}/assessment")
def assessment(patient_id:str)->dict[str,Any]:
    with conn() as c: row=c.execute("SELECT payload FROM assessments WHERE patient_id=?",(patient_id,)).fetchone()
    if not row: raise HTTPException(404,"assessment not found")
    return json.loads(row["payload"])
@app.post("/api/v1/patients/{patient_id}/accept")
async def accept(patient_id:str,payload:Decision)->dict[str,str]:
    audit("ACCEPT","HUMAN",payload.actor,patient_id,{"recommendation_accepted":True}); await hub.broadcast(); return {"status":"accepted","message":"Recommendation accepted."}
@app.post("/api/v1/patients/{patient_id}/override")
async def override(patient_id:str,payload:Decision)->dict[str,Any]:
    if not payload.reason_code: raise HTTPException(422,"reason_code is required for an override")
    due=(datetime.now(UTC)+timedelta(minutes=10)).isoformat(); audit("OVERRIDE","HUMAN",payload.actor,patient_id,{"reason_code":payload.reason_code,"reason_text":payload.reason_text,"new_rank":payload.new_rank,"reassessment_due":due}); await hub.broadcast(); return {"status":"override_accepted","message":"Override accepted. Reassessment recommended in 10 minutes.","reassessment_due":due}
@app.get("/api/v1/resources")
def resource_state()->dict[str,Any]: return network_resources()
@app.get("/api/v1/audit")
def audit_entries()->list[dict[str,Any]]:
    with conn() as c: rows=c.execute("SELECT seq,entry,hash FROM audit ORDER BY seq").fetchall()
    return [{**json.loads(r["entry"]),"seq":r["seq"],"hash":r["hash"]} for r in rows]
@app.get("/api/v1/audit/verify")
def verify_audit()->dict[str,Any]:
    previous="GENESIS"
    for item in audit_entries():
        claimed=item.pop("hash"); item.pop("seq")
        if item["prev_hash"] != previous or hashlib.sha256((previous+dump(item)).encode()).hexdigest()!=claimed: return {"valid":False,"failed_at":item.get("patient_id")}
        previous=claimed
    return {"valid":True,"head_hash":previous}
@app.post("/api/v1/demo/reset")
async def reset_demo()->dict[str,Any]:
    with conn() as c: c.executescript("DELETE FROM audit; DELETE FROM assessments; DELETE FROM vitals; DELETE FROM patients; DELETE FROM second_opinions;")
    seed(); await hub.broadcast(); return {"status":"reset","patients":len(queue())}
@app.websocket("/ws/queue")
async def queue_socket(socket:WebSocket)->None:
    await socket.accept(); hub.clients.add(socket); await socket.send_json({"type":"queue.updated","at":now(),"queue":queue()})
    try:
        while True: await socket.receive_text()
    except WebSocketDisconnect: hub.clients.discard(socket)

# Keep the voice-console static client separate from API code, but serve both with one command.
app.mount("/", StaticFiles(directory=Path(__file__).parent.parent / "frontend", html=True), name="voice-console")
