import { describe, expect, it } from "vitest";
import { createTerrain, densify } from "./terrain";
import type { MountainData } from "./types";

// 3×3 grid, 100 m cells, heights rising to the east
const data: MountainData = {
  slug: "t",
  name: "Test",
  bbox: [-111.0, 40.0, -110.99, 40.01],
  grid: { cols: 3, rows: 3, cellM: 100, widthM: 200, depthM: 200, heights: [1000, 1100, 1200, 1000, 1100, 1200, 1000, 1100, 1200] },
  runs: [],
  lifts: [],
  peaks: [],
  attribution: "",
};

describe("createTerrain", () => {
  const t = createTerrain(data, 2);

  it("puts the north-west corner at (-w/2, -d/2) and north at -z", () => {
    expect(t.toXZ(-111.0, 40.01)).toEqual([-100, -100]);
    expect(t.toXZ(-110.99, 40.0)).toEqual([100, 100]);
  });

  it("interpolates elevation and applies exaggeration above the lowest point", () => {
    expect(t.elevationAt(0, 0)).toBeCloseTo(1100);
    expect(t.elevationAt(50, 0)).toBeCloseTo(1150);
    expect(t.yAt(100, 0)).toBeCloseTo(400);
    expect(t.yAt(-100, 0)).toBeCloseTo(0);
  });

  it("clamps outside the grid", () => {
    expect(t.elevationAt(500, 0)).toBeCloseTo(1200);
  });
});

describe("densify", () => {
  it("keeps points at most `step` apart and keeps both ends", () => {
    const out = densify([[0, 0], [10, 0]], 3);
    expect(out[0]).toEqual([0, 0]);
    expect(out.at(-1)).toEqual([10, 0]);
    for (let i = 1; i < out.length; i++) expect(out[i][0] - out[i - 1][0]).toBeLessThanOrEqual(3);
  });
});
