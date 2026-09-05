/** What the reliability figure is actually made of.
 *
 * Prediction reliability falls when the record is thin, and "low reliability" on its own tells a
 * clinician nothing they can act on. This breaks the completeness score into the four inputs the
 * engine scores — vitals, labs, history, previous records — so the gap is a specific missing thing
 * that someone can go and fill.
 *
 * One series, one hue: bar length is the whole message, so hue stays free to mark the weak inputs.
 */
import { percent } from "../clinical";
import { ChartEmpty, Tip, TipRow, TipTitle, barPath, useTip } from "./primitives";

const LABELS: Record<string, string> = {
  vitals: "Vital signs recorded",
  labs: "Laboratory trend",
  history: "Clinical history",
  previous_records: "Previous records",
};

/** Below this a component is drawn as a gap rather than a score, because that is how it reads. */
const WEAK = 0.5;

export function CompletenessBreakdown({
  breakdown, overall,
}: { breakdown: Record<string, number>; overall: number }) {
  const { tip, show, hide } = useTip();
  const entries = Object.entries(breakdown);
  if (!entries.length) return <ChartEmpty>No completeness breakdown recorded with this assessment.</ChartEmpty>;

  const width = 520;
  const row = 30;
  const bar = 12;
  const labelW = 150;
  const valueW = 44;
  const plotW = width - labelW - valueW;

  return (
    <figure className="mt-4">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${entries.length * row + 4}`} role="img"
        aria-label={`Data completeness ${percent(overall)}, broken down by input`}>
        <line x1={labelW} x2={labelW} y1={2} y2={entries.length * row - 6} stroke="var(--axis)" strokeWidth={1} />
        {entries.map(([key, value], index) => {
          const y = index * row + 6;
          const weak = value < WEAK;
          return (
            <g key={key}
              onMouseMove={(event) =>
                show(event, (
                  <>
                    <TipTitle>{LABELS[key] ?? key}</TipTitle>
                    <TipRow>{percent(value)} complete</TipRow>
                    {weak ? <TipRow>This gap is holding prediction reliability down.</TipRow> : null}
                  </>
                ))}
              onMouseLeave={hide}>
              <rect x={0} y={y - 7} width={width} height={row - 3} fill="transparent" />
              <text className="chart-label" x={labelW - 10} y={y + bar - 2.5} textAnchor="end">
                {LABELS[key] ?? key}
              </text>
              {/* The unfilled track makes the missing share as visible as the present one. */}
              <path d={barPath(labelW, y, plotW, bar, 4)} fill="var(--paper-2)" />
              <path d={barPath(labelW, y, Math.max(2, value * plotW), bar, 4)}
                fill={weak ? "var(--warn)" : "var(--series)"} />
              <text className="chart-figure" x={width - 4} y={y + bar - 2} textAnchor="end"
                style={{ fill: weak ? "var(--warn-ink)" : "var(--ink-2)" }}>
                {percent(value)}
              </text>
            </g>
          );
        })}
      </svg>
      <Tip state={tip} />
    </figure>
  );
}
