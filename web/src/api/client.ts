/** The single place that knows the backend's address and error conventions. */
import type {
  Assessment, AuditEntry, AuditVerification, AuthUser, DemoAccount, Observation, PatientDetail,
  PatientSummary, QueueResponse, ResourceState, Session, SystemStatus,
} from "./types";

const FALLBACK_BASE = "http://127.0.0.1:8000";
const OVERRIDE_KEY = "sundara.api_base_url";
const TOKEN_KEY = "sundara.token";

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // A browser with site data blocked simply has no session.
  }
}

export function storeToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* session lasts this tab only */ }
}

export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* nothing to clear */ }
}

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
  const token = readToken();
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    // A dead backend is an operational state, not a stack trace for the clinician.
    throw new ApiError(`Cannot reach the triage service at ${apiBaseUrl()}`, 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // An expired or revoked token must not leave the console half-signed-in.
    if (response.status === 401 && path !== "/api/v1/auth/login") clearToken();
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
  login: (email: string, password: string) =>
    request<Session>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<AuthUser>("/api/v1/auth/me"),
  demoAccounts: () => request<{ enabled: boolean; accounts: DemoAccount[] }>("/api/v1/auth/demo-accounts"),
  users: () => request<{ users: AuthUser[] }>("/api/v1/users"),
  createUser: (body: { email: string; name: string; password: string; role: string; title: string }) =>
    request<AuthUser>("/api/v1/users", { method: "POST", body: JSON.stringify(body) }),
  deleteUser: (userId: string) =>
    request<AuthUser>(`/api/v1/users/${encodeURIComponent(userId)}`, { method: "DELETE" }),
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
  accept: (id: string) =>
    request<{ status: string; message: string }>(`/api/v1/patients/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  override: (id: string, body: { reason_code: string; reason_text: string; new_rank?: number | null }) =>
    request<{ status: string; message: string; reassessment_due: string }>(
      `/api/v1/patients/${encodeURIComponent(id)}/override`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  resources: () => request<ResourceState>("/api/v1/resources"),
  audit: () => request<AuditEntry[]>("/api/v1/audit"),
  verifyAudit: () => request<AuditVerification>("/api/v1/audit/verify"),
  resetDemo: () => request<{ status: string; patients: number }>("/api/v1/demo/reset", { method: "POST" }),
};

/** The queue socket lives beside the REST base, with the matching ws/wss scheme. */
/** The socket authenticates too; a browser cannot set headers on it, so the token is a parameter. */
export function queueSocketUrl(): string {
  const base = apiBaseUrl().replace(/^http/, "ws");
  const token = readToken();
  return `${base}/ws/queue${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}
