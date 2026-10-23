import { describe, expect, it } from "vitest";
import { longestStreak, totals } from "../days";
import { backcountryDay, resortDay } from "../sample/generate";
import { analyzeDay } from "./analyze";

const VAIL = { lat: 39.6061, lon: -106.355 };
const start = new Date("2026-01-15T16:00:00Z");

describe("day extras", () => {
  it("splits a resort day into skiing, lifts and lift lines", () => {
    const day = analyzeDay(resortDay({ ...VAIL, baseEle: 2500, topEle: 3000, laps: 6, start, seed: 3 }));
    expect(day.skiTimeS).toBeGreaterThan(0);
    expect(day.liftTimeS).toBeGreaterThan(day.skiTimeS); // chairs are slower than skiing down
    // Generator waits 2–7 min per lift line; the first lift has no run before it, lunch is excluded.
    expect(day.liftWaitS).toBeGreaterThan(5 * 100);
    expect(day.liftWaitS).toBeLessThan(5 * 450);
    expect(day.skinTimeS).toBe(0);
    expect(day.tallestRunM).toBeGreaterThan(470);
    expect(day.tallestRunM).toBeLessThan(530);
    expect(day.peakEleM).toBeGreaterThan(2980);
    expect(day.peakEleM).toBeLessThan(3020);
    expect(day.longestRunM).toBeGreaterThan(900);
  });

  it("times skinning on a backcountry day", () => {
    const day = analyzeDay(backcountryDay({ ...VAIL, baseEle: 3000, laps: [{ gain: 600 }], start }));
    const paceFtPerHr = (day.uphillM * 3.28084) / (day.skinTimeS / 3600);
    expect(day.liftTimeS).toBe(0);
    // generator climbs at ~1,200–1,600 ft/hr
    expect(paceFtPerHr).toBeGreaterThan(1100);
    expect(paceFtPerHr).toBeLessThan(1800);
  });
});

describe("season helpers", () => {
  const d = (localDate: string, verticalM = 1000) => ({ localDate, verticalM, uphillM: 0, resortId: "r", kind: "resort", distanceM: 0, skiTimeS: 0 });

  it("finds the longest streak of consecutive days", () => {
    expect(longestStreak([d("2026-01-01"), d("2026-01-02"), d("2026-01-05"), d("2026-01-06"), d("2026-01-07")])).toEqual({ length: 3, from: "2026-01-05", to: "2026-01-07" });
    expect(longestStreak([]).length).toBe(0);
  });

  it("sums two uploads on the same date into one best day", () => {
    expect(totals([d("2026-01-01", 1000), d("2026-01-01", 1500), d("2026-01-02", 2000)]).bestDayM).toBe(2500);
  });
});
