/** The per-patient charts: what was observed, and how the risk figure was built.
 *
 * The vitals panels shade the range that scores zero on NEWS2 — the same bands `main.py` scores
 * against — so the picture and the engine cannot drift apart. Nothing here invents a threshold.
 */
import {
  Area, AreaChart, Bar, BarChart, Cell, LabelList, PolarAngleAxis, RadialBar, RadialBarChart,
  ReferenceArea, ReferenceLine, XAxis, YAxis,
} from "recharts";
import type { Contribution, Observation } from "@/api/types";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { clockTime, percent } from "../clinical";
import { AXIS, VIZ } from "./theme";

const CONFIG = { value: { label: "Value", color: VIZ.series } } satisfies ChartConfig;

/** Recharts hands label formatters a loose renderable; read the number out rather than assume it. */
const pct = (value: unknown) => `${Math.round(Number(value))}%`;

function Card({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-[--radius-md] border bg-[--surface] px-3 py-2 text-[12.5px] shadow-lg tnum"
      style={{ borderColor: "var(--rule-strong)" }}>
      <div className="mb-0.5 font-semibold">{title}</div>
      {rows.map((row) => <div key={row} style={{ color: "var(--ink-2)" }}>{row}</div>)}
    </div>
  );
}

/* ------------------------------------------------------------------ vitals small multiples */

type MetricKey = "heart_rate" | "spo2" | "respiratory_rate" | "temperature_c";

/** `normal` is the NEWS2 zero-score band; `frame` keeps the band visible when readings sit inside it. */
const METRICS: {
  key: MetricKey; label: string; unit: string; decimals: number;
  normal: [number, number]; frame: [number, number];
}[] = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm", decimals: 0, normal: [51, 90], frame: [40, 150] },
  { key: "spo2", label: "Oxygen saturation", unit: "%", decimals: 0, normal: [96, 100], frame: [84, 100] },
  { key: "respiratory_rate", label: "Respiratory rate", unit: "/min", decimals: 0, normal: [12, 20], frame: [8, 36] },
  { key: "temperature_c", label: "Temperature", unit: "°C", decimals: 1, normal: [36.1, 38.0], frame: [35, 40.5] },
];

