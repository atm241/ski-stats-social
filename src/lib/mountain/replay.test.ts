import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { processGpx } from "../analysis/process";
import { mountainDay } from "../sample/mountainDay";
import { toGpx } from "../sample/generate";
import { buildTimeline, indexAt } from "./replay";
import { createTerrain } from "./terrain";
import type { MountainData } from "./types";

const dv = JSON.parse(readFileSync(join(__dirname, "../../../public/mountains/deer-valley.json"), "utf8")) as MountainData;

describe("buildTimeline", () => {
  const { points: gps, itinerary } = mountainDay(dv, { start: new Date("2026-02-14T16:00:00Z"), seed: 7, laps: 8 });
  const day = processGpx(toGpx(gps)).days[0];
  const tl = buildTimeline(day.track, day.stats.segments, createTerrain(dv), dv);

  it("compresses idle time far more than skiing", () => {
    const realS = (tl.points.at(-1)!.t - tl.points[0].t) / 1000;
    expect(tl.rawLength).toBeLessThan(realS * 0.6);
    const skiShare = tl.points.reduce((acc, pt, i) => acc + (i && pt.activity === "run" ? pt.p - tl.points[i - 1].p : 0), 0) / tl.rawLength;
    expect(skiShare).toBeGreaterThan(0.4); // lunch and lift lines barely register
  });

  it("ends on the day's official vertical", () => {
    expect(tl.points.at(-1)!.verticalM).toBeCloseTo(day.stats.verticalM, 0);
  });

  it("names the lifts and runs actually used", () => {
    const lifts = new Set(itinerary.filter((s) => s.kind === "lift").map((s) => s.name));
    const seen = new Set(tl.points.filter((p) => p.activity === "lift" && p.place).map((p) => p.place));
    expect([...seen].filter((n) => lifts.has(n!)).length).toBeGreaterThanOrEqual(Math.min(3, lifts.size));
    expect(tl.points.some((p) => p.activity === "run" && p.place)).toBe(true);
  });

  it("finds the frame for a playback time", () => {
    const mid = tl.rawLength / 2;
    const i = indexAt(tl.points, mid);
    expect(tl.points[i].p).toBeLessThanOrEqual(mid);
    expect(tl.points[i + 1].p).toBeGreaterThan(mid);
  });
});
