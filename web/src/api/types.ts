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
  active_events: {
    type: string;
    severity?: string;
    casualties?: number;
    staff_unavailable_pct?: number;
    start?: string;
    expected_end?: string;
    reachability?: Record<string, Record<string, number>>;
  }[];
  hospitals: HospitalCapacity[];
  infeasibilities: { request: string; status: string; reason: string; alternative: string }[];
};

/** A staffing action the charge nurse may confirm. Counts of a role in a unit, never a person. */
export type StaffingAction = {
  action_id: string;
  type: "WITHIN_HOSPITAL_REDEPLOYMENT" | "CROSS_HOSPITAL_REASSIGNMENT" | "PATIENT_REDIRECTION";
  role?: string;
  count?: number;
  patient_count?: number;
  hospital_id?: string;
  from_hospital?: string;
  to_hospital?: string;
  from_area?: string;
  to_area?: string;
  corridor_required: boolean;
  corridor_open?: boolean;
  corridor_note?: string;
  reason: string;
  cost?: string;
  basis?: string;
  eligibility?: string;
  closes_shortfall_by: Record<string, number>;
  verb: string;
  requires_confirmation_by: string;
};

/** A reassignment tonight makes impossible: what, why, and what replaces it. */
export type StaffingInfeasibility = {
  action_id: string;
  request: string;
  status: string;
  constraint_type: string;
  role: string;
  count: number;
  from_hospital: string;
  to_hospital: string;
  reason: string;
  expires_at: string;
  alternative: { action_id: string | null; summary: string; closes_shortfall_by: Record<string, number> };
};

export type StaffingHospital = {
  hospital_id: string;
  staff: Record<string, {
    scheduled: number; available: number; gap: number;
    cannot_reach_site: number; local_unavailable_pct: number; optimiser_input: string;
  }>;
  demand: {
    required_nurses: number; required_doctors: number;
    ed_occupied: number; icu_occupied: number;
    waiting_by_band: Record<string, number>;
    derivation: string[]; parameter_source: string;
  };
  shortfall: { nurses: number; doctors: number; basis: string; remaining_after_plan: Record<string, number> };
  movable_surplus: { nurses: number; doctors: number; reserve_held_back: number };
};

export type StaffingPlan = {
  generated_at: string;
  scenario_time: string;
  policy_version: string;
  authority: {
    verb: string; executes: boolean; statement: string;
    unit_of_recommendation: string; counts_are_role_totals_not_individuals: boolean; not_used_for: string[];
  };
  strike_context: {
    event_type: string;
    window: { start: string; end: string; timezone: string };
    in_window_at_scenario_time: boolean;
    staff_unavailable_pct: number;
    effective_availability_pct: number;
    source: string;
    applies_to: string;
    does_not_apply_to: string;
    reachability: Record<string, Record<string, number>>;
    closed_corridors: { origin: string; destination: string; reachable: number }[];
  };
  pressure: {
    chronic_baseline: { label: string; pct: number; scope: string; used_in_allocation: boolean };
    tonight_additional: { label: string; pct: number; scope: string; used_in_allocation: boolean };
    compounded: {
      method: string; derivation: string[];
      effective_cover_pct: number; combined_gap_pct: number; naive_sum_not_used: number;
    };
    allocation_input: string;
  };
  hospitals: StaffingHospital[];
  plan: {
    candidates_considered: number;
    feasible_actions: StaffingAction[];
    infeasible_actions: StaffingInfeasibility[];
    residual: { shortfall: Record<string, number>; statement: string; escalate_to: string };
  };
  limits: string[];
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

export type Role = "DOCTOR" | "NURSE";

export type AuthUser = {
  user_id: string;
  email: string;
  name: string;
  role: Role;
  title: string;
  created_at: string;
};

export type Session = { token: string; expires_at: string; user: AuthUser };

/** Seeded sign-ins the login screen offers. Only ever populated for a synthetic demonstration. */
export type DemoAccount = { email: string; password: string; name: string; role: Role; title: string };

export type OverrideReason =
  | "NEW_CLINICAL_INFORMATION"
  | "BEDSIDE_ASSESSMENT_DIFFERS"
  | "RESOURCE_CONSTRAINT"
  | "DETERIORATION_OBSERVED"
  | "OTHER";
