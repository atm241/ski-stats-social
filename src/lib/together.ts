import type { StoredTrack } from "./analysis/process";
import type { Segment } from "./analysis/types";

/**
 * How much of a day two skiers spent together, from their GPS tracks alone: a lift ride counts when
 * they were within a chair's width of each other for most of it, a run when they stayed within
 * shouting distance for most of it. Works on uploads after the fact, so nobody shares a live location.
 */
export interface Together {
  lifts: number;
  runs: number;
  /** seconds spent on lifts and runs together */
  sharedS: number;
}

const LIFT_M = 40; // same chair or the next one, allowing for two phones' GPS error
const RUN_M = 90; // skiing the same run as a group
const LIFT_SHARE = 0.7;
const RUN_SHARE = 0.6;
const MAX_GAP_S = 90; // don't interpolate across a hole in their track
const MIN_POINTS = 3;

/** Their position at epoch ms `t`, or null if their track doesn't cover that moment. */
export function positionAt(track: StoredTrack, t: number): { lat: number; lon: number } | null {
  const s = (t - track.t0) / 1000;
  const pts = track.pts;
  if (!pts.length || s < pts[0][0] || s > pts[pts.length - 1][0]) return null;
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid][0] <= s) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo];
  const b = pts[Math.min(lo + 1, pts.length - 1)];
  if (b[0] - a[0] > MAX_GAP_S) return null;
  const f = b[0] > a[0] ? (s - a[0]) / (b[0] - a[0]) : 0;
  return { lat: a[1] + (b[1] - a[1]) * f, lon: a[2] + (b[2] - a[2]) * f };
}

export function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110_950);
}

/** Lifts and runs of `mine` that `theirs` was on with them. */
export function togetherness(mine: { track: StoredTrack; segments: Segment[] }, theirs: StoredTrack): Together {
  const out: Together = { lifts: 0, runs: 0, sharedS: 0 };
  const { track } = mine;
  let cursor = 0;
  for (const seg of mine.segments) {
    if (seg.kind !== "run" && seg.kind !== "lift") continue;
    while (cursor < track.pts.length && track.t0 + track.pts[cursor][0] * 1000 < seg.startT) cursor++;
    const limit = seg.kind === "lift" ? LIFT_M : RUN_M;
    let n = 0;
    let close = 0;
    for (let i = cursor; i < track.pts.length; i++) {
      const p = track.pts[i];
      const t = track.t0 + p[0] * 1000;
      if (t > seg.endT) break;
      n++;
      const q = positionAt(theirs, t);
      if (q && metres({ lat: p[1], lon: p[2] }, q) < limit) close++;
    }
    if (n < MIN_POINTS || close / n < (seg.kind === "lift" ? LIFT_SHARE : RUN_SHARE)) continue;
    if (seg.kind === "lift") out.lifts++;
    else out.runs++;
    out.sharedS += (seg.endT - seg.startT) / 1000;
  }
  return out;
}
