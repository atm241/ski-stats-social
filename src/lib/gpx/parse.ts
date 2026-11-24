import { XMLParser } from "fast-xml-parser";
import type { TrackPoint } from "../analysis/types";

export class GpxError extends Error {}

type Ext = { speed?: string | number; hAcc?: string | number; TrackPointExtension?: { speed?: string | number } };
type RawPoint = { lat?: string; lon?: string; ele?: string | number; time?: string; extensions?: Ext };

/** Fixes worse than this (Apple's hAcc, metres) are dropped: they're the jumps that fake speed records. */
const MAX_H_ACCURACY_M = 50;
type GpxDoc = { gpx?: { trk?: { trkseg?: { trkpt?: RawPoint[] }[] }[] } };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  isArray: (name) => ["trk", "trkseg", "trkpt", "rte", "rtept"].includes(name),
});

/**
 * Parses every track point in a GPX file. Points without elevation or time are dropped,
 * since vertical and lift detection depend on both.
 */
export function parseGpx(xml: string): TrackPoint[] {
  let doc: GpxDoc;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new GpxError("That file isn't valid GPX.");
  }
  if (!doc?.gpx) throw new GpxError("That file isn't a GPX file.");

  const raw: RawPoint[] = [];
  for (const trk of doc.gpx.trk ?? []) for (const seg of trk.trkseg ?? []) for (const p of seg.trkpt ?? []) raw.push(p);

  const points: TrackPoint[] = [];
  for (const p of raw) {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    const ele = Number(p.ele);
    const t = Date.parse(p.time ?? "");
    if (![lat, lon, ele, t].every(Number.isFinite)) continue;
    const ext = p.extensions;
    if (ext && Number(ext.hAcc) > MAX_H_ACCURACY_M) continue;
    // Apple Watch / iPhone routes: <extensions><speed>; Garmin: <gpxtpx:TrackPointExtension><gpxtpx:speed>
    const speed = Number(ext?.speed ?? ext?.TrackPointExtension?.speed);
    points.push(Number.isFinite(speed) && speed >= 0 ? { t, lat, lon, ele, speed } : { t, lat, lon, ele });
  }

  if (points.length === 0) {
    throw new GpxError(
      raw.length ? "This GPX has no timestamps or elevation. Export it with time and altitude included." : "No track points found in this GPX.",
    );
  }

  points.sort((a, b) => a.t - b.t);
  return points.filter((p, i) => i === 0 || p.t > points[i - 1].t);
}
