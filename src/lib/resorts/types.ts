export interface Resort {
  id: string;
  name: string;
  country: string | null;
  region: string | null;
  /** [lon, lat] */
  center: [number, number];
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: [number, number, number, number];
  /** Simplified outer boundary rings as [lon, lat]; empty when OpenSkiMap only has a point. */
  rings: [number, number][][];
  minEle: number | null;
  maxEle: number | null;
}
