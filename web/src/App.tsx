/** The console shell: a quiet rail, a document-like header, and the routed page.
 *
 * The layout is a sheet of paper rather than a control panel — one hairline rail, no boxes inside
 * boxes, and hierarchy carried by type. A clinician reading this under pressure should be able to
 * find the next patient without decoding chrome.
 */
import { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, BedDouble, LayoutDashboard, LogOut, RefreshCw, ScrollText,
  Search, Settings as SettingsIcon, ShieldCheck, UserCog, Users,
} from "lucide-react";
import type { Role } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LoginPage } from "./pages/LoginPage";
import { TeamPage } from "./pages/TeamPage";
import { useQueue } from "./hooks/useQueue";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { AuditPage } from "./pages/AuditPage";
import { BedsPage } from "./pages/BedsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { PatientsPage } from "./pages/PatientsPage";
import { SettingsPage } from "./pages/SettingsPage";

/** An omitted `roles` means every signed-in user. The server enforces the same gates regardless:
 *  hiding a link is presentation, not access control. */
const NAV: { to: string; label: string; icon: typeof Users; roles?: Role[] }[] = [
  { to: "/", label: "Triage queue", icon: LayoutDashboard },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/beds", label: "Beds & network", icon: BedDouble },
  { to: "/analytics", label: "Analytics", icon: Activity },
  { to: "/audit", label: "Audit log", icon: ScrollText },
  { to: "/team", label: "Team & roles", icon: UserCog, roles: ["DOCTOR"] },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: ["DOCTOR"] },
];

const PAGES: Record<string, { eyebrow: string; title: string; lede: string }> = {
  "/": {
    eyebrow: "Emergency department",
    title: "Triage queue",
    lede: "Ranked by protocol band, then deterioration risk, time sensitivity and waiting-time equity.",
  },
  "/patients": {
    eyebrow: "Record store",
    title: "Registered patients",
    lede: "Demographics, pathway detail and the latest observation for everyone on record.",
  },
  "/beds": {
    eyebrow: "Capacity",
    title: "Beds & network",
    lede: "Where a patient can actually go, and which requests the network cannot satisfy.",
  },
  "/analytics": {
    eyebrow: "Queue analytics",
    title: "Risk, reliability & wait",
    lede: "Computed from the same live queue the clinicians are reading, so the numbers cannot disagree.",
  },
  "/audit": {
    eyebrow: "Governance",
    title: "Decision audit log",
    lede: "Every assessment and every human decision, hash-chained in the order they happened.",
  },
  "/team": {
    eyebrow: "Administration",
    title: "Team & roles",
    lede: "Who can sign in, and what each role may do. Creating or removing an account is audited.",
  },
  "/settings": {
    eyebrow: "Configuration",
    title: "Console settings",
    lede: "Backend address, record-store health, and the presenter-only demonstration reset.",
  },
};

function initials(name: string): string {
  return name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(-2).map((part) => part[0]).join("");
}

