/** Writes sample GPX files to samples/ for trying the uploader by hand. */
import { writeFileSync } from "node:fs";
import { backcountryDay, passLapsDay, resortDay, toGpx } from "../src/lib/sample/generate";

writeFileSync(
  "samples/vail-resort-day.gpx",
  toGpx(resortDay({ lat: 39.603, lon: -106.3507, baseEle: 2480, topEle: 3200, laps: 9, start: new Date("2026-02-07T16:15:00Z"), seed: 7 }), "Vail"),
);
writeFileSync(
  "samples/teton-pass-tour.gpx",
  toGpx(backcountryDay({ lat: 43.4975, lon: -110.958, baseEle: 2560, laps: [{ gain: 550 }, { gain: 400, bootpack: true }], start: new Date("2026-02-08T15:30:00Z"), seed: 9 }), "Teton Pass"),
);
writeFileSync(
  "samples/teton-pass-hitchhike-laps.gpx",
  toGpx(passLapsDay({ lat: 43.4975, lon: -110.958, topEle: 2560, laps: 5, drop: 480, carSpeed: 9, start: new Date("2026-02-09T16:00:00Z"), seed: 11 }), "Teton Pass laps"),
);
console.log("wrote samples/*.gpx");
