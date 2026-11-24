import { densify, type Terrain } from "./terrain";
import type { MountainData } from "./types";

export interface Named {
  name: string;
  /** OSM piste:difficulty for runs, lift type for lifts */
  difficulty: string | null;
}

const CELL = 120;

/** Nearest named run / lift within `radius` m of a scene position, on a coarse spatial grid. */
export function nameIndex(data: MountainData, terrain: Terrain, radius = 60) {
  const build = (lines: { name: string | null; difficulty: string | null; coords: [number, number][] }[]) => {
    const grid = new Map<string, { item: Named; x: number; z: number }[]>();
    for (const l of lines) {
      if (!l.name) continue;
      const item = { name: l.name, difficulty: l.difficulty };
      for (const [x, z] of densify(
        l.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)),
        15,
      )) {
        const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push({ item, x, z });
      }
    }
    return (x: number, z: number): Named | null => {
      let best: Named | null = null;
      let bestD = radius;
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++)
          for (const v of grid.get(`${cx + dx},${cz + dz}`) ?? []) {
            const d = Math.hypot(v.x - x, v.z - z);
            if (d < bestD) {
              bestD = d;
              best = v.item;
            }
          }
      return best;
    };
  };
  return { run: build(data.runs), lift: build(data.lifts.map((l) => ({ ...l, difficulty: l.type }))) };
}
