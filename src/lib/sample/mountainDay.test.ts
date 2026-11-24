import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeDay } from "../analysis/analyze";
import type { MountainData } from "../mountain/types";
import { mountainDay } from "./mountainDay";

const dv = JSON.parse(readFileSync(join(__dirname, "../../../public/mountains/deer-valley.json"), "utf8")) as MountainData;
const start = new Date("2026-02-14T16:00:00Z");

describe("mountainDay on Deer Valley", () => {
  it("rides real lifts and skis real runs", () => {
    const { itinerary } = mountainDay(dv, { start, seed: 3, laps: 8 });
    const liftNames = new Set(dv.lifts.map((l) => l.name));
    expect(itinerary.filter((s) => s.kind === "lift")).toHaveLength(8);
    expect(itinerary.filter((s) => s.kind === "lift").every((s) => liftNames.has(s.name))).toBe(true);
    expect(itinerary.filter((s) => s.kind === "run").length).toBeGreaterThanOrEqual(8);
  });

  it("is read back by the analysis as the same lifts and descents", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { points, itinerary } = mountainDay(dv, { start, seed, laps: 8 });
      const day = analyzeDay(points);
      const rides = itinerary.filter((s) => s.kind === "lift").length;
      expect(day.liftCount, `seed ${seed}`).toBe(rides);
      expect(day.runCount, `seed ${seed}`).toBeGreaterThanOrEqual(rides - 1);
      expect(day.flags, `seed ${seed}`).toEqual([]);
      expect(day.kind).toBe("resort");
    }
  });
});
