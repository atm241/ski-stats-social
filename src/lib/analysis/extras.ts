import type { Segment } from "./types";

/** A gap longer than this between a run and the next lift is a break (lunch, après), not a lift line. */
const MAX_LIFT_LINE_S = 20 * 60;

export interface DayExtras {
  /** time actually moving downhill on runs */
  skiTimeS: number;
  /** time riding lifts */
  liftTimeS: number;
  /** time between finishing a run and the lift starting to climb */
  liftWaitS: number;
  /** time skinning / bootpacking uphill */
  skinTimeS: number;
  /** horizontal length of the longest run */
  longestRunM: number;
  /** vertical drop of the biggest run */
  tallestRunM: number;
  /** highest smoothed elevation reached */
  peakEleM: number;
}

/** Derived from segments alone, so existing days can be backfilled without the raw track. */
export function dayExtras(segments: Segment[]): DayExtras {
  const out: DayExtras = { skiTimeS: 0, liftTimeS: 0, liftWaitS: 0, skinTimeS: 0, longestRunM: 0, tallestRunM: 0, peakEleM: 0 };
  segments.forEach((s, i) => {
    const dur = Math.max(0, (s.endT - s.startT) / 1000);
    if (s.kind === "run") {
      out.skiTimeS += dur;
      out.longestRunM = Math.max(out.longestRunM, s.distanceM);
      out.tallestRunM = Math.max(out.tallestRunM, s.verticalM);
    } else if (s.kind === "lift") {
      out.liftTimeS += dur;
      const prev = segments[i - 1];
      const wait = prev?.kind === "run" ? (s.startT - prev.endT) / 1000 : -1;
      if (wait > 0 && wait <= MAX_LIFT_LINE_S) out.liftWaitS += wait;
    } else if (s.kind === "skin") {
      out.skinTimeS += dur;
    }
    if (s.kind !== "drive") out.peakEleM = Math.max(out.peakEleM, s.startEle, s.endEle);
  });
  out.skiTimeS = Math.round(out.skiTimeS);
  out.liftTimeS = Math.round(out.liftTimeS);
  out.liftWaitS = Math.round(out.liftWaitS);
  out.skinTimeS = Math.round(out.skinTimeS);
  return out;
}
