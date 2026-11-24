import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeDay } from "../analysis/analyze";
import type { MountainData } from "../mountain/types";
import { mountainDay } from "../sample/mountainDay";
import { parseGpx } from "./parse";

const dv = JSON.parse(readFileSync(join(__dirname, "../../../public/mountains/deer-valley.json"), "utf8")) as MountainData;

/** Same shape as an Apple Watch workout route exported from the Health app. */
function appleGpx(points: { t: number; lat: number; lon: number; ele: number; speed: number; hAcc: number }[]) {
  const pts = points
    .map(
      (p) =>
        `<trkpt lon="${p.lon}" lat="${p.lat}"><ele>${p.ele}</ele><time>${new Date(p.t).toISOString()}</time><extensions><speed>${p.speed}</speed><course>90</course><hAcc>${p.hAcc}</hAcc><vAcc>3</vAcc></extensions></trkpt>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Apple Health Export" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Route 2026-02-14</name><trkseg>${pts}</trkseg></trk></gpx>`;
}

describe("Apple Watch workout routes", () => {
  const { points } = mountainDay(dv, { start: new Date("2026-02-14T16:00:00Z"), seed: 2, laps: 6 });

  it("reads device speed and drops low-accuracy fixes", () => {
    const xml = appleGpx(points.map((p, i) => ({ ...p, speed: 4.2, hAcc: i === 10 ? 80 : 5 })));
    const parsed = parseGpx(xml);
    expect(parsed).toHaveLength(points.length - 1);
    expect(parsed[0].speed).toBe(4.2);
  });

  it("uses device speed for top speed, ignoring a one-sample spike", () => {
    const day0 = analyzeDay(parseGpx(appleGpx(points.map((p) => ({ ...p, speed: 0, hAcc: 5 })))));
    const run = day0.segments.find((s) => s.kind === "run")!;
    const inRun = points.flatMap((p, i) => (p.t > run.startT + 20_000 && p.t < run.endT - 20_000 ? [i] : []));
    const mid = inRun[Math.floor(inRun.length / 2)];
    const withSpeed = points.map((p, i) => ({
      ...p,
      hAcc: 5,
      // a steady 16 m/s through the middle of the first run, with one 45 m/s glitch
      speed: i === mid ? 45 : Math.abs(i - mid) <= 3 ? 16 : 6,
    }));
    const day = analyzeDay(parseGpx(appleGpx(withSpeed)));
    expect(day.maxSpeedMps).toBeCloseTo(16, 5);
  });
});
