/** The single place that knows the backend's address and error conventions. */
import type {
  Assessment, AuditEntry, AuditVerification, Observation, PatientDetail, PatientSummary,
  QueueResponse, ResourceState, StaffingPlan, SystemStatus,
} from "./types";

const FALLBACK_BASE = "http://127.0.0.1:8000";
const OVERRIDE_KEY = "sundara.api_base_url";

/** Settings can point the console at another backend without a rebuild. */
export function apiBaseUrl(): string {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(OVERRIDE_KEY) : null;
  return (stored || import.meta.env.VITE_API_BASE_URL || FALLBACK_BASE).replace(/\/$/, "");
}

export function setApiBaseUrl(value: string): void {
  if (value.trim()) localStorage.setItem(OVERRIDE_KEY, value.trim().replace(/\/$/, ""));
  else localStorage.removeItem(OVERRIDE_KEY);
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    // A dead backend is an operational state, not a stack trace for the clinician.
    throw new ApiError(`Cannot reach the triage service at ${apiBaseUrl()}`, 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(readDetail(body) ?? `${response.status} ${response.statusText}`, response.status, body);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** FastAPI returns a string detail for HTTPException and a list of objects for validation errors. */
function readDetail(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item?.loc) ? item.loc.slice(1).join(".") : "";
        return field ? `${field}: ${item.msg}` : String(item?.msg ?? item);
      })
      .join("; ");
  }
  return null;
}

export const api = {
  health: () => request<{ status: string; record_store: string; mongodb: { connected: boolean } }>("/health"),
  // `refresh` bypasses the backend's record-store reconnect backoff; use it only for an explicit check.
  systemStatus: (refresh = false) => request<SystemStatus>(`/api/v1/system/status${refresh ? "?refresh=true" : ""}`),
  queue: () => request<QueueResponse>("/api/v1/queue"),
  patients: () => request<{ count: number; source: string; patients: PatientSummary[] }>("/api/v1/patients"),
  patient: (id: string) => request<PatientDetail>(`/api/v1/patients/${encodeURIComponent(id)}`),
  assessment: (id: string) => request<Assessment>(`/api/v1/patients/${encodeURIComponent(id)}/assessment`),
  createPatient: (body: unknown) => request<Assessment>("/api/v1/patients", { method: "POST", body: JSON.stringify(body) }),
  addVitals: (id: string, body: Partial<Observation>) =>
    request<Assessment>(`/api/v1/patients/${encodeURIComponent(id)}/vitals`, { method: "POST", body: JSON.stringify(body) }),
  accept: (id: string, actor: string) =>
    request<{ status: string; message: string }>(`/api/v1/patients/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      body: JSON.stringify({ actor }),
    }),
  override: (id: string, body: { actor: string; reason_code: string; reason_text: string; new_rank?: number | null }) =>
    request<{ status: string; message: string; reassessment_due: string }>(
      `/api/v1/patients/${encodeURIComponent(id)}/override`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  resources: () => request<ResourceState>("/api/v1/resources"),
  // `at` evaluates the plan at another instant: after 06:00 the struck corridor reopens.
  staffingPlan: (at?: string) =>
    request<StaffingPlan>(`/api/v1/resources/staffing-plan${at ? `?at=${encodeURIComponent(at)}` : ""}`),
  audit: () => request<AuditEntry[]>("/api/v1/audit"),
  verifyAudit: () => request<AuditVerification>("/api/v1/audit/verify"),
  resetDemo: () => request<{ status: string; patients: number }>("/api/v1/demo/reset", { method: "POST" }),
};

/** The queue socket lives beside the REST base, with the matching ws/wss scheme. */
export function queueSocketUrl(): string {
  const base = apiBaseUrl();
  return `${base.replace(/^http/, "ws")}/ws/queue`;
}
