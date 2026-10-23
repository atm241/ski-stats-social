import { parseGpx } from "../gpx/parse";
import { dominantResort } from "../resorts/match";
import { localDate, seasonKey, timezoneAt } from "../season";
import { analyzeDay } from "./analyze";
import type { DayStats, TrackPoint } from "./types";

const MIN_POINTS = 60;
const MIN_DURATION_MS = 10 * 60 * 1000;
const STORED_TRACK_POINTS = 2000;

export interface StoredTrack {
  /** epoch ms of the first point */
  t0: number;
  /** [secondsSinceT0, lat, lon, ele] */
  pts: [number, number, number, number][];
}

export interface ProcessedDay {
  localDate: string;
  seasonKey: string;
  timezone: string;
  stats: DayStats;
  resort: { id: string; name: string; country: string | null } | null;
  track: StoredTrack;
}

export interface ProcessResult {
  days: ProcessedDay[];
  skipped: string[];
}

export function processGpx(xml: string): ProcessResult {
  const points = parseGpx(xml);
  const timezone = timezoneAt(points[0].lat, points[0].lon);

  // A single export can span several days (e.g. a trip); split on local calendar date.
  const byDate = new Map<string, TrackPoint[]>();
  for (const p of points) {
    const d = localDate(p.t, timezone);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(p);
  }

  const result: ProcessResult = { days: [], skipped: [] };
  for (const [date, pts] of byDate) {
    if (pts.length < MIN_POINTS || pts.at(-1)!.t - pts[0].t < MIN_DURATION_MS) {
      result.skipped.push(`${date}: too short to be a ski day`);
      continue;
    }
    const stats = analyzeDay(pts);
    if (stats.runCount === 0) {
      result.skipped.push(`${date}: no downhill runs found`);
      continue;
    }

    const samples = pts.filter((p, i) => i % 30 === 0 && stats.segments.some((s) => s.kind !== "drive" && p.t >= s.startT && p.t <= s.endT));
    const resort = stats.kind === "backcountry" ? null : dominantResort(samples);

    result.days.push({
      localDate: date,
      seasonKey: seasonKey(date, pts[0].lat),
      timezone,
      stats,
      resort: resort && { id: resort.id, name: resort.name, country: resort.country },
      track: downsample(pts),
    });
  }
  return result;
}

function downsample(pts: TrackPoint[]): StoredTrack {
  const step = Math.max(1, Math.ceil(pts.length / STORED_TRACK_POINTS));
  const t0 = pts[0].t;
  const out: StoredTrack["pts"] = [];
  for (let i = 0; i < pts.length; i += step) {
    const p = pts[i];
    out.push([Math.round((p.t - t0) / 1000), +p.lat.toFixed(5), +p.lon.toFixed(5), Math.round(p.ele)]);
  }
  return { t0, pts: out };
}
