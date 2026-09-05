/** Domain display pieces and the clinical formatting rules.
 *
 * Two rules live here rather than in each page, because they are the ones that matter if they slip:
 * deterioration risk and prediction reliability are drawn with different marks and never merged into
 * one figure, and a status colour never appears without a word beside it.
 */
import type { ReactNode } from "react";
import { AlertTriangle, Check, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- thresholds, mirrored from backend/banding.py ---------- */

export const CONFIDENCE_THRESHOLD = 0.65;
export const HIGH_CONFIDENCE_THRESHOLD = 0.8;
/** Above this risk the engine moves from "when available" to "immediate clinician assessment". */
export const ACTION_THRESHOLD = 0.65;

export type ReliabilityBand = "HIGH" | "MODERATE" | "LOW";

export function reliabilityBand(reliability: number): ReliabilityBand {
  if (reliability >= HIGH_CONFIDENCE_THRESHOLD) return "HIGH";
  return reliability >= CONFIDENCE_THRESHOLD ? "MODERATE" : "LOW";
}

export const BAND_COLOR = ["var(--band-1)", "var(--band-1)", "var(--band-2)", "var(--band-3)", "var(--band-4)", "var(--band-5)"];

/* ---------- formatting ---------- */

export const percent = (value: number) => `${Math.round(value * 100)}%`;

export function minutesLabel(minutes: number): string {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} min`;
  return `${Math.floor(whole / 60)}h ${String(whole % 60).padStart(2, "0")}m`;
}

/** Absolute local time with its zone. Relative time is only ever the secondary label. */
export function clockTime(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

export function dateTime(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const titleCase = (value: string) =>
  value.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\w/g, (match) => match.toUpperCase());

/* ---------- marks ---------- */

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("label-caps", className)}>{children}</p>;
}

export function BandChip({ band, className }: { band: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-white", className)}
      style={{ background: BAND_COLOR[band] ?? "var(--band-3)" }}
    >
      Band {band}
    </span>
  );
}

const RELIABILITY_TONE: Record<ReliabilityBand, { wash: string; ink: string; Icon: typeof Check }> = {
  HIGH: { wash: "var(--ok-wash)", ink: "var(--ok-ink)", Icon: Check },
  MODERATE: { wash: "var(--warn-wash)", ink: "var(--warn-ink)", Icon: TriangleAlert },
  LOW: { wash: "var(--crit-wash)", ink: "var(--crit-ink)", Icon: AlertTriangle },
};

/** The word carries the meaning; the colour and icon only reinforce it. */
export function ReliabilityTag({ reliability, compact = false }: { reliability: number; compact?: boolean }) {
  const band = reliabilityBand(reliability);
  const tone = RELIABILITY_TONE[band];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tnum"
      style={{ background: tone.wash, color: tone.ink }}
    >
      <tone.Icon size={12} strokeWidth={2.5} aria-hidden />
      {compact ? band : `Reliability ${band}`} · {percent(reliability)}
    </span>
  );
}

/**
 * Deterioration risk as a filled track with the action threshold marked on it.
 *
 * A bare percentage makes 62% and 68% look alike; the marked threshold is what actually separates
 * "assess when available" from "assess now", so the chart draws it rather than leaving it implied.
 */
export function RiskTrack({ risk, height = 8, showThreshold = true }: { risk: number; height?: number; showThreshold?: boolean }) {
  const over = risk >= ACTION_THRESHOLD;
  return (
    <div className="relative w-full" style={{ height }} role="img" aria-label={`Deterioration risk ${percent(risk)}`}>
      <div className="absolute inset-0 rounded-full" style={{ background: "var(--series-soft)" }} />
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
        style={{ width: `${Math.max(2, risk * 100)}%`, background: over ? "var(--crit)" : "var(--series)" }}
      />
      {showThreshold ? (
        <div
          className="absolute -top-0.5 -bottom-0.5 w-px"
          style={{ left: `${ACTION_THRESHOLD * 100}%`, background: "var(--ink-3)" }}
          title={`Immediate-assessment threshold ${percent(ACTION_THRESHOLD)}`}
        />
      ) : null}
    </div>
  );
}

/** Reliability gets a different mark from risk — dashes, not a bar — so the two never read alike. */
export function ReliabilityTrack({ reliability }: { reliability: number }) {
  const segments = 10;
  const filled = Math.round(reliability * segments);
  const band = reliabilityBand(reliability);
  const color = band === "HIGH" ? "var(--ok)" : band === "MODERATE" ? "var(--warn)" : "var(--crit)";
  return (
    <div className="flex items-center gap-[3px]" role="img" aria-label={`Prediction reliability ${percent(reliability)}, ${band}`}>
      {Array.from({ length: segments }, (_, index) => (
        <span
          key={index}
          className="h-2 flex-1 rounded-[2px]"
          style={{ background: index < filled ? color : "var(--paper-2)" }}
        />
      ))}
    </div>
  );
}

export function StatTile({
  label, value, unit, foot, tone = "muted", children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  foot?: ReactNode;
  tone?: "muted" | "ok" | "warn" | "crit";
  children?: ReactNode;
}) {
  const footColor =
    tone === "ok" ? "var(--ok-ink)" : tone === "warn" ? "var(--warn-ink)" : tone === "crit" ? "var(--crit-ink)" : "var(--ink-3)";
  return (
    <div className="paper-card p-5">
      <SectionLabel>{label}</SectionLabel>
      <p className="mt-2.5 flex items-baseline gap-1 text-[2rem] leading-none font-semibold tracking-tight tnum">
        {value}
        {unit ? <span className="text-base font-medium text-ink-3">{unit}</span> : null}
      </p>
      {children ? <div className="mt-3">{children}</div> : null}
      {foot ? (
        <p className="mt-2.5 text-[12.5px] leading-snug" style={{ color: footColor }}>
          {foot}
        </p>
      ) : null}
    </div>
  );
}

const NOTICE_TONE = {
  info: { wash: "var(--accent-wash)", ink: "var(--accent-ink)", Icon: Info },
  ok: { wash: "var(--ok-wash)", ink: "var(--ok-ink)", Icon: Check },
  warn: { wash: "var(--warn-wash)", ink: "var(--warn-ink)", Icon: TriangleAlert },
  crit: { wash: "var(--crit-wash)", ink: "var(--crit-ink)", Icon: AlertTriangle },
};

export function Notice({
  tone, title, children, className,
}: { tone: keyof typeof NOTICE_TONE; title: string; children?: ReactNode; className?: string }) {
  const style = NOTICE_TONE[tone];
  return (
    <div
      className={cn("flex gap-3 rounded-[--radius-lg] px-4 py-3.5 text-[13.5px] leading-relaxed", className)}
      style={{ background: style.wash, color: style.ink }}
      role={tone === "info" ? undefined : "status"}
    >
      <style.Icon size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <strong className="block font-semibold">{title}</strong>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="grid place-items-center gap-1.5 rounded-[--radius-lg] border border-dashed px-6 py-14 text-center"
      style={{ borderColor: "var(--rule-strong)" }}>
      <strong className="text-[15px] font-semibold">{title}</strong>
      <span className="max-w-[44ch] text-[13px] text-ink-3">{hint}</span>
    </div>
  );
}

/** A ratio against a limit — the meter form, not a two-slice pie. */
export function CapacityMeter({ label, used, total, note }: { label: string; used: number; total: number; note?: string }) {
  const share = total > 0 ? Math.min(1, used / total) : 0;
  const color = share >= 1 ? "var(--crit)" : share >= 0.85 ? "var(--warn)" : "var(--series)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        <span className="text-[13px] font-semibold tnum">{total - used} free</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full" style={{ background: "var(--paper-2)" }}
        role="img" aria-label={`${label}: ${used} of ${total} occupied`}>
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11.5px] text-ink-3 tnum">
        <span>{used} occupied</span>
        <span>{note ?? `${total} total`}</span>
      </div>
    </div>
  );
}
