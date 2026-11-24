import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeDay } from "../analysis/analyze";
import type { MountainData } from "../mountain/types";
import { plannedDay } from "./plannedDay";
import { PLANS } from "./plans";

describe("planned demo day", () => {
  const plan = PLANS["keystone-outback-a51"];
  const data = JSON.parse(readFileSync(`public/mountains/${plan.mountain}.json`, "utf8")) as MountainData;
  const day = plannedDay(data, { start: new Date("2026-02-07T16:00:00Z"), seed: 3, plan: plan.plan, endAt: plan.endAt });

  it("follows the plan, routing between steps over real lifts and runs", () => {
    const names = day.itinerary.map((s) => `${s.kind}:${s.name}`);
    for (const step of ["lift:Outback Express", "run:Puma Bowl", "run:South bowl", "lift:A-51", "run:Main Street", "run:The Alley"]) expect(names).toContain(step);
    expect(names[0]).toBe("lift:River Run Gondola");
  });

  it("reads back as a ski day with the boot packs as climbs", () => {
    const st = analyzeDay(day.points);
    expect(st.liftCount).toBeGreaterThanOrEqual(9);
    expect(st.segments.some((s) => s.kind === "skin")).toBe(true);
    expect(st.verticalM).toBeGreaterThan(3000);
  });
});
