import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildMountainScene } from "./buildScene";
import type { MountainData } from "./types";

// Flat 1 km square with a 20 m forest layer: evergreens in the west third, open middle, aspen then scrub in the east.
const N = 50;
let cells = "";
let heights = "";
for (let r = 0; r < N; r++)
  for (let c = 0; c < N; c++) {
    const kind = c < 16 ? "1" : c < 34 ? "0" : r < 25 ? "2" : "3";
    cells += kind;
    heights += kind === "0" ? "0" : kind === "3" ? "2" : "9"; // scrub 4 m, trees 18 m
  }
const data: MountainData = {
  slug: "t",
  name: "Test",
  bbox: [-111.0, 40.0, -110.988, 40.009],
  grid: { cols: 11, rows: 11, cellM: 100, widthM: 1000, depthM: 1000, heights: new Array(121).fill(2000) },
  runs: [],
  lifts: [],
  peaks: [],
  forest: { cellM: 20, cols: N, rows: N, cells, heights, source: "test" },
  attribution: "",
};

const positions = (root: THREE.Group, kind: string) => {
  const mesh = root.getObjectByName(`trees:${kind}`) as THREE.InstancedMesh | undefined;
  if (!mesh) return [];
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, m);
    return p.setFromMatrixPosition(m).clone();
  });
};

describe("satellite forest placement", () => {
  const scene = buildMountainScene(data);
  const pine = positions(scene.root, "pine");
  const aspen = positions(scene.root, "aspen");
  const scrub = positions(scene.root, "scrub");

  it("plants each kind only where the forest layer says it grows", () => {
    expect(pine.length).toBeGreaterThan(50);
    expect(aspen.length).toBeGreaterThan(30);
    expect(scrub.length).toBeGreaterThan(30);
    expect(pine.every((p) => p.x < -500 + 16 * 20)).toBe(true);
    expect([...aspen, ...scrub].every((p) => p.x >= -500 + 34 * 20)).toBe(true);
    expect(aspen.every((p) => p.z < 0)).toBe(true); // north half (−z)
    expect(scrub.every((p) => p.z >= 0)).toBe(true);
  });

  it("leaves open ground open", () => {
    const open = [...pine, ...aspen, ...scrub].filter((p) => p.x >= -500 + 16 * 20 && p.x < -500 + 34 * 20);
    expect(open).toHaveLength(0);
  });
});

describe("lidar cliffs and terrain parks", () => {
  // 8 m rock cells along a band in the evergreen third (cols 10-29 of 125, row 60), facing north (aspect 0)
  const cols = 125;
  const items: number[] = [];
  for (let c = 10; c < 30; c++) items.push(60 * cols + c, 20150, 0, 55, 12);
  const withExtras: MountainData = {
    ...data,
    cliffs: { cellM: 8, cols, rows: 125, items },
    parks: [
      { name: "Test Park", kind: "park", coords: [[-110.9935, 40.0085], [-110.9935, 40.0005]] },
      { name: "Test Pipe", kind: "pipe", coords: [[-110.9915, 40.0085], [-110.9915, 40.0060]] },
    ],
    landmarks: [{ name: "Test Cliffs", kind: "cliff", coord: [-111.0, 40.0045] }],
  };
  const scene = buildMountainScene(withExtras);
  const rocks = scene.root.children.filter((o) => o.name === "cliffs") as THREE.InstancedMesh[];

  it("puts one outcrop on every rock cell, at the cell", () => {
    expect(rocks.reduce((n, m) => n + m.count, 0)).toBe(20);
    const m = new THREE.Matrix4();
    rocks[0].getMatrixAt(0, m);
    const p = new THREE.Vector3().setFromMatrixPosition(m);
    expect(p.z).toBeCloseTo(-500 + 60.5 * 8, 0);
    expect(p.x).toBeGreaterThan(-500 + 10 * 8 - 1);
    expect(p.x).toBeLessThan(-500 + 30 * 8 + 1);
  });

  it("keeps trees off the rock", () => {
    const pine = positions(scene.root, "pine");
    const onRock = pine.filter((p) => Math.abs(p.z - (-500 + 60.5 * 8)) < 8 && p.x > -500 + 10 * 8 && p.x < -500 + 30 * 8);
    expect(onRock).toHaveLength(0);
  });

  it("builds park features down the park line and a halfpipe channel", () => {
    const pieces = scene.root.children.filter((o) => o.name.startsWith("park:"));
    expect(pieces.length).toBeGreaterThanOrEqual(5);
    expect(new Set(pieces.map((p) => p.name))).toEqual(new Set(["park:kicker", "park:box", "park:rail"]));
    const pipe = scene.root.getObjectByName("pipe:Test Pipe") as THREE.Mesh;
    expect(pipe).toBeDefined();
    pipe.geometry.computeBoundingBox();
    const bb = pipe.geometry.boundingBox!;
    expect(bb.max.y - bb.min.y).toBeGreaterThan(6.7 * 2.4); // 22 ft walls, drawn 2.4×
  });

  it("frames each landmark from below", () => {
    expect(scene.landmarkViews).toHaveLength(1);
    const v = scene.landmarkViews[0];
    expect(v.position.y).toBeGreaterThan(v.target.y);
  });
});
