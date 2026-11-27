import { describe, expect, it } from "vitest";
import { haversine } from "./analysis/geo";
import type { StoredTrack } from "./analysis/process";
import { parkCityDay } from "./test/fixtures";
import { trimTrackEnds } from "./trackPrivacy";

describe("hiding where a track starts and ends", () => {
  const day = parkCityDay();
  const trimmed = trimTrackEnds(day.track, 400);
  const first = day.track.pts[0];
  const last = day.track.pts[day.track.pts.length - 1];

  it("keeps no point within 400 m of the first or last fix", () => {
    expect(trimmed.pts.length).toBeGreaterThan(day.track.pts.length / 2);
    for (const p of trimmed.pts) {
      expect(haversine(p[1], p[2], first[1], first[2])).toBeGreaterThanOrEqual(400);
      expect(haversine(p[1], p[2], last[1], last[2])).toBeGreaterThanOrEqual(400);
    }
  });

  it("keeps the timeline intact", () => {
    expect(trimmed.t0).toBe(day.track.t0);
    const at = (pt: (typeof trimmed.pts)[number]) => day.track.pts.findIndex((q) => q === pt);
    expect(trimmed.pts.every((p, i) => i === 0 || at(p) === at(trimmed.pts[i - 1]) + 1)).toBe(true);
  });

  it("hides everything when the whole track stays near its start", () => {
    const tiny: StoredTrack = { t0: 0, pts: [[0, 40, -111, 2000], [10, 40.0005, -111, 2000], [20, 40.001, -111, 2000]] };
    expect(trimTrackEnds(tiny, 400).pts).toEqual([]);
  });
});
