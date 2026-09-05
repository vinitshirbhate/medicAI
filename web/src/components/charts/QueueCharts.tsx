/** The queue charts, built on Recharts.
 *
 * Four rules hold across all of them:
 *   - Deterioration risk and prediction reliability are never combined into one mark.
 *   - The immediate-assessment threshold is drawn, because the reader's real question is which side
 *     of the line a patient is on, not how long a bar happens to be.
 *   - Colour never carries meaning alone; every status has a shape and a written label.
 *   - Two measures of different scale get two axes of a scatter, never two y-scales on one plot.
 */
import {
  Bar, BarChart, Cell, LabelList, ReferenceArea, ReferenceLine, Scatter, ScatterChart,
  XAxis, YAxis, ZAxis,
} from "recharts";
import type { QueueItem } from "@/api/types";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { ACTION_THRESHOLD, minutesLabel, percent, reliabilityBand } from "../clinical";
import { AXIS, VIZ, bandColor } from "./theme";

const CONFIG = {
  risk: { label: "Deterioration risk", color: VIZ.series },
} satisfies ChartConfig;

/** Recharts hands label formatters a loose renderable; read the number out rather than assume it. */
const pct = (value: unknown) => `${Math.round(Number(value))}%`;

/** A click lands on Recharts' own point object; the patient id is carried on its payload. */
function selectFrom(entry: unknown, onSelect?: (id: string) => void): void {
  if (!onSelect || !entry || typeof entry !== "object") return;
  const record = entry as { id?: unknown; payload?: { id?: unknown } };
  const id = typeof record.id === "string" ? record.id : record.payload?.id;
  if (typeof id === "string") onSelect(id);
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 grid min-h-[180px] place-items-center rounded-[--radius-lg] border border-dashed px-5 text-center text-[13px] text-ink-3"
      style={{ borderColor: "var(--rule-strong)" }}>
      {children}
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{children}</p>;
}

/** A tooltip card that keeps the same voice everywhere. */
function Card({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-[--radius-md] border bg-[--surface] px-3 py-2 text-[12.5px] shadow-lg tnum"
      style={{ borderColor: "var(--rule-strong)" }}>
      <div className="mb-0.5 font-semibold">{title}</div>
      {rows.map((row) => <div key={row} style={{ color: "var(--ink-2)" }}>{row}</div>)}
    </div>
  );
}

/* ------------------------------------------------------------------ risk by patient */

export function RiskByPatient({
  items, selectedId, onSelect, limit = 7,
}: { items: QueueItem[]; selectedId: string | null; onSelect?: (id: string) => void; limit?: number }) {
  const rows = [...items]
    .sort((a, b) => b.deterioration_risk - a.deterioration_risk)
    .slice(0, limit)
    .map((item) => ({
      id: item.patient_id,
      risk: Math.round(item.deterioration_risk * 100),
      band: item.protocol_band,
      reliability: item.prediction_reliability,
      rank: item.global_rank,
    }));

  if (!rows.length) return <Empty>No patients in the queue yet.</Empty>;

  return (
    <>
      <ChartContainer config={CONFIG} className="mt-4 h-[280px] w-full">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 40, bottom: 4, left: 4 }} barSize={16}>
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" {...AXIS} />
          <YAxis type="category" dataKey="id" width={78} {...AXIS}
            tick={{ fontSize: 11.5, fill: VIZ.ink2, fontFamily: "var(--font-mono)" }} />
          <ReferenceLine x={ACTION_THRESHOLD * 100} stroke={VIZ.ink3} strokeDasharray="3 3"
            label={{ value: "assess now", position: "top", fill: VIZ.ink3, fontSize: 10.5 }} />
          <ChartTooltip cursor={{ fill: "rgba(85,70,232,0.05)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as (typeof rows)[number];
              return (
                <Card title={row.id} rows={[
                  `Deterioration risk ${row.risk}%`,
                  `Reliability ${reliabilityBand(row.reliability)} · ${percent(row.reliability)}`,
                  `Protocol band ${row.band} · queue rank ${row.rank}`,
                ]} />
              );
            }} />
          <Bar dataKey="risk" radius={[0, 4, 4, 0]} onClick={(entry: unknown) => selectFrom(entry, onSelect)}
            className={onSelect ? "cursor-pointer" : undefined}>
            {rows.map((row) => (
              <Cell key={row.id}
                fill={row.id === selectedId ? (row.risk >= ACTION_THRESHOLD * 100 ? VIZ.crit : VIZ.series) : VIZ.muted} />
            ))}
            <LabelList dataKey="risk" position="right" formatter={pct}
              style={{ fontSize: 11.5, fontWeight: 600, fill: VIZ.ink2 }} />
          </Bar>
        </BarChart>
      </ChartContainer>
      <Caption>
        Risk alone. Queue rank is set by protocol band first, so the longest bar is not always the top
        of the queue. The filled bar is the patient open in the panel.
      </Caption>
    </>
  );
}

