import type { DayExtras } from "./extras";

export interface TrackPoint {
  /** epoch milliseconds */
  t: number;
  lat: number;
  lon: number;
  /** meters above sea level */
  ele: number;
}

/**
 * run   – downhill skiing (counts toward vertical)
 * lift  – mechanized ascent
 * skin  – human-powered ascent: skinning, bootpacking or hiking. GPS can't reliably tell
 *         skis from boots, so these are one category.
 * drive – vehicle travel, excluded from all stats
 */
export type SegmentKind = "run" | "lift" | "skin" | "drive";

export interface Segment {
  kind: SegmentKind;
  startT: number;
  endT: number;
  startEle: number;
  endEle: number;
  /** descent for runs, ascent for lift/skin */
  verticalM: number;
  distanceM: number;
  maxSpeedMps: number;
}

export type DayKind = "resort" | "backcountry" | "mixed";

export interface DayStats extends DayExtras {
  startedAt: number;
  endedAt: number;
  verticalM: number;
  uphillM: number;
  distanceM: number;
  maxSpeedMps: number;
  runCount: number;
  liftCount: number;
  kind: DayKind;
  segments: Segment[];
  flags: string[];
}
