import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { analyzeDay } from "./analysis/analyze";
import { parseGpx } from "./gpx/parse";
import { extractRoutes, findSkiWorkouts } from "./healthExport";
import type { MountainData } from "./mountain/types";
import { mountainDay } from "./sample/mountainDay";
import { toGpx } from "./sample/generate";

const dv = JSON.parse(readFileSync(join(__dirname, "../../public/mountains/deer-valley.json"), "utf8")) as MountainData;

describe("Apple Health export import", () => {
  const ski = toGpx(mountainDay(dv, { start: new Date("2026-02-14T16:00:00Z"), seed: 4, laps: 5 }).points);
  const xml = `<?xml version="1.0"?><HealthData locale="en_US">
    <Record type="HKQuantityTypeIdentifierStepCount" value="12"/>
    <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" startDate="2026-02-10 07:00:00 -0700">
      <WorkoutRoute sourceName="Watch"><FileReference path="/workout-routes/route_2026-02-10_7.00am.gpx"/></WorkoutRoute>
    </Workout>
    <Workout workoutActivityType="HKWorkoutActivityTypeDownhillSkiing" duration="300" startDate="2026-02-14 09:00:00 -0700">
      <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceDownhillSnowSports" sum="20"/>
      <WorkoutRoute sourceName="Watch"><FileReference path="/workout-routes/route_2026-02-14_9.00am.gpx"/></WorkoutRoute>
    </Workout>
  </HealthData>`;
  const zip = zipSync({
    "apple_health_export/export.xml": strToU8(xml),
    "apple_health_export/export_cda.xml": strToU8("<ClinicalDocument/>"),
    "apple_health_export/workout-routes/route_2026-02-10_7.00am.gpx": strToU8("<gpx/>"),
    "apple_health_export/workout-routes/route_2026-02-14_9.00am.gpx": strToU8(ski),
  });
  const blob = new Blob([zip]);

  it("finds only ski workouts and their routes", async () => {
    const found = await findSkiWorkouts(blob);
    expect(found).toEqual([{ type: "HKWorkoutActivityTypeDownhillSkiing", startDate: "2026-02-14 09:00:00 -0700", routePath: "apple_health_export/workout-routes/route_2026-02-14_9.00am.gpx" }]);
  });

  it("extracts just those route files, which analyse as a ski day", async () => {
    const routes = await extractRoutes(blob, ["apple_health_export/workout-routes/route_2026-02-14_9.00am.gpx"]);
    expect(routes.map((r) => r.name)).toEqual(["route_2026-02-14_9.00am.gpx"]);
    const day = analyzeDay(parseGpx(routes[0].gpx));
    expect(day.liftCount).toBe(5);
    expect(day.kind).toBe("resort");
  });
});
