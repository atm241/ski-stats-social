import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeDay } from "./analysis/analyze";
import type { StoredTrack } from "./analysis/process";
import type { MountainData } from "./mountain/types";
import { mountainDay } from "./sample/mountainDay";
import { labelSegments } from "./trails";

const dv = JSON.parse(readFileSync(join(__dirname, "../../public/mountains/deer-valley.json"), "utf8")) as MountainData;

describe("labelSegments", () => {
  it("names each lift ride the lift the skier actually rode, and runs real trails", () => {
    for (const seed of [1, 2, 3]) {
      const { points, itinerary } = mountainDay(dv, { start: new Date("2026-02-14T16:00:00Z"), seed, laps: 8 });
      const day = analyzeDay(points);
      const t0 = points[0].t;
      const track: StoredTrack = { t0, pts: points.map((p) => [(p.t - t0) / 1000, p.lat, p.lon, p.ele]) };
      const labels = labelSegments(track, day.segments, dv);

      const rode = itinerary.filter((s) => s.kind === "lift").map((s) => s.name);
      const named = day.segments.flatMap((s, i) => (s.kind === "lift" ? [labels[i]?.name] : []));
      expect(named, `seed ${seed}`).toEqual(rode);

      const skied = new Set(itinerary.filter((s) => s.kind === "run").map((s) => s.name));
      const runLabels = day.segments.flatMap((s, i) => (s.kind === "run" ? [labels[i]] : []));
      expect(runLabels.every((l) => l && skied.has(l.name)), `seed ${seed}`).toBe(true);
      expect(runLabels.every((l) => l!.difficulty !== undefined)).toBe(true);
    }
  });
});
