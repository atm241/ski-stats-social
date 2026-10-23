import { readFileSync } from "node:fs";
import { join } from "node:path";
import { haversine, pointInRing } from "../analysis/geo";
import type { Resort } from "./types";

const POINT_RESORT_RADIUS_M = 1500;

let cache: Resort[] | null = null;
function resorts(): Resort[] {
  cache ??= JSON.parse(readFileSync(join(process.cwd(), "data", "resorts.json"), "utf8")) as Resort[];
  return cache;
}

export function resortById(id: string): Resort | undefined {
  return resorts().find((r) => r.id === id);
}

/** The resort containing this point, or the nearest point-only resort within 1.5 km. */
export function resortAt(lat: number, lon: number): Resort | null {
  let nearest: Resort | null = null;
  let nearestDist = POINT_RESORT_RADIUS_M;
  for (const r of resorts()) {
    if (r.rings.length) {
      const [x0, y0, x1, y1] = r.bbox;
      if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      if (r.rings.some((ring) => pointInRing(lon, lat, ring))) return r;
    } else {
      if (Math.abs(r.center[1] - lat) > 0.02 || Math.abs(r.center[0] - lon) > 0.03) continue;
      const d = haversine(lat, lon, r.center[1], r.center[0]);
      if (d < nearestDist) {
        nearest = r;
        nearestDist = d;
      }
    }
  }
  return nearest;
}

/** Most common resort across sample points (majority vote, so a drive past another resort doesn't win). */
export function dominantResort(samples: { lat: number; lon: number }[]): Resort | null {
  const votes = new Map<string, { resort: Resort; n: number }>();
  for (const s of samples) {
    const r = resortAt(s.lat, s.lon);
    if (!r) continue;
    const v = votes.get(r.id) ?? { resort: r, n: 0 };
    v.n++;
    votes.set(r.id, v);
  }
  let best: { resort: Resort; n: number } | null = null;
  for (const v of votes.values()) if (!best || v.n > best.n) best = v;
  return best?.resort ?? null;
}
