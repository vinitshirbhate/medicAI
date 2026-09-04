const API = "http://127.0.0.1:8000/api/v1";
const recordButton = document.querySelector("#record");
const stopButton = document.querySelector("#stop");
const statusText = document.querySelector("#recording-status");
const title = document.querySelector("#recording-title");
const pulse = document.querySelector("#pulse");
const errorBox = document.querySelector("#error");
// MediaRecorder timeslice blobs after the first carry no WebM header and cannot be decoded on their
// own, so a second, rolling recorder produces self-contained segments for the live transcript while
// the continuous recorder keeps one intact recording for the final, reviewed pass.
const SEGMENT_MS = 4000;
let fullRecorder;
let segmentRecorder;
let stream;
let chunks = [];
let segmentQueue = Promise.resolve();
let liveSegments = [];
let listening = false;
let finalized = false;
let pendingSegments = 0;

const titleCase = (value) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const display = (value) => value === null || value === undefined || value === "" ? "Not stated" : String(value);

function fields(target, values) {
  target.innerHTML = Object.entries(values).map(([label, value]) => `<dt>${titleCase(label)}</dt><dd>${display(value)}</dd>`).join("");
}

// Every extracted value shows the words it came from, so review is a check rather than a guess.
function readings(target, entries) {
  target.innerHTML = Object.entries(entries).map(([label, reading]) => {
    const trace = reading.value === null ? reading.note : [reading.evidence, reading.note].filter(Boolean).join(" · ");
    return `<dt>${titleCase(label)}</dt><dd>${display(reading.value)}${trace ? `<small>heard: ${trace}</small>` : ""}</dd>`;
  }).join("");
}

function setError(message = "") {
  errorBox.hidden = !message;
  errorBox.textContent = message;
}

async function checkConnection() {
  const badge = document.querySelector("#connection");
  try {
    const response = await fetch(`${API}/voice/model-status`);
    if (!response.ok) throw new Error();
    const model = await response.json();
    badge.classList.add("online");
    if (model.loaded) {
      badge.textContent = "Whisper ready";
      return;
    }
    // Load the model before the nurse speaks, so the first live segment is not the one that waits.
    badge.textContent = "Loading Whisper…";
    const warm = await fetch(`${API}/voice/warmup`, { method: "POST" });
    badge.textContent = warm.ok ? "Whisper ready" : "Whisper loads on first recording";
  } catch {
    badge.textContent = "Backend unavailable";
    badge.classList.add("offline");
  }
}

function recorderOptions() {
  const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
  return type ? { mimeType: type } : undefined;
}

function liveState(text) {
  document.querySelector("#live-state").textContent = pendingSegments > 1 ? `${text} · ${pendingSegments} queued` : text;
}

function startSegmentRecorder() {
  segmentRecorder = new MediaRecorder(stream, recorderOptions());
  segmentRecorder.ondataavailable = ({ data }) => {
    if (!data.size) return;
    pendingSegments += 1;
    segmentQueue = segmentQueue.then(() => uploadSegment(data));
  };
  segmentRecorder.onstop = () => {
    if (listening) startSegmentRecorder();
  };
  segmentRecorder.start();
  setTimeout(() => {
    if (segmentRecorder?.state === "recording") segmentRecorder.stop();
  }, SEGMENT_MS);
}

recordButton.addEventListener("click", async () => {
  setError();
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setError("This browser does not support microphone recording. Use a recent Chrome, Edge, or Firefox build.");
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks = [];
    liveSegments = [];
    segmentQueue = Promise.resolve();
    pendingSegments = 0;
    listening = true;
    finalized = false;
    fullRecorder = new MediaRecorder(stream, recorderOptions());
    fullRecorder.ondataavailable = ({ data }) => {
      if (data.size) chunks.push(data);
    };
    fullRecorder.onstop = async () => {
      stream?.getTracks().forEach((track) => track.stop());
      await segmentQueue;
      await uploadRecording();
    };
    fullRecorder.start();
    startSegmentRecorder();
    recordButton.disabled = true;
    stopButton.disabled = false;
    title.textContent = "Listening…";
    statusText.textContent = "Speak the nurse handoff. The microphone stays on until you stop.";
    pulse.classList.add("recording");
    document.querySelector("#live-panel").hidden = false;
    document.querySelector("#live-transcript").textContent = "Listening for the first speech segment…";
    document.querySelector("#live-state").textContent = "listening";
  } catch (error) {
    listening = false;
    setError(`Microphone access failed: ${error.message}`);
  }
});

