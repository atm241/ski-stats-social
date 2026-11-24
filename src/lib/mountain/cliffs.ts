import type { MountainData } from "./types";

export interface RockCell {
  /** scene position of the cell centre (x east, z south) */
  x: number;
  z: number;
  /** real elevation of the rock, m */
  ele: number;
  /** unit vector pointing downhill, in scene x/z */
  downX: number;
  downZ: number;
  steepDeg: number;
  /** vertical extent of the face within the cell, m */
  heightM: number;
  /** height of the whole rock band this cell is part of, following the fall line through rock cells, m */
  bandM: number;
  /** cell index in the cliff grid */
  index: number;
}

/** Decodes the lidar cliff layer (scripts/build-cliffs.ts) and answers "how rocky is it around here?". */
export function cliffIndex(data: MountainData) {
  const cl = data.cliffs;
  const hw = data.grid.widthM / 2;
  const hd = data.grid.depthM / 2;
  if (!cl) {
    const none: (x: number, z: number, radius: number) => number = () => 0;
    const outside: (x: number, z: number) => number = () => -1;
    return { cells: [] as RockCell[], cellSize: 0, rockFraction: none, indexAt: outside };
  }

  const grid = new Uint8Array(cl.cols * cl.rows);
  const cells: RockCell[] = [];
  for (let i = 0; i < cl.items.length; i += 5) {
    const [idx, eleDm, aspect, steepDeg, heightM] = cl.items.slice(i, i + 5);
    grid[idx] = 1;
    const r = Math.floor(idx / cl.cols);
    const c = idx % cl.cols;
    const bearing = (aspect * 10 * Math.PI) / 180; // compass: 0 = north, clockwise
    cells.push({ x: -hw + (c + 0.5) * cl.cellM, z: -hd + (r + 0.5) * cl.cellM, ele: eleDm / 10, downX: Math.sin(bearing), downZ: -Math.cos(bearing), steepDeg, heightM, bandM: heightM, index: idx });
  }
  // Band height: walk up and down the fall line while the cells stay rock; sum their drops.
  const byIndex = new Map(cells.map((c) => [c.index, c]));
  for (const cell of cells) {
    let total = cell.heightM;
    for (const dir of [1, -1]) {
      for (let k = 1; k <= 12; k++) {
        const c = Math.round((cell.x + hw) / cl.cellM - 0.5 + dir * k * cell.downX);
        const r = Math.round((cell.z + hd) / cl.cellM - 0.5 + dir * k * cell.downZ);
        const other = r >= 0 && c >= 0 && r < cl.rows && c < cl.cols ? byIndex.get(r * cl.cols + c) : undefined;
        if (!other) break;
        total += other.heightM;
      }
    }
    cell.bandM = total;
  }

  /** Share of rock cells in the square of half-size `radius` m around a scene position. */
  const rockFraction = (x: number, z: number, radius: number) => {
    const c0 = Math.floor((x - radius + hw) / cl.cellM);
    const c1 = Math.floor((x + radius + hw) / cl.cellM);
    const r0 = Math.floor((z - radius + hd) / cl.cellM);
    const r1 = Math.floor((z + radius + hd) / cl.cellM);
    let n = 0;
    let rock = 0;
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        n++;
        if (r >= 0 && c >= 0 && r < cl.rows && c < cl.cols && grid[r * cl.cols + c]) rock++;
      }
    return n ? rock / n : 0;
  };

  /** cliff-grid index at a scene position (or -1 outside) */
  const indexAt = (x: number, z: number) => {
    const c = Math.floor((x + hw) / cl.cellM);
    const r = Math.floor((z + hd) / cl.cellM);
    return r >= 0 && c >= 0 && r < cl.rows && c < cl.cols ? r * cl.cols + c : -1;
  };

  return { cells, cellSize: cl.cellM, rockFraction, indexAt };
}
