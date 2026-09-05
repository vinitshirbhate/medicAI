/** Shared chart plumbing: the hover layer and the mark geometry every chart here reuses. */
import { useCallback, useState, type ReactNode } from "react";

export type TipState = { x: number; y: number; content: ReactNode } | null;

export function useTip() {
  const [tip, setTip] = useState<TipState>(null);
  const show = useCallback((event: { clientX: number; clientY: number }, content: ReactNode) => {
    setTip({ x: event.clientX, y: event.clientY, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

/** Fixed-position so it escapes chart overflow and never shifts the layout underneath. */
export function Tip({ state }: { state: TipState }) {
  if (!state) return null;
  const flipX = state.x > window.innerWidth - 290;
  const flipY = state.y > window.innerHeight - 140;
  return (
    <div className="viz-tip" role="tooltip"
      style={{ left: flipX ? state.x - 280 : state.x + 14, top: flipY ? state.y - 110 : state.y + 14 }}>
      {state.content}
    </div>
  );
}

export function TipTitle({ children }: { children: ReactNode }) {
  return <div className="mb-0.5 text-[13px] font-semibold">{children}</div>;
}

export function TipRow({ children }: { children: ReactNode }) {
  return <div style={{ color: "var(--ink-2)" }}>{children}</div>;
}

/**
 * A bar with only its data end rounded, so every bar shares one straight baseline edge.
 * `side` names the end the value grows toward.
 */
export function barPath(x: number, y: number, width: number, height: number, radius = 4, side: "right" | "top" = "right"): string {
  if (side === "right") {
    const r = Math.max(0, Math.min(radius, width, height / 2));
    return `M${x},${y} H${x + width - r} A${r},${r} 0 0 1 ${x + width},${y + r} V${y + height - r} A${r},${r} 0 0 1 ${x + width - r},${y + height} H${x} Z`;
  }
  const r = Math.max(0, Math.min(radius, height, width / 2));
  return `M${x},${y + height} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} H${x + width - r} A${r},${r} 0 0 1 ${x + width},${y + r} V${y + height} Z`;
}

export function linePath(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
}

export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(Number(value.toFixed(6)));
  return ticks;
}

export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-[170px] place-items-center rounded-[--radius-lg] border border-dashed px-5 text-center text-[13px] text-ink-3"
      style={{ borderColor: "var(--rule-strong)" }}>
      {children}
    </div>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return <figcaption className="mt-3 text-[12px] leading-relaxed text-ink-3">{children}</figcaption>;
}

export function Legend({ children }: { children: ReactNode }) {
  return <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-ink-2">{children}</div>;
}
