import { beforeEach, describe, expect, it } from "vitest";
import type { ApiUploadResponse } from "@/lib/apiTypes";
import { createApiToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gpxFromLocations } from "@/lib/gpx/fromLocations";
import { makeUser, parkCityDay, resetDb } from "@/lib/test/db";
import { POST } from "./route";

beforeEach(resetDb);

/** A Park City day as the phone app sends it: HealthKit route fixes → GPX → JSON upload. */
function healthGpx() {
  const day = parkCityDay();
  const fixes = day.track.pts.map(([dt, lat, lon, ele]) => ({ latitude: lat, longitude: lon, altitude: ele, speed: -1, course: -1, horizontalAccuracy: 5, verticalAccuracy: 3, date: new Date(day.track.t0 + dt * 1000) }));
  return gpxFromLocations("route_2026-03-13.gpx", fixes);
}

const upload = (token: string, body: unknown) =>
  POST(new Request("http://localhost/api/uploads", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /api/uploads (phone app)", () => {
  it("saves a JSON GPX upload once, then reports the duplicate", async () => {
    const u = await makeUser();
    const token = await createApiToken(u.id, "Gapr app");
    const files = [{ name: "route_2026-03-13.gpx", gpx: healthGpx() }];

    const first = (await (await upload(token, { source: "health", files })).json()) as ApiUploadResponse;
    expect(first.results[0].error).toBeUndefined();
    expect(first.results[0].saved).toHaveLength(1);
    const day = await prisma.skiDay.findFirstOrThrow({ where: { userId: u.id } });
    expect(day.source).toBe("health");
    expect(await prisma.run.count({ where: { dayId: day.id } })).toBeGreaterThan(5);

    const again = (await (await upload(token, { source: "health", files })).json()) as ApiUploadResponse;
    expect(again.results[0].saved).toHaveLength(0);
    expect(await prisma.skiDay.count()).toBe(1);
  });

  it("rejects a bad token and an empty body", async () => {
    const u = await makeUser();
    expect((await upload("pp_nope", { files: [] })).status).toBe(401);
    expect((await upload(await createApiToken(u.id, "x"), { files: [] })).status).toBe(400);
  });
});