stopButton.addEventListener("click", () => {
  listening = false;
  if (segmentRecorder?.state === "recording") segmentRecorder.stop();
  if (fullRecorder?.state === "recording") fullRecorder.stop();
  recordButton.disabled = true;
  stopButton.disabled = true;
  title.textContent = "Transcribing locally…";
  statusText.textContent = "Whisper-small is processing the recording. The first recording can take longer.";
  pulse.classList.remove("recording");
  document.querySelector("#live-state").textContent = "finalizing";
});

async function uploadSegment(blob) {
  const form = new FormData();
  form.append("audio", blob, "live-segment.webm");
  liveState("transcribing");
  try {
    const response = await fetch(`${API}/voice/transcribe-segment`, { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "Live segment failed.");
    const text = (payload.transcript || "").trim();
    // Silent segments come back empty, and Whisper repeats itself across a pause between sentences.
    if (text && text !== liveSegments[liveSegments.length - 1]) liveSegments.push(text);
    if (!finalized) {
      document.querySelector("#live-transcript").textContent = liveSegments.join(" ") || "Listening for speech…";
      liveState(listening ? "listening" : "finalizing");
    }
  } catch (error) {
    // Preserve recording and allow the full final pass to recover from a transient chunk failure.
    console.warn("Live transcription segment failed", error);
    if (!finalized) liveState("segment skipped");
  } finally {
    pendingSegments = Math.max(0, pendingSegments - 1);
  }
}

async function uploadRecording() {
  try {
    const blob = new Blob(chunks, { type: fullRecorder.mimeType || "audio/webm" });
    const form = new FormData();
    form.append("audio", blob, "nurse-handoff.webm");
    const response = await fetch(`${API}/voice/transcribe`, { method: "POST", body: form });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || "Transcription failed.");
    render(payload);
    finalized = true;
    document.querySelector("#live-transcript").textContent = payload.transcript || liveSegments.join(" ");
    document.querySelector("#live-state").textContent = "final transcript";
    title.textContent = "Intake draft ready";
    statusText.textContent = "Review the extracted information before creating or updating a patient.";
  } catch (error) {
    finalized = true;
    title.textContent = "Voice intake unavailable";
    statusText.textContent = "Try recording again after checking the backend.";
    setError(error.message);
  } finally {
    recordButton.disabled = false;
    stopButton.disabled = true;
  }
}

function render(payload) {
  const draft = payload.patient_draft;
  document.querySelector("#empty").hidden = true;
  document.querySelector("#result").hidden = false;
  document.querySelector("#transcript").textContent = payload.transcript || "No speech detected.";
  fields(document.querySelector("#patient"), {
    patient_id: draft.patient_id ? `${draft.patient_id}${draft.patient_id_note ? " *" : ""}` : null,
    age: draft.age,
    sex: draft.sex,
    arrival_mode: draft.arrival_mode,
    is_new_patient: draft.is_new_patient ? "Yes" : "Not stated",
    pathways: draft.pathways_detected.join(", ") || "Not stated",
    allergies: draft.allergies,
  });
  readings(document.querySelector("#vitals"), draft.vitals);
  fields(document.querySelector("#pathway"), {
    dengue_status: draft.pathway_detail.dengue_status,
    day_of_illness: draft.pathway_detail.day_of_illness,
    burn_tbsa_pct: draft.pathway_detail.tbsa_pct,
    smoke_inhalation: draft.pathway_detail.smoke_inhalation ? "Mentioned" : "Not stated",
    smoke_exposure_minutes: draft.pathway_detail.exposure_duration_min,
    platelet_trend: draft.pathway_detail.platelet_trend.join(" → ") || "Not stated",
  });
  document.querySelector("#missing").innerHTML = payload.missing_or_unconfirmed.map((item) => `<li>${item}</li>`).join("");
  prepareConfirmation(draft);
}

