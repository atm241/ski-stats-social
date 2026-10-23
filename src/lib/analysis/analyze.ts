import { dayExtras } from "./extras";
import { haversine } from "./geo";
import type { DayKind, DayStats, Segment, SegmentKind, TrackPoint } from "./types";

/*
 * How a day is measured
 * ---------------------
 * 1. GPS altitude is noisy, so it's smoothed (rolling median, then rolling mean).
 * 2. The smoothed profile is cut into alternating up/down "legs" with a zigzag filter:
 *    a turn only counts once elevation reverses by PIVOT_HYSTERESIS_M.
 * 3. Each leg is classified: down legs are runs (or drives), up legs are lifts,
 *    human-powered climbs (skinning or hiking, not told apart) or drives, based on vertical rate, horizontal speed and steepness. Roads are
 *    gentle (<15%) while lifts and ski runs are steep, which is how car rides (driving to
 *    the hill, hitchhiking pass laps) are kept out of the stats.
 * 4. Small legs are merged into neighbours so a run with a little uphill bump stays one run.
 * Vertical = total descent across runs, the same rule for resort and backcountry days.
 */

const MEDIAN_HALF_WINDOW_S = 6;
const MEAN_HALF_WINDOW_S = 10;
const PIVOT_HYSTERESIS_M = 15;
const MIN_LEG_M = 30;
const FLAT_TRIM_M = 3;
/** Chairlifts climb ~1–3 m/s, strong skinners ~0.3 m/s. */
const LIFT_MIN_VERTICAL_RATE = 0.45;
/** Downhill: fast and road-gentle is a car; faster than any sustained skiing is a car regardless. */
const DRIVE_MIN_SPEED = 12;
const DRIVE_MAX_GRADE = 0.12;
const DRIVE_ANY_GRADE_SPEED = 22;
/** Uphill: lifts top out around 6 m/s; slower climbs at road grades are cars in traffic. */
const UP_DRIVE_MIN_SPEED = 10;
const UP_SLOW_DRIVE_MIN_SPEED = 4;
const ROAD_MAX_GRADE = 0.15;
/** Slow uphill travel is measured on positions a minute apart so GPS jitter doesn't inflate distance. */
const PATH_SAMPLE_S = 60;
const SPEED_WINDOW_S = 4;
const GLITCH_SPEED = 70;

export const SUSPICIOUS_SPEED_MPS = 42; // ~150 km/h
const SUSPICIOUS_LIFT_RATE = 8;
const SUSPICIOUS_DAY_VERTICAL_M = 25000;
const MIXED_MIN_UPHILL_M = 300;

export function smoothElevation(points: TrackPoint[]): number[] {
  const n = points.length;
  const t0 = points[0].t;
  const tEnd = points[n - 1].t;
  // Windows shrink symmetrically at the ends so the first/last points aren't biased.
  const bounds = (halfS: number) => {
    const out: [number, number][] = [];
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < n; i++) {
      const h = Math.min(halfS * 1000, points[i].t - t0, tEnd - points[i].t);
      while (points[lo].t < points[i].t - h) lo++;
      hi = Math.max(hi, i);
      while (hi + 1 < n && points[hi + 1].t <= points[i].t + h) hi++;
      out.push([lo, hi]);
    }
    return out;
  };

  const median = bounds(MEDIAN_HALF_WINDOW_S).map(([lo, hi]) => {
    const w = [];
    for (let k = lo; k <= hi; k++) w.push(points[k].ele);
    w.sort((a, b) => a - b);
    return w[w.length >> 1];
  });

  const prefix = [0];
  for (const m of median) prefix.push(prefix.at(-1)! + m);
  return bounds(MEAN_HALF_WINDOW_S).map(([lo, hi]) => (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1));
}

/** Indices of alternating local extremes, always including the first and last index. */
export function zigzag(e: number[], h: number): number[] {
  const pivots = [0];
  let dir = 0;
  let ext = 0;
  let lo = 0;
  let hi = 0;
  for (let i = 1; i < e.length; i++) {
    if (dir === 0) {
      if (e[i] > e[hi]) hi = i;
      if (e[i] < e[lo]) lo = i;
      if (e[hi] - e[lo] >= h) {
        const start = hi > lo ? lo : hi;
        if (start !== 0) pivots.push(start);
        dir = hi > lo ? 1 : -1;
        ext = hi > lo ? hi : lo;
      }
    } else if (dir === 1) {
      if (e[i] >= e[ext]) ext = i;
      else if (e[ext] - e[i] >= h) {
        pivots.push(ext);
        dir = -1;
        ext = i;
      }
    } else {
      if (e[i] <= e[ext]) ext = i;
      else if (e[i] - e[ext] >= h) {
        pivots.push(ext);
        dir = 1;
        ext = i;
      }
    }
  }
  if (pivots.at(-1) !== e.length - 1) pivots.push(e.length - 1);
  return pivots;
}

interface Leg {
  kind: SegmentKind | "minor";
  up: boolean;
  a: number;
  b: number;
  /** active span, with flat ends trimmed */
  s: number;
  e: number;
  verticalM: number;
  distanceM: number;
  maxSpeedMps: number;
  verticalRate: number;
}

