/** Prebuilt 3D mountain dataset (see scripts/build-mountain.ts). Coordinates are [lon, lat]. */
export interface MountainData {
  slug: string;
  name: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  grid: {
    cols: number;
    rows: number;
    cellM: number;
    widthM: number;
    depthM: number;
    /** meters, row-major from the north-west corner */
    heights: number[];
  };
  runs: { id: number; name: string | null; difficulty: string | null; coords: [number, number][] }[];
  lifts: { id: number; name: string | null; type: string; coords: [number, number][] }[];
  peaks: { name: string; ele: number | null; coord: [number, number] }[];
  attribution: string;
}
