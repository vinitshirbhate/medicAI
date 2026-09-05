/** Wire shapes returned by the Sundara Command backend.
 *
 * These mirror `backend/main.py` exactly. Risk and reliability are separate fields here for the
 * same reason they are separate there: the interface must never combine them into one number.
 */

export type Measurement = { value: number | null; missing: boolean };

export type Observation = {
  observed_at: string;
  source: "MONITOR" | "MANUAL" | "SIMULATED_EHR" | "NURSE_REPORTED_PRIOR";
  observed_at_estimated?: boolean;
  heart_rate: Measurement;
  systolic_bp: Measurement;
  diastolic_bp: Measurement;
  spo2: Measurement;
  respiratory_rate: Measurement;
  temperature_c: Measurement;
  gcs: Measurement;
};

export type Pathway = "DENGUE" | "BURN_SMOKE" | "TRAUMA" | "GENERAL";
export type ArrivalMode = "AMBULANCE" | "WALK_IN" | "TRANSFER" | "UNKNOWN";
export type Sex = "F" | "M" | "OTHER" | "UNKNOWN";

export type Patient = {
  patient_id: string;
  hospital_id: string;
  age: number;
  sex: Sex;
  arrival_time: string;
  arrival_mode: ArrivalMode;
  is_new_patient: boolean;
  chief_complaint: string;
  pathway: Pathway;
  protocol_band: number;
  symptoms: Record<string, boolean | null>;
  known_conditions: Record<string, string>;
  pathway_detail: Record<string, unknown>;
  notes: string;
};

export type PatientDetail = Patient & { observations: Observation[] };
export type PatientSummary = Patient & { observations: number; latest_observation: Observation | null };

export type Contribution = { feature: string; clinical_label: string; contribution: number };

export type Assessment = {
  patient_id: string;
  assessed_at: string;
  initiated_by: "AI";
  model_version: string;
  protocol_band: number;
  deterioration_risk: number;
  prediction_reliability: number;
  data_completeness: number;
  completeness_breakdown: Record<string, number>;
  time_sensitivity: "HIGH" | "MODERATE";
  forecast: { horizon_hours: number; trajectory: string[]; probability: number };
  explanation: { one_line: string; contributions: Contribution[] };
  observations_used: number;
  news2: { first: number | null; latest: number | null; rise_points: number };
  uncertainty: { is_low_confidence: boolean; reasons: string[]; ood_flag: boolean; ensemble_spread: number };
  proposed_escalation: { to_band: number; status: string; evidence: string[] } | null;
  recommended_action: { primary: string; preparation: string[]; verb: string };
  prefilled_override: { reason_code: string; reason_text: string; reassessment_minutes: number } | null;
  resource_recommendation: {
    preferred: string;
    constraint: string | null;
    alternative: string | null;
    network_option?: string;
    transport_feasible?: boolean;
  };
};

export type QueueItem = Assessment & {
  patient: Pick<Patient, "patient_id" | "hospital_id" | "age" | "sex" | "pathway" | "chief_complaint" | "arrival_time">;
  minutes_waiting: number;
  global_rank: number;
  rank_within_band: number;
};

export type QueueResponse = { updated_at: string; ranking_policy: string; patients: QueueItem[] };

export type HospitalCapacity = {
  hospital_id: string;
  icu: { total: number; occupied: number; available: number };
  ed: { total: number; occupied: number; available: number };
  staff: {
    doctors: { scheduled: number; available: number };
    nurses: { scheduled: number; available: number };
  };
};

export type ResourceState = {
  network_icu_occupancy_pct: number;
  active_events: { type: string; severity?: string; casualties?: number; staff_unavailable_pct?: number }[];
  hospitals: HospitalCapacity[];
  infeasibilities: { request: string; status: string; reason: string; alternative: string }[];
};

export type AuditEntry = {
  seq: number;
  hash: string;
  timestamp: string;
  event_type: string;
  initiated_by: "AI" | "HUMAN";
  actor: string;
  patient_id: string | null;
  model_version: string;
  payload: Record<string, unknown>;
  prev_hash: string;
};

export type AuditVerification = { valid: boolean; head_hash?: string; failed_at?: string | null };

export type SystemStatus = {
  api: { status: string; model_version: string; mode: string };
  mongodb: { connected: boolean; reason: string; database: string; uri_configured: boolean; retry_in_seconds: number };
  local_store: Record<string, number>;
};

export type OverrideReason =
  | "NEW_CLINICAL_INFORMATION"
  | "BEDSIDE_ASSESSMENT_DIFFERS"
  | "RESOURCE_CONSTRAINT"
  | "DETERIORATION_OBSERVED"
  | "OTHER";
