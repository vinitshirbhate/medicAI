/** Waiting time against deterioration risk, one mark per patient.
 *
 * Two measures on two axes — never two y-scales on one plot, which would invent a correlation the
 * data does not contain. The upper-right region is shaded: a patient who has both waited and
 * deteriorated is the one this chart exists to surface.
 *
 * Marks are coloured by prediction reliability, which is a state rather than an identity, so it uses
 * the reserved status palette. Colour never carries it alone — each state has its own marker shape
 * and a labelled legend entry.
 */
import type { QueueItem } from "@/api/types";
import { ACTION_THRESHOLD, minutesLabel, percent, reliabilityBand } from "../clinical";
import { Caption, ChartEmpty, Legend, Tip, TipRow, TipTitle, niceTicks, useTip } from "./primitives";

const STYLE = {
  HIGH: { color: "var(--ok)", label: "Reliability high", shape: "circle" as const },
  MODERATE: { color: "var(--warn)", label: "Reliability moderate", shape: "diamond" as const },
  LOW: { color: "var(--crit)", label: "Reliability low", shape: "triangle" as const },
};

function Marker({ shape, x, y, color, r = 6.5 }: { shape: "circle" | "diamond" | "triangle"; x: number; y: number; color: string; r?: number }) {
  // A surface-coloured ring keeps overlapping marks readable where the queue clusters.
  const ring = { stroke: "var(--surface)", strokeWidth: 2 } as const;
  if (shape === "circle") return <circle cx={x} cy={y} r={r} fill={color} {...ring} />;
  if (shape === "diamond") return <path d={`M${x},${y - r - 1} L${x + r + 1},${y} L${x},${y + r + 1} L${x - r - 1},${y} Z`} fill={color} {...ring} />;
  return <path d={`M${x},${y - r - 1.5} L${x + r + 1},${y + r} L${x - r - 1},${y + r} Z`} fill={color} {...ring} />;
}

export function WaitVersusRisk({
  items, selectedId, onSelect,
}: { items: QueueItem[]; selectedId: string | null; onSelect?: (id: string) => void }) {
  const { tip, show, hide } = useTip();
  if (!items.length) return <ChartEmpty>No patients in the queue yet.</ChartEmpty>;

  const width = 560;
  const height = 300;
  const pad = { top: 12, right: 16, bottom: 46, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxWait = Math.max(10, ...items.map((item) => item.minutes_waiting));
  const xTicks = niceTicks(maxWait, 4);
  const xMax = xTicks[xTicks.length - 1] || maxWait;
  const px = (minutes: number) => pad.left + (minutes / xMax) * plotW;
  const py = (risk: number) => pad.top + (1 - risk) * plotH;
  const present = new Set(items.map((item) => reliabilityBand(item.prediction_reliability)));
  const medianWait = xMax / 2;

  return (
    <figure className="mt-4">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label="Waiting time against deterioration risk for each patient in the queue">
        {/* Waited long AND deteriorating: the quadrant a charge nurse is scanning for. */}
        <rect x={px(medianWait)} y={pad.top} width={px(xMax) - px(medianWait)} height={py(ACTION_THRESHOLD) - pad.top}
          fill="var(--crit)" opacity={0.05} />
        <text className="chart-tick" x={px(xMax) - 4} y={pad.top + 13} textAnchor="end" style={{ fill: "var(--crit-ink)", opacity: 0.75 }}>
          waited and deteriorating
        </text>

        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={py(tick)} y2={py(tick)} stroke="var(--grid)" strokeWidth={1} />
            <text className="chart-tick" x={pad.left - 7} y={py(tick) + 3.5} textAnchor="end">{Math.round(tick * 100)}%</text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={py(ACTION_THRESHOLD)} y2={py(ACTION_THRESHOLD)}
          stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />

        {xTicks.map((tick) => (
          <text key={tick} className="chart-tick" x={px(tick)} y={height - pad.bottom + 17} textAnchor="middle">{Math.round(tick)}</text>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={py(0)} y2={py(0)} stroke="var(--axis)" strokeWidth={1} />
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={py(0)} stroke="var(--axis)" strokeWidth={1} />
        <text className="chart-tick" x={pad.left + plotW / 2} y={height - 6} textAnchor="middle">Minutes waiting</text>
        <text className="chart-tick" transform={`translate(11 ${pad.top + plotH / 2}) rotate(-90)`} textAnchor="middle">Deterioration risk</text>

        {items.map((item) => {
          const band = reliabilityBand(item.prediction_reliability);
          const style = STYLE[band];
          const x = px(Math.min(item.minutes_waiting, xMax));
          const y = py(item.deterioration_risk);
          const selected = item.patient_id === selectedId;
          return (
            <g key={item.patient_id} className={onSelect ? "cursor-pointer" : undefined}
              onClick={() => onSelect?.(item.patient_id)}
              onMouseMove={(event) =>
                show(event, (
                  <>
                    <TipTitle>{item.patient_id}</TipTitle>
                    <TipRow>Waiting {minutesLabel(item.minutes_waiting)}</TipRow>
                    <TipRow>Deterioration risk {percent(item.deterioration_risk)}</TipRow>
                    <TipRow>{style.label} · {percent(item.prediction_reliability)}</TipRow>
                  </>
                ))}
              onMouseLeave={hide}>
              <circle cx={x} cy={y} r={16} fill="transparent" />
              {selected ? <circle cx={x} cy={y} r={12} fill="none" stroke="var(--accent)" strokeWidth={1.5} /> : null}
              <Marker shape={style.shape} x={x} y={y} color={style.color} />
              <text className="chart-label" x={x} y={y - 13} textAnchor="middle"
                style={{ fontWeight: selected ? 600 : 500 }}>
                {item.patient_id}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend>
        {(Object.keys(STYLE) as (keyof typeof STYLE)[])
          .filter((band) => present.has(band))
          .map((band) => (
            <span key={band} className="inline-flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden>
                <Marker shape={STYLE[band].shape} x={7.5} y={7.5} color={STYLE[band].color} r={5} />
              </svg>
              {STYLE[band].label}
            </span>
          ))}
      </Legend>
      <Caption>
        The dashed rule is the immediate-assessment threshold. Reliability changes how cautiously a
        recommendation is acted on; it never changes rank.
      </Caption>
      <Tip state={tip} />
    </figure>
  );
}
