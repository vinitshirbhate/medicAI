/** The observation series for one patient, as small multiples.
 *
 * Heart rate, oxygen saturation, respiratory rate and temperature share no scale, so each gets a
 * panel and an axis of its own. One plot would need two y-scales, which makes up a relationship the
 * vitals do not have.
 *
 * Each panel shades the range that scores zero on NEWS2 — the same bands `main.py` scores against,
 * so the picture and the engine cannot drift apart. A reading outside the shading is visibly outside
 * it, which is the whole job of the panel; nothing here invents a threshold of its own.
 *
 * A single observation draws no line. "Latest observation only" is the honest statement, and the
 * panel makes it rather than joining a point to itself.
 */
import type { Observation } from "@/api/types";
import { clockTime } from "../clinical";
import { ChartEmpty, Tip, TipRow, TipTitle, linePath, useTip } from "./primitives";

type MetricKey = "heart_rate" | "spo2" | "respiratory_rate" | "temperature_c";

/** `normal` is the NEWS2 zero-score band; `bounds` only frames the panel when values sit inside it. */
const METRICS: {
  key: MetricKey; label: string; unit: string; decimals: number;
  normal: [number, number]; bounds: [number, number];
}[] = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm", decimals: 0, normal: [51, 90], bounds: [40, 150] },
  { key: "spo2", label: "Oxygen saturation", unit: "%", decimals: 0, normal: [96, 100], bounds: [84, 100] },
  { key: "respiratory_rate", label: "Respiratory rate", unit: "/min", decimals: 0, normal: [12, 20], bounds: [8, 36] },
  { key: "temperature_c", label: "Temperature", unit: "°C", decimals: 1, normal: [36.1, 38.0], bounds: [35, 40.5] },
];

export function VitalsTrend({ observations }: { observations: Observation[] }) {
  const { tip, show, hide } = useTip();
  if (!observations.length) return <ChartEmpty>No observations recorded for this patient.</ChartEmpty>;

  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {METRICS.map((metric) => {
          const points = observations
            .map((observation) => ({ at: observation.observed_at, value: observation[metric.key]?.value }))
            .filter((point): point is { at: string; value: number } => typeof point.value === "number");
          const latest = points[points.length - 1];
          const abnormal = latest && (latest.value < metric.normal[0] || latest.value > metric.normal[1]);
          return (
            <div key={metric.key} className="rounded-[--radius-lg] border p-3.5" style={{ borderColor: "var(--rule)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <h5 className="label-caps">{metric.label}</h5>
                <strong className="text-[19px] font-semibold tracking-tight tnum"
                  style={{ color: abnormal ? "var(--crit-ink)" : "var(--ink)" }}>
                  {latest ? latest.value.toFixed(metric.decimals) : "—"}
                  {latest ? <span className="ml-1 text-[11px] font-medium text-ink-3">{metric.unit}</span> : null}
                </strong>
              </div>
              <Panel points={points} metric={metric} show={show} hide={hide} />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">
        Shading marks the range that scores zero on NEWS2 — the same bands the triage engine scores against.
      </p>
      <Tip state={tip} />
    </>
  );
}

function Panel({
  points, metric, show, hide,
}: {
  points: { at: string; value: number }[];
  metric: (typeof METRICS)[number];
  show: (event: { clientX: number; clientY: number }, content: React.ReactNode) => void;
  hide: () => void;
}) {
  const width = 220;
  const height = 58;
  const pad = 9;

  if (!points.length) return <p className="mt-3 text-[12px] text-ink-3">Not yet measured.</p>;

  const values = points.map((point) => point.value);
  // Frame the panel so the reference band is always visible, then widen for anything outside it.
  const low = Math.min(metric.bounds[0], metric.normal[0], ...values);
  const high = Math.max(metric.bounds[1], metric.normal[1], ...values);
  const span = high - low || 1;
  const y = (value: number) => pad + (1 - (value - low) / span) * (height - pad * 2);
  const x = (index: number) => (points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2));
  const coords = points.map((point, index) => ({ x: x(index), y: y(point.value), ...point }));
  const bandTop = y(Math.min(metric.normal[1], high));
  const bandBottom = y(Math.max(metric.normal[0], low));

  return (
    <>
      <svg className="chart-svg mt-2.5" viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`${metric.label}: ${points.map((point) => point.value.toFixed(metric.decimals)).join(", ")} ${metric.unit}. Typical range ${metric.normal[0]} to ${metric.normal[1]}.`}>
        <rect x={0} y={bandTop} width={width} height={Math.max(1, bandBottom - bandTop)} fill="var(--ok)" opacity={0.09} />
        {points.length > 1 ? (
          <path d={linePath(coords)} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {coords.map((point, index) => {
          const outside = point.value < metric.normal[0] || point.value > metric.normal[1];
          const last = index === coords.length - 1;
          return (
            <g key={`${point.at}-${index}`}
              onMouseMove={(event) =>
                show(event, (
                  <>
                    <TipTitle>{metric.label}</TipTitle>
                    <TipRow>{point.value.toFixed(metric.decimals)} {metric.unit}{outside ? " — outside the zero-score band" : ""}</TipRow>
                    <TipRow>{clockTime(point.at)}</TipRow>
                  </>
                ))}
              onMouseLeave={hide}>
              <circle cx={point.x} cy={point.y} r={11} fill="transparent" />
              <circle cx={point.x} cy={point.y} r={last ? 4.5 : 3.5}
                fill={last && outside ? "var(--crit)" : "var(--series)"} stroke="var(--surface)" strokeWidth={2} />
            </g>
          );
        })}
      </svg>
      {points.length === 1 ? (
        <p className="mt-1 text-[11.5px] text-ink-3">Latest observation only — no trend yet.</p>
      ) : null}
    </>
  );
}
