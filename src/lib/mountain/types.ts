/** Prebuilt 3D mountain dataset (see scripts/build-mountain.ts). Coordinates are [lon, lat]. */
export type ParkLine = "jumps" | "jibs" | "mixed";

export interface MountainData {
  slug: string;
  /** display name, e.g. "Snowbird & Alta" */
  name: string;
  /** resort names (data/resorts.json) this mountain covers, so their ski days link to its replay */
  resorts?: string[];
  /** spots the viewer can fly to (scripts/mountains.config.ts) */
  landmarks?: { name: string; kind: "cliff" | "park" | "pipe" | "peak"; coord: [number, number] }[];
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
  /** Satellite-derived forest (scripts/build-forest.ts); absent → trees are placed heuristically. */
  forest?: {
    cellM: number;
    cols: number;
    rows: number;
    /** one char per cell, row-major from the north-west corner: "0" open, "1" evergreen, "2" aspen, "3" scrub oak/maple */
    cells: string;
    /** canopy height per cell in 2 m steps, one base-36 digit ("0" when open) */
    heights: string;
    source: string;
  };
  /** Terrain parks and halfpipes (scripts/build-parks.ts): downhill centrelines, [lon, lat]. */
  /**
   * Terrain parks and halfpipes as downhill centrelines. `line` says what's on a park:
   * a jump line (kickers), a jib line (boxes and rails), or a mix (default).
   */
  parks?: { name: string | null; kind: "park" | "pipe"; coords: [number, number][]; line?: ParkLine }[];
  /** marked boot-pack / hike-to routes (OSM piste:type=hike), bottom → top */
  hikes?: { name: string | null; coords: [number, number][] }[];
  /** Lidar-derived exposed rock (scripts/build-cliffs.ts). */
  cliffs?: {
    cellM: number;
    cols: number;
    rows: number;
    /** 5 ints per rock cell: [cell index (row-major from NW), elevation dm, downhill aspect in 10° steps from north, steepness °, face height m] */
    items: number[];
  };
  attribution: string;
}
