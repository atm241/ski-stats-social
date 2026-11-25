import type { StoredTrack } from "./analysis/process";
import type { Segment } from "./analysis/types";
import type { MountainData } from "./mountain/types";
import { indexFor, labelSegments } from "./trails";

/** Splits a day into its named runs, and each run into the trails it went down (pure, for tests). */

export interface RunRow {
  index: number;
  trail: string;
  trails: string[];
  difficulty: string | null;
  startedAt: Date;
  durationS: number;
  verticalM: number;
  maxSpeedMps: number;
  /** each trail along the way, with the top speed while on it */
  onTrails: { trail: string; maxSpeedMps: number; share: number }[];
}

const SPEED_SPAN = 2; // points either side for a speed estimate (smooths GPS jitter)

/** The named runs of a day (unnamed runs and lifts are skipped). */
export function runRows(track: StoredTrack, segments: Segment[], data: MountainData): RunRow[] {
  const labels = labelSegments(track, segments, data);
  const { terrain, names } = indexFor(data);
  const pts = track.pts.map(([dt, lat, lon]) => ({ t: track.t0 + dt * 1000, xz: terrain.toXZ(lon, lat) }));
  const speedAt = (i: number) => {
    const a = pts[Math.max(0, i - SPEED_SPAN)];
    const b = pts[Math.min(pts.length - 1, i + SPEED_SPAN)];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? Math.hypot(b.xz[0] - a.xz[0], b.xz[1] - a.xz[1]) / dt : 0;
  };
  let cursor = 0;
  return segments.flatMap((s, i) => {
    while (cursor < pts.length && pts[cursor].t < s.startT) cursor++;
    const l = labels[i];
    if (s.kind !== "run" || !l) return [];
    const per = new Map<string, { max: number; n: number }>(l.names.map((n) => [n, { max: 0, n: 0 }]));
    let total = 0;
    for (let k = cursor; k < pts.length && pts[k].t <= s.endT; k++) {
      total++;
      const on = per.get(names.run(...pts[k].xz)?.name ?? "");
      if (!on) continue;
      on.n++;
      on.max = Math.max(on.max, speedAt(k));
    }
    // never report more than the run's own top speed, which comes from the full-resolution track
    const onTrails = [...per].map(([trail, v]) => ({ trail, maxSpeedMps: Math.min(v.max, s.maxSpeedMps), share: total ? v.n / total : 0 }));
    return [{ index: i, trail: l.name, trails: l.names, difficulty: l.difficulty, startedAt: new Date(s.startT), durationS: (s.endT - s.startT) / 1000, verticalM: s.verticalM, maxSpeedMps: s.maxSpeedMps, onTrails }];
  });
}
