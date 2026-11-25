import { describe, expect, it } from "vitest";
import type { StoredTrack } from "./analysis/process";
import type { Segment } from "./analysis/types";
import { togetherness } from "./together";

// A day of one lift (north, 0–300 s) then one run (back south, 300–500 s), 5 s points.
const T0 = Date.UTC(2026, 1, 1, 16);
const LAT = 40.6;
const LON = -111.5;
const M_LAT = 1 / 110_950;
const M_LON = 1 / (111_320 * Math.cos((LAT * Math.PI) / 180));

function day(offsetEastM: number, delayS = 0): StoredTrack {
  const pts: StoredTrack["pts"] = [];
  for (let s = 0; s <= 500; s += 5) {
    const north = s <= 300 ? s * 4 : 1200 - (s - 300) * 6; // up the lift, then ski back down
    pts.push([s + delayS, LAT + north * M_LAT, LON + offsetEastM * M_LON, 2500]);
  }
  return { t0: T0, pts };
}
const seg = (kind: Segment["kind"], a: number, b: number): Segment => ({ kind, startT: T0 + a * 1000, endT: T0 + b * 1000, startEle: 0, endEle: 0, verticalM: 300, distanceM: 1000, maxSpeedMps: 10 });
const segments = [seg("lift", 0, 300), seg("run", 300, 500)];

describe("skied together", () => {
  it("counts the lift and run a friend rode right alongside you", () => {
    const t = togetherness({ track: day(0), segments }, day(12));
    expect(t).toEqual({ lifts: 1, runs: 1, sharedS: 500 });
  });

  it("counts the run but not the lift when they're a few chairs back", () => {
    // 12 s behind = 48 m back on the lift (not the same chair) but 72 m on the run (still with the group)
    const t = togetherness({ track: day(0), segments }, day(0, 12));
    expect(t.lifts).toBe(0);
    expect(t.runs).toBe(1);
  });

  it("ignores someone on a different lift line across the resort", () => {
    expect(togetherness({ track: day(0), segments }, day(600))).toEqual({ lifts: 0, runs: 0, sharedS: 0 });
  });

  it("ignores someone who skied the same line an hour later", () => {
    expect(togetherness({ track: day(0), segments }, day(0, 3600))).toEqual({ lifts: 0, runs: 0, sharedS: 0 });
  });
});