/* ------------------------------------------------------------------ wait vs risk */

const RELIABILITY_MARK = {
  HIGH: { color: VIZ.ok, label: "Reliability high", shape: "circle" as const },
  MODERATE: { color: VIZ.warn, label: "Reliability moderate", shape: "diamond" as const },
  LOW: { color: VIZ.crit, label: "Reliability low", shape: "triangle" as const },
};

export function WaitVersusRisk({
  items, selectedId, onSelect,
}: { items: QueueItem[]; selectedId: string | null; onSelect?: (id: string) => void }) {
  if (!items.length) return <Empty>No patients in the queue yet.</Empty>;

  const maxWait = Math.max(30, ...items.map((item) => item.minutes_waiting));
  const xMax = Math.ceil(maxWait / 15) * 15;

  const groups = (Object.keys(RELIABILITY_MARK) as (keyof typeof RELIABILITY_MARK)[]).map((band) => ({
    band,
    points: items
      .filter((item) => reliabilityBand(item.prediction_reliability) === band)
      .map((item) => ({
        id: item.patient_id,
        wait: Math.round(item.minutes_waiting),
        risk: Math.round(item.deterioration_risk * 100),
        reliability: item.prediction_reliability,
        selected: item.patient_id === selectedId,
      })),
  })).filter((group) => group.points.length);

  return (
    <>
      <ChartContainer config={CONFIG} className="mt-4 h-[320px] w-full">
        <ScatterChart margin={{ top: 22, right: 22, bottom: 26, left: 4 }}>
          {/* Waited long and deteriorating: the region a charge nurse is scanning for. */}
          <ReferenceArea x1={xMax / 2} x2={xMax} y1={ACTION_THRESHOLD * 100} y2={100}
            fill={VIZ.crit} fillOpacity={0.05} stroke="none"
            label={{ value: "waited and deteriorating", position: "insideBottomRight",
                     fill: VIZ.crit, fontSize: 10.5, dy: -4, dx: -4, opacity: 0.8 }} />
          <XAxis type="number" dataKey="wait" name="Waiting" domain={[0, xMax]} unit="m" {...AXIS}
            label={{ value: "Minutes waiting", position: "insideBottom", dy: 16, fontSize: 11, fill: VIZ.ink3 }} />
          <YAxis type="number" dataKey="risk" name="Risk" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} unit="%" {...AXIS}
            width={44}
            label={{ value: "Deterioration risk", angle: -90, position: "insideLeft", fontSize: 11, fill: VIZ.ink3 }} />
          <ZAxis range={[110, 110]} />
          <ReferenceLine y={ACTION_THRESHOLD * 100} stroke={VIZ.ink3} strokeDasharray="3 3" />
          <ChartTooltip cursor={{ strokeDasharray: "3 3", stroke: VIZ.axis }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { id: string; wait: number; risk: number; reliability: number };
              return (
                <Card title={row.id} rows={[
                  `Waiting ${minutesLabel(row.wait)}`,
                  `Deterioration risk ${row.risk}%`,
                  `${RELIABILITY_MARK[reliabilityBand(row.reliability)].label} · ${percent(row.reliability)}`,
                ]} />
              );
            }} />
          {groups.map((group) => (
            <Scatter key={group.band} name={RELIABILITY_MARK[group.band].label} data={group.points}
              fill={RELIABILITY_MARK[group.band].color} shape={RELIABILITY_MARK[group.band].shape}
              className={onSelect ? "cursor-pointer" : undefined}
              onClick={(entry: unknown) => selectFrom(entry, onSelect)}>
              {/* Labels sit above the mark; the quadrant note is anchored bottom-right so the two
                  cannot collide the way a shared corner would. */}
              <LabelList dataKey="id" position="top" offset={9}
                style={{ fontSize: 10.5, fill: VIZ.ink2, fontFamily: "var(--font-mono)" }} />
              {group.points.map((point) => (
                <Cell key={point.id} stroke={point.selected ? VIZ.ink : VIZ.surface} strokeWidth={point.selected ? 2 : 1.5} />
              ))}
            </Scatter>
          ))}
        </ScatterChart>
      </ChartContainer>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-ink-2">
        {groups.map((group) => (
          <span key={group.band} className="inline-flex items-center gap-2">
            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden>
              {RELIABILITY_MARK[group.band].shape === "circle" ? (
                <circle cx="6.5" cy="6.5" r="5" fill={RELIABILITY_MARK[group.band].color} />
              ) : RELIABILITY_MARK[group.band].shape === "diamond" ? (
                <path d="M6.5 1 L12 6.5 L6.5 12 L1 6.5 Z" fill={RELIABILITY_MARK[group.band].color} />
              ) : (
                <path d="M6.5 1 L12 11.5 L1 11.5 Z" fill={RELIABILITY_MARK[group.band].color} />
              )}
            </svg>
            {RELIABILITY_MARK[group.band].label}
          </span>
        ))}
      </div>
      <Caption>
        The dashed rule is the immediate-assessment threshold. Reliability changes how cautiously a
        recommendation is acted on; it never changes rank.
      </Caption>
    </>
  );
}

