/** Shared chart parameters, so every plot in the console reads as one system.
 *
 * The band ramp is an indigo ordinal ramp checked with the project palette validator against this
 * surface: monotone light-to-dark, every adjacent step separated, lightest step clearing white at
 * 2.11:1. The status four are reserved for state (good / warning / serious / critical) and never
 * reused for a data series — and never carry meaning without a label beside them.
 */

export const VIZ = {
  series: "#5546e8",
  seriesSoft: "#dedafc",
  muted: "#bdbbcf",
  grid: "#e8e6e0",
  axis: "#cbc8c0",
  ink: "#0e0f2b",
  ink2: "#4a4d68",
  ink3: "#7c7f96",
  ok: "#0ca30c",
  warn: "#fab219",
  serious: "#ec835a",
  crit: "#d03b3b",
  surface: "#ffffff",
} as const;

/** Band 1 is the most urgent and is drawn darkest. */
export const BAND_RAMP = ["#241a7a", "#241a7a", "#3a2bb5", "#5546e8", "#8279f0", "#b0aaf7"];

export const bandColor = (band: number) => BAND_RAMP[band] ?? VIZ.series;

/** Recharts axis/grid styling reused by every chart, so no plot drifts from the others. */
export const AXIS = {
  tick: { fontSize: 11, fill: VIZ.ink3 },
  tickLine: false,
  axisLine: { stroke: VIZ.axis },
} as const;

export const GRID = { stroke: VIZ.grid, strokeDasharray: "0" } as const;
