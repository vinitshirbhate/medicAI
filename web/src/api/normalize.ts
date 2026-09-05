/** Make a stored assessment safe to render.
 *
 * Assessments are persisted as whole JSON documents, so a record written by an earlier engine build
 * is served back verbatim and can be missing fields this console knows about. That is normal for an
 * append-only store and must never white-screen a triage queue.
 *
 * Every default here is the honest absence of a value — an empty list, a null reading — never an
 * invented clinical number. A missing observation stays missing on screen.
 */
import type { QueueItem } from "./types";

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose => typeof value === "object" && value !== null && !Array.isArray(value);
const num = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const nullableNum = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const strList = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);

export function normalizeQueueItem(raw: unknown): QueueItem | null {
  if (!isObject(raw) || typeof raw.patient_id !== "string") return null;

  const uncertainty = isObject(raw.uncertainty) ? raw.uncertainty : {};
  const explanation = isObject(raw.explanation) ? raw.explanation : {};
  const action = isObject(raw.recommended_action) ? raw.recommended_action : {};
  const forecast = isObject(raw.forecast) ? raw.forecast : {};
  const news2 = isObject(raw.news2) ? raw.news2 : {};
  const resource = isObject(raw.resource_recommendation) ? raw.resource_recommendation : {};
  const patient = isObject(raw.patient) ? raw.patient : {};
  const escalation = isObject(raw.proposed_escalation) ? raw.proposed_escalation : null;
  const prefilled = isObject(raw.prefilled_override) ? raw.prefilled_override : null;

  const contributions = Array.isArray(explanation.contributions)
    ? explanation.contributions.filter(isObject).map((entry) => ({
        feature: str(entry.feature),
        clinical_label: str(entry.clinical_label),
        contribution: num(entry.contribution),
      }))
    : [];

  return {
    patient_id: raw.patient_id,
    assessed_at: str(raw.assessed_at),
    initiated_by: "AI",
    model_version: str(raw.model_version, "unknown"),
    protocol_band: num(raw.protocol_band, 5),
    deterioration_risk: num(raw.deterioration_risk),
    prediction_reliability: num(raw.prediction_reliability),
    data_completeness: num(raw.data_completeness),
    completeness_breakdown: isObject(raw.completeness_breakdown)
      ? Object.fromEntries(Object.entries(raw.completeness_breakdown).map(([key, value]) => [key, num(value)]))
      : {},
    time_sensitivity: raw.time_sensitivity === "HIGH" ? "HIGH" : "MODERATE",
    forecast: {
      horizon_hours: num(forecast.horizon_hours, 2),
      trajectory: strList(forecast.trajectory),
      probability: num(forecast.probability, num(raw.deterioration_risk)),
    },
    explanation: {
      one_line: str(explanation.one_line, "No explanation recorded with this assessment."),
      contributions,
    },
    observations_used: num(raw.observations_used),
    // An assessment written before the trajectory signal existed carries no aggregate score. Nulls
    // here make the panel say so rather than draw a comparison that was never computed.
    news2: {
      first: nullableNum(news2.first),
      latest: nullableNum(news2.latest),
      rise_points: num(news2.rise_points, 2),
    },
    uncertainty: {
      is_low_confidence: uncertainty.is_low_confidence === true,
      reasons: strList(uncertainty.reasons),
      ood_flag: uncertainty.ood_flag === true,
      ensemble_spread: num(uncertainty.ensemble_spread),
    },
    proposed_escalation: escalation
      ? { to_band: num(escalation.to_band), status: str(escalation.status), evidence: strList(escalation.evidence) }
      : null,
    recommended_action: {
      primary: str(action.primary, "Clinical assessment when available"),
      preparation: strList(action.preparation),
      verb: str(action.verb, "SUGGESTED"),
    },
    prefilled_override: prefilled
      ? {
          reason_code: str(prefilled.reason_code, "BEDSIDE_ASSESSMENT_DIFFERS"),
          reason_text: str(prefilled.reason_text),
          reassessment_minutes: num(prefilled.reassessment_minutes, 10),
        }
      : null,
    resource_recommendation: {
      preferred: str(resource.preferred, "Not recorded"),
      constraint: typeof resource.constraint === "string" ? resource.constraint : null,
      alternative: typeof resource.alternative === "string" ? resource.alternative : null,
      ...(typeof resource.network_option === "string" ? { network_option: resource.network_option } : {}),
      ...(typeof resource.transport_feasible === "boolean" ? { transport_feasible: resource.transport_feasible } : {}),
    },
    patient: {
      patient_id: str(patient.patient_id, raw.patient_id),
      hospital_id: str(patient.hospital_id, "UNKNOWN"),
      age: num(patient.age),
      sex: (["F", "M", "OTHER", "UNKNOWN"] as const).find((value) => value === patient.sex) ?? "UNKNOWN",
      pathway: (["DENGUE", "BURN_SMOKE", "TRAUMA", "GENERAL"] as const).find((value) => value === patient.pathway) ?? "GENERAL",
      chief_complaint: str(patient.chief_complaint),
      arrival_time: str(patient.arrival_time),
    },
    minutes_waiting: num(raw.minutes_waiting),
    global_rank: num(raw.global_rank, 0),
    rank_within_band: num(raw.rank_within_band, 0),
  };
}

export function normalizeQueue(raw: unknown): QueueItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeQueueItem).filter((item): item is QueueItem => item !== null);
}
