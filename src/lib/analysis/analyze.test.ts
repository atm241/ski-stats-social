import { describe, expect, it } from "vitest";
import { parseGpx } from "../gpx/parse";
import { backcountryDay, resortDay, toGpx } from "../sample/generate";
import { seasonKey } from "../season";
import { analyzeDay } from "./analyze";
import { processGpx } from "./process";

const VAIL = { lat: 39.6061, lon: -106.355 };
const start = new Date("2026-01-15T16:00:00Z");

describe("analyzeDay", () => {
  it("counts lifts, runs and vertical on a resort day", () => {
    const day = analyzeDay(resortDay({ ...VAIL, baseEle: 2500, topEle: 3000, laps: 8, start }));
    expect(day.liftCount).toBe(8);
    expect(day.runCount).toBe(8);
    expect(day.verticalM).toBeGreaterThan(4000 * 0.95);
    expect(day.verticalM).toBeLessThan(4000 * 1.05);
    expect(day.uphillM).toBeLessThan(100);
    expect(day.kind).toBe("resort");
    expect(day.flags).toEqual([]);
  });

  it("keeps a run with a small uphill bump as one run", () => {
    const day = analyzeDay(resortDay({ ...VAIL, baseEle: 2500, topEle: 3000, laps: 4, start, bumpyRuns: true }));
    expect(day.runCount).toBe(4);
    expect(day.liftCount).toBe(4);
    // 500 m down per lap plus the 25 m re-descended after each bump
    expect(day.verticalM).toBeGreaterThan(2000 * 0.95);
    expect(day.verticalM).toBeLessThan(2100 * 1.05);
  });

  it("treats human-powered climbs as skinning, not lifts", () => {
    const day = analyzeDay(backcountryDay({ ...VAIL, baseEle: 3000, laps: [{ gain: 600 }, { gain: 400 }], start }));
    expect(day.liftCount).toBe(0);
    expect(day.runCount).toBe(2);
    expect(day.uphillM).toBeGreaterThan(1000 * 0.93);
    expect(day.verticalM).toBeGreaterThan(1000 * 0.93);
    expect(day.verticalM).toBeLessThan(1000 * 1.05);
    expect(day.kind).toBe("backcountry");
  });

  it("ignores driving down a mountain road", () => {
    const day = analyzeDay(resortDay({ ...VAIL, baseEle: 2500, topEle: 3000, laps: 3, start, drive: true }));
    expect(day.segments.some((s) => s.kind === "drive")).toBe(true);
    expect(day.runCount).toBe(3);
    expect(day.verticalM).toBeLessThan(1500 * 1.05);
  });

  it("flags implausible top speeds", () => {
    const day = analyzeDay(resortDay({ ...VAIL, baseEle: 2500, topEle: 3000, laps: 2, start, runSpeed: 50 }));
    expect(day.flags.length).toBeGreaterThan(0);
  });
});

describe("processGpx", () => {
  it("round-trips GPX and matches the resort", () => {
    const xml = toGpx(resortDay({ ...VAIL, baseEle: 2500, topEle: 3000, laps: 3, start }));
    expect(parseGpx(xml).length).toBeGreaterThan(1000);
    const { days } = processGpx(xml);
    expect(days).toHaveLength(1);
    expect(days[0].localDate).toBe("2026-01-15");
    expect(days[0].timezone).toBe("America/Denver");
    expect(days[0].seasonKey).toBe("2025-26");
    expect(days[0].resort?.name).toBe("Vail");
  });

  it("splits a multi-day export into separate days", () => {
    const d1 = resortDay({ ...VAIL, baseEle: 2500, topEle: 3000, laps: 2, start });
    const d2 = resortDay({ ...VAIL, baseEle: 2500, topEle: 3000, laps: 2, start: new Date("2026-01-16T16:00:00Z") });
    expect(processGpx(toGpx([...d1, ...d2])).days.map((d) => d.localDate)).toEqual(["2026-01-15", "2026-01-16"]);
  });

  it("rejects files without timestamps", () => {
    expect(() => parseGpx(`<gpx><trk><trkseg><trkpt lat="1" lon="2"><ele>3</ele></trkpt></trkseg></trk></gpx>`)).toThrow(/timestamps/);
  });
});

describe("seasonKey", () => {
  it("runs July to June", () => {
    expect(seasonKey("2026-01-10", 40)).toBe("2025-26");
    expect(seasonKey("2026-11-20", 40)).toBe("2026-27");
    expect(seasonKey("2026-06-20", 40)).toBe("2025-26");
  });
  it("keeps a southern-hemisphere winter in one season", () => {
    expect(seasonKey("2026-06-20", -44)).toBe("2026-27");
    expect(seasonKey("2026-09-01", -44)).toBe("2026-27");
  });
});
