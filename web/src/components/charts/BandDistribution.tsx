/** Share of the queue in each protocol band.
 *
 * Part-to-whole over an ordered scale, so it is a stacked bar on the indigo ordinal ramp — most
 * urgent darkest — rather than a pie. Bands are ordered, and neighbouring shares need comparing,
 * which arc lengths make hard.
 */
import type { QueueItem } from "@/api/types";
import { BAND_COLOR } from "../clinical";
import { Caption, ChartEmpty, Legend, Tip, TipRow, TipTitle, useTip } from "./primitives";

export function BandDistribution({ items }: { items: QueueItem[] }) {
  const { tip, show, hide } = useTip();
  if (!items.length) return <ChartEmpty>No patients in the queue yet.</ChartEmpty>;

  const counts = new Map<number, number>();
  for (const item of items) counts.set(item.protocol_band, (counts.get(item.protocol_band) ?? 0) + 1);
  const bands = [...counts.entries()].sort((a, b) => a[0] - b[0]);
  const total = items.length;

  const width = 560;
  const barHeight = 52;
  const gap = 3; // A surface gap so adjacent segments never fuse into one block.

  let cursor = 0;
  const segments = bands.map(([band, count]) => {
    const segmentWidth = (count / total) * width;
    const x = cursor;
    cursor += segmentWidth;
    return { band, count, x, width: segmentWidth, share: count / total };
  });

  return (
    <figure className="mt-4">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${barHeight}`} role="img"
        aria-label={`Protocol band distribution across ${total} patients`}>
        <defs>
          <clipPath id="band-round">
            <rect x="0" y="0" width={width} height={barHeight} rx="8" />
          </clipPath>
        </defs>
        <g clipPath="url(#band-round)">
          {segments.map((segment, index) => (
            <g key={segment.band}
              onMouseMove={(event) =>
                show(event, (
                  <>
                    <TipTitle>Protocol band {segment.band}</TipTitle>
                    <TipRow>{segment.count} of {total} patients · {Math.round(segment.share * 100)}%</TipRow>
                  </>
                ))}
              onMouseLeave={hide}>
              <rect x={segment.x} y={0}
                width={Math.max(2, segment.width - (index < segments.length - 1 ? gap : 0))} height={barHeight}
                fill={BAND_COLOR[segment.band] ?? "var(--band-3)"} />
              {/* Direct labels only where they fit; the legend carries the narrow segments. */}
              {segment.width > 62 ? (
                <text x={segment.x + (segment.width - gap) / 2} y={barHeight / 2 + 4.5} textAnchor="middle"
                  fill="#fff" fontSize="13" fontWeight="600" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {segment.count} · {Math.round(segment.share * 100)}%
                </text>
              ) : null}
            </g>
          ))}
        </g>
      </svg>
      <Legend>
        {segments.map((segment) => (
          <span key={segment.band} className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-[3px]" style={{ background: BAND_COLOR[segment.band] ?? "var(--band-3)" }} />
            Band {segment.band} — {segment.count} patient{segment.count === 1 ? "" : "s"}
          </span>
        ))}
      </Legend>
      <Caption>Band 1 is the most urgent protocol band and is drawn darkest.</Caption>
      <Tip state={tip} />
    </figure>
  );
}
