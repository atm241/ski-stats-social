import { haversine } from "./analysis/geo";
import type { StoredTrack } from "./analysis/process";

/** How far from where a recording starts and ends the track stays hidden from other people. */
export const HIDDEN_END_M = 400;

/**
 * The track without its first and last `radius` metres as the crow flies: points are dropped until
 * the skier is that far from the first fix, and again from the last fix backwards, so the start and
 * end (home, a hotel, the car) can't be read off a map or a replay. Times stay as recorded.
 */
export function trimTrackEnds(track: StoredTrack, radius = HIDDEN_END_M): StoredTrack {
  const { pts } = track;
  if (pts.length < 2) return { ...track, pts: [] };
  const far = (a: (typeof pts)[number], b: (typeof pts)[number]) => haversine(a[1], a[2], b[1], b[2]) >= radius;
  let from = 0;
  while (from < pts.length && !far(pts[0], pts[from])) from++;
  let to = pts.length - 1;
  while (to >= 0 && !far(pts[pts.length - 1], pts[to])) to--;
  if (from > to) return { ...track, pts: [] };
  return { ...track, pts: pts.slice(from, to + 1) };
}
