import type { StoredTrack } from "./analysis/process";
import type { Segment } from "./analysis/types";
import { nameIndex } from "./mountain/names";
import { createTerrain } from "./mountain/terrain";
import type { MountainData } from "./mountain/types";

/** What a run or lift ride was, matched against the resort's trail map. */
export interface SegmentLabel {
  /** the trail (or lift) you spent most of it on */
  name: string;
  /** every trail along the way, in the order skied, e.g. ["Nabob", "Silver Buck"] */
  names: string[];
  /** difficulty of the main trail (runs), lift type (lifts) */
  difficulty: string | null;
}

/** A trail needs this share of a run's points to be listed in its chain (ignores brief crossings). */
const MIN_SHARE = 0.12;

/**
 * Names each run and lift ride by voting along its GPS points: each point picks the nearest named
 * trail/lift within 60 m. Segments with no nearby named feature get null.
 */
export function labelSegments(track: StoredTrack, segments: Segment[], data: MountainData): (SegmentLabel | null)[] {
  const terrain = createTerrain(data);
  const names = nameIndex(data, terrain);
  const pts = track.pts.map(([dt, lat, lon]) => ({ t: track.t0 + dt * 1000, xz: terrain.toXZ(lon, lat) }));
  let cursor = 0;
  return segments.map((s) => {
    if (s.kind !== "run" && s.kind !== "lift") return null;
    while (cursor < pts.length && pts[cursor].t < s.startT) cursor++;
    const votes = new Map<string, { count: number; first: number; difficulty: string | null }>();
    let n = 0;
    for (let i = cursor; i < pts.length && pts[i].t <= s.endT; i++) {
      n++;
      const hit = (s.kind === "lift" ? names.lift : names.run)(...pts[i].xz);
      if (!hit) continue;
      const v = votes.get(hit.name) ?? { count: 0, first: i, difficulty: hit.difficulty };
      v.count++;
      votes.set(hit.name, v);
    }
    if (!votes.size) return null;
    const ranked = [...votes.entries()].sort((a, b) => b[1].count - a[1].count);
    const [main, mv] = ranked[0];
    const chain =
      s.kind === "lift"
        ? [main]
        : ranked
            .filter(([, v]) => v.count >= Math.max(1, n * MIN_SHARE))
            .sort((a, b) => a[1].first - b[1].first)
            .map(([name]) => name);
    return { name: main, names: chain.length ? chain : [main], difficulty: mv.difficulty };
  });
}