/* ------------------------------------------------------------------ band distribution */

export function BandDistribution({ items }: { items: QueueItem[] }) {
  if (!items.length) return <Empty>No patients in the queue yet.</Empty>;

  const counts = new Map<number, number>();
  for (const item of items) counts.set(item.protocol_band, (counts.get(item.protocol_band) ?? 0) + 1);
  const bands = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const total = items.length;
  // One stacked row: part-to-whole across an ordered scale, which a pie makes harder to compare.
  const row: Record<string, number | string> = { name: "Queue" };
  for (const [band, count] of bands) row[`band${band}`] = count;

  return (
    <>
      <ChartContainer config={CONFIG} className="mt-4 h-[92px] w-full">
        <BarChart data={[row]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }} barSize={54}>
          <XAxis type="number" hide domain={[0, total]} />
          <YAxis type="category" dataKey="name" hide />
          <ChartTooltip cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const entry = payload[0];
              const band = String(entry.dataKey).replace("band", "");
              const count = Number(entry.value);
              return <Card title={`Protocol band ${band}`} rows={[`${count} of ${total} patients · ${Math.round((count / total) * 100)}%`]} />;
            }} />
          {bands.map(([band], index) => (
            <Bar key={band} dataKey={`band${band}`} stackId="queue" fill={bandColor(band)}
              radius={bands.length === 1 ? 6 : index === 0 ? [6, 0, 0, 6] : index === bands.length - 1 ? [0, 6, 6, 0] : 0}>
              <LabelList dataKey={`band${band}`} position="center"
                formatter={(value: unknown) => {
                  const count = Number(value);
                  return count / total > 0.11 ? `${count} · ${Math.round((count / total) * 100)}%` : "";
                }}
                style={{ fontSize: 12.5, fontWeight: 600, fill: "#fff" }} />
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-ink-2">
        {bands.map(([band, count]) => (
          <span key={band} className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: bandColor(band) }} />
            Band {band} — {count} patient{count === 1 ? "" : "s"}
          </span>
        ))}
      </div>
      <Caption>Band 1 is the most urgent protocol band and is drawn darkest.</Caption>
    </>
  );
}
