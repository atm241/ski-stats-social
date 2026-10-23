/* Display formatting. Imperial for now; a per-user unit setting can switch these later. */

const FT_PER_M = 3.28084;
const MI_PER_M = 1 / 1609.344;
const MPH_PER_MPS = 2.23694;

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export const feet = (m: number) => int.format(m * FT_PER_M);
export const feetCompact = (m: number) => compact.format(m * FT_PER_M);
export const miles = (m: number) => one.format(m * MI_PER_M);
export const mph = (mps: number) => int.format(mps * MPH_PER_MPS);
export const toFeet = (m: number) => m * FT_PER_M;

export function duration(ms: number) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

export function prettyDate(localDate: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) {
  return new Date(`${localDate}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function clockTime(t: number | Date, timeZone: string) {
  return new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
}

/** Season vertical milestones, in feet. */
export const MILESTONES_FT = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000];

export function milestoneProgress(verticalM: number) {
  const ft = toFeet(verticalM);
  const next = MILESTONES_FT.find((m) => m > ft) ?? MILESTONES_FT.at(-1)!;
  const prev = [...MILESTONES_FT].reverse().find((m) => m <= ft) ?? 0;
  return { ft, next, prev, pct: Math.min(1, (ft - prev) / (next - prev)) };
}