export default function App() {
  const { user, ready, signOut, can } = useAuth();
  const queue = useQueue(Boolean(user));
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const page = PAGES[location.pathname] ?? PAGES["/"];
  const urgent = useMemo(() => queue.patients.filter((item) => item.protocol_band <= 2).length, [queue.patients]);

  // A search hit anywhere in the console opens that patient back on the queue page.
  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (term.length < 3) return;
    const hit = queue.patients.find(
      (item) => item.patient_id.toLowerCase().includes(term) || item.patient.chief_complaint.toLowerCase().includes(term),
    );
    if (hit && location.pathname !== "/") navigate(`/?patient=${encodeURIComponent(hit.patient_id)}`);
  }, [search, queue.patients, location.pathname, navigate]);

  // Nothing renders until the stored token has been checked against the server, so the console
  // never flashes a queue at someone whose session has already expired.
  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-[13px] text-ink-3">Checking your session…</div>;
  }
  if (!user) return <LoginPage />;

  const actor = user.name;
  const visibleNav = NAV.filter((entry) => !entry.roles || can(...entry.roles));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-8 border-b px-6 py-7 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5"
        style={{ borderColor: "var(--rule)" }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-[7px] text-white" style={{ background: "var(--accent)" }}>
              <ShieldCheck size={14} strokeWidth={2.5} />
            </span>
            <span className="text-[13px] font-semibold tracking-tight">Sundara Command</span>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
            Clinical decision support for emergency departments under load.
          </p>
        </div>

        <nav className="flex flex-col gap-0.5">
          {visibleNav.map((entry) => (
            <NavLink key={entry.to} to={entry.to} end={entry.to === "/"}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                  isActive ? "bg-[--accent-wash] text-[--accent-ink]" : "text-ink-2 hover:bg-[--surface-sunken] hover:text-ink",
                )
              }>
              {({ isActive }) => (
                <>
                  <entry.icon size={16} strokeWidth={2} className={isActive ? "text-[--accent]" : "text-ink-3"} />
                  {entry.label}
                  {entry.to === "/" && urgent > 0 ? (
                    <span className="ml-auto rounded-full px-1.5 py-0.5 text-[11px] font-semibold tnum"
                      style={{ background: "var(--crit-wash)", color: "var(--crit-ink)" }}>
                      {urgent}
                    </span>
                  ) : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          <div className="rounded-[--radius-lg] p-3.5" style={{ background: "var(--surface-sunken)" }}>
            <p className="text-[12px] font-semibold">Advisory only</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
              Every recommendation is subject to clinician approval. Risk and reliability are reported
              separately and never combined. Synthetic data; not a medical device.
            </p>
          </div>
          <p className="flex items-center gap-2 px-1 text-[11.5px] text-ink-3">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: queue.live ? "var(--ok)" : "var(--warn)" }} />
            {queue.live ? "Queue streaming live" : "Live updates paused — polling"}
          </p>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-30 border-b px-6 py-4 backdrop-blur-md lg:px-10"
          style={{ borderColor: "var(--rule)", background: "color-mix(in srgb, var(--paper) 88%, transparent)" }}>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by patient ID or complaint"
                className="h-9 max-w-sm rounded-full border-transparent bg-[--surface] pl-9 text-[13.5px] shadow-none" />
            </div>
            <button onClick={() => void queue.refresh()}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-[--surface-sunken]">
              <RefreshCw size={13} strokeWidth={2.2} /> Refresh
            </button>
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-ink-2"
              title={queue.live ? "Connected to the queue socket" : "Socket unavailable; last known queue is shown"}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: queue.live ? "var(--ok)" : "var(--warn)" }} />
              {queue.live ? "Live" : "Paused"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="focus-ring inline-flex items-center gap-2 rounded-full py-1.5 pr-1 pl-3 text-[12.5px] font-medium transition-colors hover:bg-[--surface-sunken]">
                {user.name}
                <span className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold"
                  style={{ background: "var(--accent-wash)", color: "var(--accent-ink)" }}>
                  {initials(user.name)}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <div className="text-[13px] font-semibold">{user.name}</div>
                  <div className="mt-0.5 font-mono text-[11.5px] text-ink-3">{user.email}</div>
                  <div className="mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: "var(--accent-wash)", color: "var(--accent-ink)" }}>
                    {user.role === "DOCTOR" ? "Doctor · full access" : "Nurse · clinical access"}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
                    {user.role === "DOCTOR"
                      ? "You can manage accounts and reset the demonstration data."
                      : "Account management and the demonstration reset need the doctor role."}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="px-6 pt-9 pb-16 lg:px-10">
          <div className="mb-8 max-w-3xl">
            <p className="label-caps" style={{ color: "var(--accent)" }}>{page.eyebrow}</p>
            <h1 className="mt-2 text-[2.1rem] leading-[1.1] font-semibold tracking-[-0.03em]">{page.title}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{page.lede}</p>
          </div>

          <Routes>
            <Route path="/" element={<DashboardPage queue={queue} actor={actor} />} />
            <Route path="/patients" element={<PatientsPage queue={queue} />} />
            <Route path="/beds" element={<BedsPage queue={queue} />} />
            <Route path="/analytics" element={<AnalyticsPage queue={queue} />} />
            <Route path="/audit" element={<AuditPage />} />
            {/* Role-gated routes are absent, not merely hidden: a typed URL must not render a page
                whose every request the server would refuse. */}
            {can("DOCTOR") ? <Route path="/team" element={<TeamPage />} /> : null}
            {can("DOCTOR") ? <Route path="/settings" element={<SettingsPage onReset={() => void queue.refresh()} />} /> : null}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
