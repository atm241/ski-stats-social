import type { PlanStep } from "./plannedDay";

/**
 * Hand-written demo days on real terrain, for showing off specific parts of a mountain in the replay.
 */
export const PLANS: Record<string, { mountain: string; endAt?: string; plan: PlanStep[] }> = {
  /** Keystone: Outback laps, the Wapiti Peak boot pack to South Bowl and Puma Bowl, then A51 park laps. */
  "keystone-outback-a51": {
    mountain: "keystone",
    endAt: "River Run Gondola",
    plan: [
      { lift: "River Run Gondola" },
      { lift: "Outback Express" },
      { run: "Wildfire" },
      { lift: "Outback Express" },
      { run: "Bushwhacker" },
      { lift: "Outback Express" },
      { hike: "Wapiti Peak Hike", to: "South bowl" },
      { run: "South bowl" },
      { lift: "Outback Express" },
      { hike: "Wapiti Peak Hike", to: "Puma Bowl" },
      { run: "Puma Bowl" },
      { lift: "Outpost Gondola" },
      { rest: 50 }, // lunch at the summit
      { lift: "A-51" },
      { park: "Main Street" },
      { lift: "A-51" },
      { park: "Main Street" },
      { lift: "A-51" },
      { park: "Park Lane" },
      { lift: "A-51" },
      { park: "The Alley" },
    ],
  },
  /** Park City end to end: up to Jupiter for the high bowls, across Quicksilver, Canyons summit laps, out at Canyons Village. */
  "park-city-jupiter-to-canyons": {
    mountain: "park-city",
    endAt: "Orange Bubble Express", // Canyons Village base
    plan: [
      { lift: "Crescent Hi-Speed Quad" },
      { lift: "Bonanza Hi-Speed Six-Pack" },
      { lift: "McConkey's Hi-Speed Six-Pack" },
      { run: "McConkey's Bowl" },
      { lift: "Jupiter Lift" },
      { run: "Main Bowl" },
      { lift: "Jupiter Lift" },
      { run: "Fortune Teller" },
      { lift: "Jupiter Lift" },
      { run: "Portuguse Gap" }, // sic, as mapped
      { lift: "McConkey's Hi-Speed Six-Pack" },
      { run: "Georgeanna" },
      { rest: 45 }, // lunch at Mid-Mountain Lodge
      { lift: "Quicksilver Gondola" },
      { lift: "Dreamscape" },
      { run: "Pipe Dream" },
      { lift: "Ninety-Nine 90 Express" },
      { run: "Fantasy Ridge" },
      { lift: "Ninety-Nine 90 Express" },
      { run: "Moraine" },
      { lift: "Super Condor Express" },
      { run: "Boa" },
    ],
  },
};