export function VitalsTrend({ observations }: { observations: Observation[] }) {
  if (!observations.length) {
    return (
      <div className="mt-4 grid min-h-[150px] place-items-center rounded-[--radius-lg] border border-dashed text-[13px] text-ink-3"
        style={{ borderColor: "var(--rule-strong)" }}>
        No observations recorded for this patient.
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {METRICS.map((metric) => {
          const points = observations
            .map((observation, index) => ({
              index,
              at: observation.observed_at,
              value: observation[metric.key]?.value,
            }))
            .filter((point): point is { index: number; at: string; value: number } => typeof point.value === "number");
          const latest = points[points.length - 1];
          const outside = latest && (latest.value < metric.normal[0] || latest.value > metric.normal[1]);

          const values = points.map((point) => point.value);
          const low = Math.min(metric.frame[0], ...values);
          const high = Math.max(metric.frame[1], ...values);

          return (
            <div key={metric.key} className="rounded-[--radius-lg] border p-3.5" style={{ borderColor: "var(--rule)" }}>
              <div className="flex items-baseline justify-between gap-2">
                <h5 className="label-caps">{metric.label}</h5>
                <strong className="text-[19px] font-semibold tracking-tight tnum"
                  style={{ color: outside ? "var(--crit-ink)" : "var(--ink)" }}>
                  {latest ? latest.value.toFixed(metric.decimals) : "—"}
                  {latest ? <span className="ml-1 text-[11px] font-medium text-ink-3">{metric.unit}</span> : null}
                </strong>
              </div>

              {points.length === 0 ? (
                <p className="mt-3 text-[12px] text-ink-3">Not yet measured.</p>
              ) : (
                <>
                  <ChartContainer config={CONFIG} className="mt-2.5 h-[86px] w-full">
                    <AreaChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                      <defs>
                        <linearGradient id={`fill-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={VIZ.series} stopOpacity={0.22} />
                          <stop offset="100%" stopColor={VIZ.series} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      {/* The zero-score band, so an out-of-range reading is visibly out of range. */}
                      <ReferenceArea y1={metric.normal[0]} y2={metric.normal[1]} fill={VIZ.ok} fillOpacity={0.1} stroke="none" />
                      <XAxis dataKey="index" hide />
                      <YAxis domain={[low, high]} width={34} tickCount={3} {...AXIS}
                        tick={{ fontSize: 10, fill: VIZ.ink3 }}
                        tickFormatter={(value: number) => value.toFixed(metric.decimals)} />
                      <ChartTooltip cursor={{ stroke: VIZ.axis, strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const point = payload[0].payload as { value: number; at: string };
                          const out = point.value < metric.normal[0] || point.value > metric.normal[1];
                          return (
                            <Card title={metric.label} rows={[
                              `${point.value.toFixed(metric.decimals)} ${metric.unit}${out ? " — outside the zero-score band" : ""}`,
                              clockTime(point.at),
                            ]} />
                          );
                        }} />
                      <Area type="monotone" dataKey="value" stroke={VIZ.series} strokeWidth={2}
                        fill={`url(#fill-${metric.key})`} isAnimationActive={false}
                        dot={{ r: 3, fill: VIZ.series, stroke: VIZ.surface, strokeWidth: 1.5 }}
                        activeDot={{ r: 5 }} />
                      <ReferenceLine y={latest.value} stroke={outside ? VIZ.crit : "transparent"}
                        strokeDasharray="2 3" strokeWidth={1} />
                    </AreaChart>
                  </ChartContainer>
                  {points.length === 1 ? (
                    <p className="mt-0.5 text-[11.5px] text-ink-3">Latest observation only — no trend yet.</p>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">
        Shading marks the range that scores zero on NEWS2 — the same bands the triage engine scores against.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ risk composition */

/**
 * How the risk figure was built, as a waterfall.
 *
 * The engine starts every patient at a baseline and adds a named clinical observation for each
 * feature it found. Drawing that as a running total shows which single finding moved the number,
 * which is the question a clinician actually asks of an explanation.
 */
export function RiskComposition({
  contributions, total, baseline = 0.12,
}: { contributions: Contribution[]; total: number; baseline?: number }) {
  if (!contributions.length) {
    return (
      <div className="mt-4 rounded-[--radius-lg] border border-dashed px-5 py-8 text-center text-[13px] text-ink-3"
        style={{ borderColor: "var(--rule-strong)" }}>
        No individual finding raised this patient's risk above the baseline.
      </div>
    );
  }

  let running = baseline;
  const rows = [
    { name: "Baseline", offset: 0, value: baseline * 100, detail: "Every patient starts here", isTotal: false },
    ...contributions.map((contribution) => {
      const from = running;
      running = Math.min(0.98, running + contribution.contribution);
      return {
        name: contribution.clinical_label,
        offset: from * 100,
        value: (running - from) * 100,
        detail: contribution.feature,
        isTotal: false,
      };
    }),
    { name: "Assessed risk", offset: 0, value: total * 100, detail: "Capped at 98%", isTotal: true },
  ];

  return (
    <>
      <ChartContainer config={CONFIG} className="mt-4 w-full" style={{ height: rows.length * 38 + 30 }}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 46, bottom: 4, left: 4 }} barSize={16}>
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" {...AXIS} />
          <YAxis type="category" dataKey="name" width={168} {...AXIS}
            tick={{ fontSize: 11, fill: VIZ.ink2 }} interval={0} />
          <ChartTooltip cursor={{ fill: "rgba(85,70,232,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[payload.length - 1].payload as (typeof rows)[number];
              return (
                <Card title={row.name} rows={[
                  row.isTotal ? `Total ${Math.round(row.value)}%` : `Adds ${row.value.toFixed(0)} points`,
                  row.detail,
                ]} />
              );
            }} />
          {/* The invisible bar carries each step to where the running total had reached. */}
          <Bar dataKey="offset" stackId="risk" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="risk" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.name} fill={row.isTotal ? VIZ.ink : row.name === "Baseline" ? VIZ.muted : VIZ.series} />
            ))}
            <LabelList dataKey="value" position="right" formatter={pct}
              style={{ fontSize: 11, fontWeight: 600, fill: VIZ.ink2 }} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
        Each step is a clinical observation the engine found, added to the running estimate in order of
        weight. These are the model's own contributions, not a clinical scoring system.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ completeness */

const COMPLETENESS_LABELS: Record<string, string> = {
  vitals: "Vital signs",
  labs: "Laboratory trend",
  history: "Clinical history",
  previous_records: "Previous records",
};

/** Below this a component reads as a gap rather than a score, and is drawn as one. */
const WEAK = 0.5;

/**
 * What the reliability figure is made of.
 *
 * "Low reliability" tells a clinician nothing they can act on; a named missing input does. The dial
 * carries the headline, the bars name the gap.
 */
export function CompletenessBreakdown({
  breakdown, overall,
}: { breakdown: Record<string, number>; overall: number }) {
  const entries = Object.entries(breakdown);
  if (!entries.length) {
    return (
      <div className="mt-4 rounded-[--radius-lg] border border-dashed px-5 py-8 text-center text-[13px] text-ink-3"
        style={{ borderColor: "var(--rule-strong)" }}>
        No completeness breakdown recorded with this assessment.
      </div>
    );
  }

  const rows = entries.map(([key, value]) => ({
    key,
    name: COMPLETENESS_LABELS[key] ?? key,
    value: Math.round(value * 100),
    weak: value < WEAK,
  }));

  return (
    <div className="mt-4 grid items-center gap-4 sm:grid-cols-[132px_minmax(0,1fr)]">
      <div className="relative">
        <ChartContainer config={CONFIG} className="mx-auto h-[132px] w-[132px]">
          <RadialBarChart data={[{ name: "complete", value: Math.round(overall * 100) }]}
            startAngle={90} endAngle={-270} innerRadius="72%" outerRadius="100%">
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: VIZ.seriesSoft }}
              fill={overall < 0.7 ? VIZ.warn : VIZ.series} isAnimationActive={false} />
          </RadialBarChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-[22px] leading-none font-semibold tracking-tight tnum">{percent(overall)}</div>
            <div className="mt-1 text-[10px] font-medium tracking-wide text-ink-3 uppercase">complete</div>
          </div>
        </div>
      </div>

      <ChartContainer config={CONFIG} className="h-[132px] w-full">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 4 }} barSize={13}>
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" width={112} {...AXIS} tick={{ fontSize: 11, fill: VIZ.ink2 }} interval={0} />
          <ChartTooltip cursor={{ fill: "rgba(85,70,232,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <Card title={row.name} rows={[
                  `${row.value}% complete`,
                  ...(row.weak ? ["This gap is holding prediction reliability down."] : []),
                ]} />
              );
            }} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} background={{ fill: "#efeeea", radius: 3 } as never}
            isAnimationActive={false}>
            {rows.map((row) => <Cell key={row.key} fill={row.weak ? VIZ.warn : VIZ.series} />)}
            <LabelList dataKey="value" position="right" formatter={pct}
              style={{ fontSize: 11, fontWeight: 600, fill: VIZ.ink2 }} />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
