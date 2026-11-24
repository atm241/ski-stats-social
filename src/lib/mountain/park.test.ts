import { describe, expect, it } from "vitest";
import { createParkTricks, type ParkFeature } from "./park";

// Flat ground at 0; features point down +z (heading 0).
const ground = { yAt: () => 0 };
const DOWN = 0;

describe("park tricks", () => {
  const rail: ParkFeature = { kind: "rail", park: null, start: { x: 0, y: 3, z: 0 }, end: { x: 0, y: 3, z: 24 } };

  it("slides a rail with the skis across it, on top of the rail", () => {
    const park = createParkTricks([rail], ground);
    const mid = park.at(5, 12, DOWN, 1)!; // GPS 5 m off to the side
    expect(mid.trick.label).toBe("Rail slide");
    expect(mid.trick.source).toBe("simulated");
    expect(mid.pose).toBe("slide");
    expect(mid.position.x).toBeCloseTo(0); // snapped onto the rail
    expect(mid.position.y).toBeCloseTo(3);
    expect(Math.abs(mid.bodyYaw)).toBeCloseTo(Math.PI / 2); // sideways
  });

  it("ignores a rail you ski past, ski across, or ski up", () => {
    const park = createParkTricks([rail], ground);
    expect(park.at(40, 12, DOWN, 1)).toBeNull(); // too far to the side
    expect(park.at(0, 12, Math.PI / 2, 1)).toBeNull(); // crossing it
    expect(park.at(0, 12, Math.PI, 1)).toBeNull(); // going uphill
    expect(park.at(0, 80, DOWN, 1)).toBeNull(); // well past it
  });

  it("lands back on the ground straightened out", () => {
    const park = createParkTricks([rail], ground);
    const after = park.at(0, 24 + 24 * 0.39, DOWN, 1)!;
    expect(after.position.y).toBeLessThan(0.5);
    expect(Math.abs(after.bodyYaw)).toBeLessThan(0.05);
  });

  it("spins off a kicker, reaching the full spin by landing", () => {
    const kicker: ParkFeature = { kind: "kicker", park: null, start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 7, z: 20 } };
    // find a seed whose trick spins
    let seed = 0;
    let spinDeg = 0;
    for (; seed < 50; seed++) {
      spinDeg = createParkTricks([kicker], ground).at(0, 10, DOWN, seed)!.trick.spinDeg;
      if (spinDeg >= 360) break;
    }
    expect(spinDeg).toBeGreaterThanOrEqual(360);
    const park = createParkTricks([kicker], ground);
    const apex = park.at(0, 20 + 13, DOWN, seed)!;
    expect(apex.pose).toBe("air");
    expect(apex.position.y).toBeGreaterThan(7); // above the lip
    const landing = park.at(0, 20 + 25.9, DOWN, seed)!;
    expect(Math.abs(landing.bodyYaw)).toBeCloseTo((spinDeg * Math.PI) / 180, 1);
  });

  it("rides the pipe wall to wall with air above the coping", () => {
    const pipe: ParkFeature = { kind: "pipe", park: null, path: [[0, 0], [0, 200]], floor0: -9, floorSlope: -0.2, halfFlat: 9.6, radius: 16 };
    const park = createParkTricks([pipe], ground);
    const lats = [];
    let maxAbove = -Infinity;
    for (let z = 2; z < 198; z += 1) {
      const f = park.at(0, z, DOWN, 3)!;
      expect(f).not.toBeNull();
      lats.push(f.position.x);
      maxAbove = Math.max(maxAbove, f.position.y - (-9 - 0.2 * z + 16)); // height over the coping
    }
    expect(Math.max(...lats)).toBeGreaterThan(25);
    expect(Math.min(...lats)).toBeLessThan(-25);
    expect(maxAbove).toBeGreaterThan(5);
  });

  it("slows down ahead of a feature", () => {
    const park = createParkTricks([rail], ground);
    expect(park.near(0, -30, DOWN)).toBe(true);
    expect(park.near(0, -80, DOWN)).toBe(false);
  });
});

describe("pipe next to a park", () => {
  it("doesn't pull a skier on the neighbouring park line into the pipe", () => {
    const pipe: ParkFeature = { kind: "pipe", park: null, path: [[0, 0], [0, 200]], floor0: -9, floorSlope: -0.2, halfFlat: 9.6, radius: 16 };
    const park = createParkTricks([pipe], ground);
    expect(park.at(35, 100, DOWN, 1)).toBeNull();
    expect(park.near(35, 100, DOWN)).toBe(false);
    expect(park.at(3, 100, DOWN, 1)).not.toBeNull();
    expect(park.near(0, -20, DOWN)).toBe(true);
  });
});