// The draft becomes a record only when a nurse confirms it and assigns the band, which voice intake
// never does. Any spoken trajectory is written first, as an earlier reading, so the engine ranks the
// deterioration rather than the endpoint alone.
let confirmedDraft = null;

function prepareConfirmation(draft) {
  confirmedDraft = draft;
  document.querySelector("#c-id").value = draft.patient_id || "";
  document.querySelector("#c-age").value = draft.age ?? "";
  document.querySelector("#c-band").value = "";
  const pathways = [...draft.pathways_detected, "GENERAL"];
  document.querySelector("#c-pathway").innerHTML = pathways.map((name) => `<option value="${name}">${name}</option>`).join("");
  const trends = Object.entries(draft.trends || {});
  const note = document.querySelector("#prior-note");
  note.hidden = trends.length === 0;
  note.textContent = trends.length
    ? `An earlier reading will be recorded from the trajectory you described: ${trends.map(([name, t]) => `${titleCase(name)} ${t.from} → ${t.to}`).join(", ")}. Its clock time was not spoken, so only its order is used.`
    : "";
  document.querySelector("#create-result").hidden = true;
  checkReady();
}

function checkReady() {
  const ready = document.querySelector("#c-id").value.trim() && document.querySelector("#c-age").value !== "" && document.querySelector("#c-band").value;
  document.querySelector("#create").disabled = !ready;
}

["#c-id", "#c-age", "#c-band"].forEach((selector) => document.querySelector(selector).addEventListener("input", checkReady));

document.querySelector("#create").addEventListener("click", async () => {
  const button = document.querySelector("#create");
  const result = document.querySelector("#create-result");
  const observedAt = new Date().toISOString();
  button.disabled = true;
  result.hidden = false;
  result.classList.remove("failed");
  result.textContent = "Creating record…";
  try {
    const current = Object.fromEntries(Object.entries(confirmedDraft.vitals).map(([name, reading]) => [name, { value: reading.value }]));
    let assessment = await send(`${API}/patients`, {
      patient_id: document.querySelector("#c-id").value.trim(),
      age: Number(document.querySelector("#c-age").value),
      sex: confirmedDraft.sex,
      arrival_mode: confirmedDraft.arrival_mode,
      is_new_patient: confirmedDraft.is_new_patient,
      pathway: document.querySelector("#c-pathway").value,
      protocol_band: Number(document.querySelector("#c-band").value),
      symptoms: confirmedDraft.symptoms,
      known_conditions: confirmedDraft.known_conditions,
      pathway_detail: confirmedDraft.pathway_detail,
      notes: "Voice intake, nurse reviewed.",
      vitals: { observed_at: observedAt, source: "MANUAL", ...current },
    });
    const trends = Object.entries(confirmedDraft.trends || {});
    if (trends.length) {
      // Same stamp as the current reading, flagged estimated: the order is known, the interval is not.
      assessment = await send(`${API}/patients/${assessment.patient_id}/vitals`, {
        observed_at: observedAt,
        source: "NURSE_REPORTED_PRIOR",
        observed_at_estimated: true,
        ...Object.fromEntries(trends.map(([name, trend]) => [name, { value: trend.from }])),
      });
    }
    const news2 = assessment.news2 || {};
    result.textContent = `Record created. Deterioration risk ${assessment.deterioration_risk} from ${assessment.observations_used} observation(s)`
      + (news2.first !== null && news2.first !== undefined ? `, NEWS2 ${news2.first} → ${news2.latest}` : "")
      + `. ${assessment.explanation.one_line}`;
  } catch (error) {
    result.classList.add("failed");
    result.textContent = error.message;
  } finally {
    checkReady();
  }
});

async function send(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail));
  return payload;
}

checkConnection();