export function analyzeDay(points: TrackPoint[]): DayStats {
  const n = points.length;
  const ele = smoothElevation(points);

  const cumDist = [0];
  for (let i = 1; i < n; i++) {
    cumDist.push(cumDist[i - 1] + haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon));
  }

  const maxSpeedBetween = (a: number, b: number) => {
    let best = 0;
    let j = a;
    for (let i = a; i < b; i++) {
      while (j < b && points[j].t - points[i].t < SPEED_WINDOW_S * 1000) j++;
      if (points[j].t - points[i].t < SPEED_WINDOW_S * 1000) break;
      const v = (cumDist[j] - cumDist[i]) / ((points[j].t - points[i].t) / 1000);
      if (v < GLITCH_SPEED && v > best) best = v;
    }
    return best;
  };

  const pathDistance = (a: number, b: number) => {
    let d = 0;
    let prev = a;
    for (let i = a + 1; i <= b; i++) {
      if (i === b || points[i].t - points[prev].t >= PATH_SAMPLE_S * 1000) {
        d += haversine(points[prev].lat, points[prev].lon, points[i].lat, points[i].lon);
        prev = i;
      }
    }
    return d;
  };

  const pivots = zigzag(ele, PIVOT_HYSTERESIS_M);
  const legs: Leg[] = [];
  for (let p = 0; p + 1 < pivots.length; p++) {
    const a = pivots[p];
    const b = pivots[p + 1];
    const up = ele[b] > ele[a];
    const vertical = Math.abs(ele[b] - ele[a]);

    // Trim the flat ends (lift lines, lunch, standing at the top) before measuring rates:
    // the active part starts the last time we're near the start elevation and ends the
    // first time we reach the end elevation.
    let s = a;
    for (let i = a; i <= b; i++) if (Math.abs(ele[i] - ele[a]) < FLAT_TRIM_M) s = i;
    let e = b;
    for (let i = b; i >= s; i--) if (Math.abs(ele[b] - ele[i]) < FLAT_TRIM_M) e = i;
    const activeS = Math.max(1, (points[e].t - points[s].t) / 1000);
    const distanceM = cumDist[e] - cumDist[s];
    const avgSpeed = distanceM / activeS;
    const verticalRate = vertical / activeS;

    let kind: Leg["kind"];
    if (vertical < MIN_LEG_M) kind = "minor";
    else if (up) {
      const grade = vertical / Math.max(pathDistance(s, e), 1);
      if (avgSpeed > UP_DRIVE_MIN_SPEED || (avgSpeed > UP_SLOW_DRIVE_MIN_SPEED && grade < ROAD_MAX_GRADE)) kind = "drive";
      else if (verticalRate >= LIFT_MIN_VERTICAL_RATE) kind = "lift";
      else kind = "skin";
    } else {
      const grade = vertical / Math.max(distanceM, 1);
      kind = (avgSpeed > DRIVE_MIN_SPEED && grade < DRIVE_MAX_GRADE) || avgSpeed > DRIVE_ANY_GRADE_SPEED ? "drive" : "run";
    }

    legs.push({ kind, up, a, b, s, e, verticalM: vertical, distanceM, maxSpeedMps: kind === "run" ? maxSpeedBetween(a, b) : 0, verticalRate });
  }

  // Merge same-kind legs separated only by minor wiggles; minor legs elsewhere are dropped.
  const segments: Segment[] = [];
  const liftRates: number[] = [];
  let pending: Leg[] = [];
  for (const leg of legs) {
    if (leg.kind === "minor") {
      pending.push(leg);
      continue;
    }
    if (leg.kind === "lift") liftRates.push(leg.verticalRate);
    const prev = segments.at(-1);
    if (prev && prev.kind === leg.kind && leg.kind !== "drive") {
      const ascending = leg.kind !== "run";
      for (const m of pending) {
        if (m.up === ascending) prev.verticalM += m.verticalM;
        prev.distanceM += m.distanceM;
      }
      prev.verticalM += leg.verticalM;
      prev.distanceM += leg.distanceM;
      prev.endT = points[leg.e].t;
      prev.endEle = ele[leg.b];
      prev.maxSpeedMps = Math.max(prev.maxSpeedMps, leg.maxSpeedMps);
    } else {
      segments.push({
        kind: leg.kind,
        startT: points[leg.s].t,
        endT: points[leg.e].t,
        startEle: ele[leg.a],
        endEle: ele[leg.b],
        verticalM: leg.verticalM,
        distanceM: leg.distanceM,
        maxSpeedMps: leg.maxSpeedMps,
      });
    }
    pending = [];
  }

  const runs = segments.filter((s) => s.kind === "run");
  const lifts = segments.filter((s) => s.kind === "lift");
  const verticalM = sum(runs.map((s) => s.verticalM));
  const uphillM = sum(segments.filter((s) => s.kind === "skin").map((s) => s.verticalM));
  const maxSpeedMps = Math.max(0, ...runs.map((s) => s.maxSpeedMps));

  const kind: DayKind = lifts.length === 0 ? "backcountry" : uphillM >= MIXED_MIN_UPHILL_M ? "mixed" : "resort";

  const flags: string[] = [];
  if (maxSpeedMps > SUSPICIOUS_SPEED_MPS) flags.push("Top speed is higher than we can verify.");
  if (liftRates.some((r) => r > SUSPICIOUS_LIFT_RATE)) flags.push("A lift climbed faster than any real lift.");
  if (verticalM > SUSPICIOUS_DAY_VERTICAL_M) flags.push("Daily vertical is beyond the world record range.");

  return {
    startedAt: points[0].t,
    endedAt: points[n - 1].t,
    verticalM,
    uphillM,
    distanceM: sum(runs.map((s) => s.distanceM)),
    maxSpeedMps,
    runCount: runs.length,
    liftCount: lifts.length,
    kind,
    segments,
    flags,
    ...dayExtras(segments),
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
