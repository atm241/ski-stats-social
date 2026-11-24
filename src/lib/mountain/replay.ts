import type { StoredTrack } from "../analysis/process";
import type { Segment, SegmentKind } from "../analysis/types";
import { densify, type Terrain } from "./terrain";
import type { MountainData } from "./types";

/*
 * Turns a stored ski day into a replay timeline on a 3D mountain. Real time is compressed with
 * per-activity weights, so skiing plays at full weight, lifts faster, and standing around
 * (lift lines, lunch) nearly vanishes; the whole day then fits a chosen video length.
 */

export type Activity = SegmentKind | "idle";

/** Relative playback weight of one real second of each activity. */
const WEIGHT: Record<Activity, number> = { run: 1, skin: 0.6, lift: 0.3, drive: 0.12, idle: 0.04 };
const CABLE_CLEARANCE = 30; // matches buildScene
const CHAIR_DROP = 13; // rider hangs below the cable
const NAME_RADIUS_M = 60;

export interface ReplayPoint {
  x: number;
  y: number;
  z: number;
  /** real epoch ms */
  t: number;
  /** playback seconds from the start, before scaling to the target length */
  p: number;
  activity: Activity;
  /** run or lift name at this moment, if we could match one */
  place: string | null;
  /** vertical skied so far, meters */
  verticalM: number;
  /** index of the segment this point belongs to, or -1 */
  segment: number;
}

export interface Timeline {
  points: ReplayPoint[];
  /** unscaled playback length; multiply by scale to get seconds */
  rawLength: number;
  runCount: number;
}

export function buildTimeline(track: StoredTrack, segments: Segment[], terrain: Terrain, data: MountainData): Timeline {
  const raw = track.pts.map(([dt, lat, lon, ele]) => ({ t: track.t0 + dt * 1000, xz: terrain.toXZ(lon, lat), ele }));
  // Light smoothing of position so GPS jitter doesn't make the skier twitch.
  const xz = raw.map((_, i) => {
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k++) {
      sx += raw[k].xz[0];
      sz += raw[k].xz[1];
      n++;
    }
    return [sx / n, sz / n] as [number, number];
  });

  const segOf = (t: number) => segments.findIndex((s) => t >= s.startT && t <= s.endT);
  const names = nameIndex(data, terrain);

  const points: ReplayPoint[] = [];
  let p = 0;
  let vertical = 0;
  const runsCompleted = new Set<number>();
  raw.forEach((r, i) => {
    const seg = segOf(r.t);
    const activity: Activity = seg >= 0 ? segments[seg].kind : "idle";
    const [x, z] = xz[i];
    let y = terrain.yAt(x, z);
    if (activity === "lift") {
      const s = segments[seg];
      const f = (r.t - s.startT) / Math.max(1, s.endT - s.startT);
      const cable = terrain.yForElevation(s.startEle + (s.endEle - s.startEle) * f) + CABLE_CLEARANCE;
      y = Math.max(cable, y + CABLE_CLEARANCE) - CHAIR_DROP;
    }
    if (i > 0) {
      p += ((r.t - raw[i - 1].t) / 1000) * WEIGHT[activity];
      if (activity === "run") vertical += Math.max(0, raw[i - 1].ele - r.ele);
    }
    if (activity === "run") runsCompleted.add(seg);
    const place = activity === "lift" ? names.lift(x, z) : activity === "run" ? names.run(x, z) : null;
    points.push({ x, y, z, t: r.t, p, activity, place, verticalM: vertical, segment: seg });
  });

  // Snap the running vertical to the analysed per-run totals at the end of each run, so the
  // counter finishes exactly on the day's official number.
  const official = segments.filter((s) => s.kind === "run").reduce((a, s) => a + s.verticalM, 0);
  const scale = vertical > 0 ? official / vertical : 1;
  for (const pt of points) pt.verticalM *= scale;

  return { points, rawLength: p, runCount: runsCompleted.size };
}

/** Index of the last point at or before playback position `p` (binary search). */
export function indexAt(points: ReplayPoint[], p: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].p <= p) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Nearest named run / lift lookups on a coarse spatial grid. */
function nameIndex(data: MountainData, terrain: Terrain) {
  const CELL = 120;
  const build = (lines: { name: string | null; coords: [number, number][] }[]) => {
    const grid = new Map<string, { name: string; x: number; z: number }[]>();
    for (const l of lines) {
      if (!l.name) continue;
      for (const [x, z] of densify(
        l.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)),
        15,
      )) {
        const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push({ name: l.name, x, z });
      }
    }
    return (x: number, z: number) => {
      let best: string | null = null;
      let bestD = NAME_RADIUS_M;
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const v of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
            const d = Math.hypot(v.x - x, v.z - z);
            if (d < bestD) {
              bestD = d;
              best = v.name;
            }
          }
      return best;
    };
  };
  return { run: build(data.runs), lift: build(data.lifts) };
}
