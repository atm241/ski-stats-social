import type { createTerrain } from "../../src/lib/mountain/terrain";
import type { MountainData } from "../../src/lib/mountain/types";
import type { LandmarkSpec } from "../mountains.config";

/**
 * Picks landmarks for a mountain nobody has curated yet: the named expert / off-piste runs that cut
 * through the most lidar rock (the "iconic steeps"), at least 400 m apart, plus the highest named peak.
 */
export function autoLandmarks(data: MountainData, terrain: ReturnType<typeof createTerrain>): LandmarkSpec[] {
  const out: LandmarkSpec[] = [];
  const cl = data.cliffs;
  if (cl) {
    const hw = data.grid.widthM / 2;
    const hd = data.grid.depthM / 2;
    const rock = new Set<number>();
    for (let i = 0; i < cl.items.length; i += 5) rock.add(cl.items[i]);
    const rockNear = (x: number, z: number) => {
      let n = 0;
      const c0 = Math.floor((x + hw) / cl.cellM);
      const r0 = Math.floor((z + hd) / cl.cellM);
      for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) if (rock.has((r0 + dr) * cl.cols + c0 + dc)) n++;
      return n;
    };
    const steep = new Set(["advanced", "expert", "freeride", "extreme"]);
    const scored = new Map<string, { score: number; at: [number, number] }>();
    for (const r of data.runs) {
      if (!r.name || !steep.has(r.difficulty ?? "") || /traverse|road|trail|cat ?track|access/i.test(r.name)) continue;
      let score = 0;
      for (const c of r.coords) score += rockNear(...terrain.toXZ(c[0], c[1]));
      const prev = scored.get(r.name);
      if (!prev || score > prev.score) scored.set(r.name, { score, at: r.coords[Math.floor(r.coords.length / 2)] });
    }
    const metres = (a: [number, number], b: [number, number]) => {
      const [ax, az] = terrain.toXZ(a[0], a[1]);
      const [bx, bz] = terrain.toXZ(b[0], b[1]);
      return Math.hypot(ax - bx, az - bz);
    };
    for (const [name, v] of [...scored.entries()].sort((a, b) => b[1].score - a[1].score)) {
      if (v.score < 10) break;
      if (out.some((o) => metres(o.at!, v.at) < 400)) continue;
      out.push({ name, kind: "cliff", at: v.at });
      if (out.length === 4) break;
    }
  }
  // the highest named peak that the resort actually skis (within 800 m of a run), not a summit next door
  const runPts = data.runs.flatMap((r) => r.coords.filter((_, i) => i % 4 === 0).map((c) => terrain.toXZ(c[0], c[1])));
  const nearRuns = (c: [number, number]) => {
    const [x, z] = terrain.toXZ(c[0], c[1]);
    return runPts.some(([rx, rz]) => Math.hypot(rx - x, rz - z) < 800);
  };
  const peak = [...data.peaks].filter((p) => p.ele && nearRuns(p.coord)).sort((a, b) => b.ele! - a.ele!)[0];
  if (peak) out.push({ name: peak.name, kind: "peak", peak: peak.name });
  return out;
}
