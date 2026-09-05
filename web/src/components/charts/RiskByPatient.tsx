/** Deterioration risk per patient, highest first.
 *
 * Emphasis rather than categorical: one hue for the whole series, the open patient carrying the
 * accent and the rest receding. Colouring each bar darker-where-bigger would double-encode length as
 * hue and spend the only free channel restating what the bar already says.
 *
 * The immediate-assessment threshold is drawn as a rule across the plot, because the question a
 * reader actually has is not "how long is this bar" but "which side of the line is it on".
 */
import type { QueueItem } from "@/api/types";
import { ACTION_THRESHOLD, percent, reliabilityBand } from "../clinical";
import { Caption, ChartEmpty, Tip, TipRow, TipTitle, barPath, useTip } from "./primitives";

const ROW = 36;
const BAR = 14;
const LABEL_W = 88;
const VALUE_W = 52;

export function RiskByPatient({
  items, selectedId, onSelect, limit = 6,
}: { items: QueueItem[]; selectedId: string | null; onSelect?: (id: string) => void; limit?: number }) {
  const { tip, show, hide } = useTip();
  const rows = [...items].sort((a, b) => b.deterioration_risk - a.deterioration_risk).slice(0, limit);
  if (!rows.length) return <ChartEmpty>No patients in the queue yet.</ChartEmpty>;

  const width = 560;
  const height = rows.length * ROW + 26;
  const plotW = width - LABEL_W - VALUE_W;
  const thresholdX = LABEL_W + ACTION_THRESHOLD * plotW;

  return (
    <figure className="mt-4">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`Deterioration risk for the ${rows.length} highest-risk patients in the queue`}>
        {[0, 0.5, 1].map((tick) => (
          <text key={tick} className="chart-tick" x={LABEL_W + tick * plotW} y={height - 4}
            textAnchor={tick === 0 ? "start" : tick === 1 ? "end" : "middle"}>
            {Math.round(tick * 100)}%
          </text>
        ))}

        {/* The line that separates "assess now" from "assess when available". */}
        <line x1={thresholdX} x2={thresholdX} y1={2} y2={height - 20} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
        <text className="chart-tick" x={thresholdX + 5} y={12} style={{ fill: "var(--ink-3)" }}>
          immediate assessment
        </text>
        <line x1={LABEL_W} x2={LABEL_W} y1={2} y2={height - 20} stroke="var(--axis)" strokeWidth={1} />

        {rows.map((item, index) => {
          const y = index * ROW + 18;
          const barWidth = Math.max(3, item.deterioration_risk * plotW);
          const selected = item.patient_id === selectedId;
          const urgent = item.deterioration_risk >= ACTION_THRESHOLD;
          return (
            <g key={item.patient_id} className={onSelect ? "cursor-pointer" : undefined}
              onClick={() => onSelect?.(item.patient_id)}
              onMouseMove={(event) =>
                show(event, (
                  <>
                    <TipTitle>{item.patient_id}</TipTitle>
                    <TipRow>Deterioration risk {percent(item.deterioration_risk)}</TipRow>
                    <TipRow>Reliability {reliabilityBand(item.prediction_reliability)} · {percent(item.prediction_reliability)}</TipRow>
                    <TipRow>Protocol band {item.protocol_band} · queue rank {item.global_rank}</TipRow>
                  </>
                ))}
              onMouseLeave={hide}>
              {/* A transparent band widens the hit target well past the 14px mark. */}
              <rect x={0} y={y - 9} width={width} height={ROW - 4} fill="transparent" />
              <text className="chart-label" x={LABEL_W - 10} y={y + BAR - 3} textAnchor="end"
                style={{ fontWeight: selected ? 600 : 500, fill: selected ? "var(--ink)" : "var(--ink-2)" }}>
                {item.patient_id}
              </text>
              <path d={barPath(LABEL_W, y, barWidth, BAR, 4)}
                fill={selected ? (urgent ? "var(--crit)" : "var(--series)") : "var(--mark-muted)"} />
              <text className="chart-figure" x={LABEL_W + barWidth + 8} y={y + BAR - 2}
                style={{ fill: selected ? "var(--ink)" : "var(--ink-2)" }}>
                {percent(item.deterioration_risk)}
              </text>
            </g>
          );
        })}
      </svg>
      <Caption>
        Risk alone. Queue rank is set by protocol band first, so the longest bar is not always the top
        of the queue. The filled bar is the patient open in the panel.
      </Caption>
      <Tip state={tip} />
    </figure>
  );
}
