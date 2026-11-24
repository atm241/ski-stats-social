import type { MountainData } from "./types";

/**
 * Maps real-world coordinates onto the 3D scene. Scene units are meters:
 * x grows east, z grows south (so north is -z), y is height above the lowest point × exaggeration.
 * Shared by the mountain viewer and (later) the day replay, so a GPS track lands exactly on the terrain.
 */
export function createTerrain(data: MountainData, exaggeration = 1.25) {
  const { cols, rows, widthM, depthM, heights } = data.grid;
  const [west, south, east, north] = data.bbox;
  let minEle = Infinity;
  let maxEle = -Infinity;
  for (const h of heights) {
    if (h < minEle) minEle = h;
    if (h > maxEle) maxEle = h;
  }

  const toXZ = (lon: number, lat: number): [number, number] => [((lon - west) / (east - west) - 0.5) * widthM, ((north - lat) / (north - south) - 0.5) * depthM];

  /** Real elevation in meters at a scene position, bilinearly interpolated and clamped to the grid. */
  const elevationAt = (x: number, z: number) => {
    const fc = Math.min(cols - 1, Math.max(0, (x / widthM + 0.5) * (cols - 1)));
    const fr = Math.min(rows - 1, Math.max(0, (z / depthM + 0.5) * (rows - 1)));
    const c0 = Math.min(cols - 2, Math.floor(fc));
    const r0 = Math.min(rows - 2, Math.floor(fr));
    const tc = fc - c0;
    const tr = fr - r0;
    const h = (r: number, c: number) => heights[r * cols + c];
    const top = h(r0, c0) * (1 - tc) + h(r0, c0 + 1) * tc;
    const bottom = h(r0 + 1, c0) * (1 - tc) + h(r0 + 1, c0 + 1) * tc;
    return top * (1 - tr) + bottom * tr;
  };

  const yForElevation = (ele: number) => (ele - minEle) * exaggeration;
  const yAt = (x: number, z: number) => yForElevation(elevationAt(x, z));

  return { cols, rows, widthM, depthM, minEle, maxEle, exaggeration, toXZ, elevationAt, yAt, yForElevation };
}

export type Terrain = ReturnType<typeof createTerrain>;

/** Resamples a 2D polyline so consecutive points are at most `step` apart. */
export function densify(points: [number, number][], step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i];
    const [x1, z1] = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  if (points.length) out.push(points[points.length - 1]);
  return out;
}
