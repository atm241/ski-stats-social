import { describe, expect, it } from "vitest";
import { processGpx } from "../analysis/process";
import { parseGpx } from "./parse";
import { gpxFromLocations, type RouteLocation } from "./fromLocations";
import { parkCityDay } from "../test/fixtures";

describe("GPX from workout route locations", () => {
  const fix = (s: number, extra: Partial<RouteLocation> = {}): RouteLocation => ({
    latitude: 40.65 + s * 1e-5,
    longitude: -111.5,
    altitude: 2500 - s,
    speed: 8,
    course: 90,
    horizontalAccuracy: 5,
    verticalAccuracy: 3,
    date: new Date(Date.UTC(2026, 1, 15, 17, 0, s)),
    ...extra,
  });

  it("sorts fixes by time, drops ones without altitude, and keeps device speed", () => {
    const gpx = gpxFromLocations("A & B <day>", [fix(2), fix(0), fix(1, { verticalAccuracy: -1 }), fix(3, { speed: -1 })]);
    expect(gpx).toContain("<name>A &amp; B &lt;day&gt;</name>");
    const points = parseGpx(gpx);
    expect(points.map((p) => p.t)).toEqual([0, 2, 3].map((s) => Date.UTC(2026, 1, 15, 17, 0, s)));
    expect(points.map((p) => p.speed)).toEqual([8, 8, undefined]);
  });

  it("round-trips a whole ski day to the same stats as the original GPX", () => {
    const day = parkCityDay();
    const locations = day.track.pts.map(([dt, lat, lon, ele]) => fix(0, { latitude: lat, longitude: lon, altitude: ele, speed: -1, date: new Date(day.track.t0 + dt * 1000) }));
    const again = processGpx(gpxFromLocations("day", locations)).days[0];
    expect(again.stats.runCount).toBe(day.stats.runCount);
    expect(Math.abs(again.stats.verticalM - day.stats.verticalM) / day.stats.verticalM).toBeLessThan(0.02);
  });
});
