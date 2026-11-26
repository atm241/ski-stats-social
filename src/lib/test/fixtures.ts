import { readFileSync } from "node:fs";
import { processGpx } from "../analysis/process";
import type { MountainData } from "../mountain/types";
import { toGpx } from "../sample/generate";
import { plannedDay } from "../sample/plannedDay";
import { PLANS } from "../sample/plans";

/** Test fixtures that need no database. */

const plan = PLANS["park-city-jupiter-to-canyons"];
let parkCity: MountainData | undefined;
export const parkCityData = () => (parkCity ??= JSON.parse(readFileSync(`public/mountains/${plan.mountain}.json`, "utf8")) as MountainData);

/** A realistic Park City day (named runs incl. McConkey's Bowl), processed like a real upload. */
export function parkCityDay(start = "2026-03-13T16:00:00Z", seed = 5) {
  return processGpx(toGpx(plannedDay(parkCityData(), { start: new Date(start), seed, plan: plan.plan, endAt: plan.endAt }).points)).days[0];
}

