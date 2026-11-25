import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { processGpx } from "./analysis/process";
import type { MountainData } from "./mountain/types";
import { runRows } from "./runRows";
import { toGpx } from "./sample/generate";
import { plannedDay } from "./sample/plannedDay";
import { PLANS } from "./sample/plans";

describe("run rows", () => {
  const plan = PLANS["park-city-jupiter-to-canyons"];
  const data = JSON.parse(readFileSync(`public/mountains/${plan.mountain}.json`, "utf8")) as MountainData;
  const day = processGpx(toGpx(plannedDay(data, { start: new Date("2026-03-13T16:00:00Z"), seed: 5, plan: plan.plan, endAt: plan.endAt }).points)).days[0];
  const rows = runRows(day.track, day.stats.segments, data);

  it("names the day's runs from the trail map", () => {
    expect(rows.length).toBeGreaterThanOrEqual(day.stats.runCount - 3);
    expect(rows.flatMap((r) => r.trails)).toContain("McConkey's Bowl");
  });

  it("credits each trail with the top speed while on it, never more than the run's", () => {
    const viaMcConkeys = rows.find((r) => r.trails.includes("McConkey's Bowl"))!;
    const onIt = viaMcConkeys.onTrails.find((o) => o.trail === "McConkey's Bowl")!;
    expect(onIt.maxSpeedMps).toBeGreaterThan(3);
    expect(onIt.maxSpeedMps).toBeLessThanOrEqual(viaMcConkeys.maxSpeedMps);
    expect(onIt.share).toBeGreaterThan(0);
    for (const r of rows) expect(r.onTrails.map((o) => o.trail)).toEqual(r.trails);
  });

});
