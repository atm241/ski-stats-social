import * as THREE from "three";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cliffIndex } from "./cliffs";
import { createTerrain, densify, type Terrain } from "./terrain";
import type { MountainData } from "./types";

/*
 * Low-poly "diorama" of a resort: flat-shaded snowy terrain on a layered earth base,
 * instanced trees (snow-laden pines, bare white-trunked aspens, scrub-oak thickets, placed from
 * satellite land cover when the mountain has it), runs as ribbons draped on the snow, lifts as cables on
 * T-towers with little red cabins/chairs and chunky red stations.
 */

export const DIFFICULTY: Record<string, { label: string; color: string; symbol: string }> = {
  novice: { label: "Beginner", color: "#3fbf6f", symbol: "●" },
  easy: { label: "Green", color: "#3fbf6f", symbol: "●" },
  intermediate: { label: "Blue", color: "#2f7fe0", symbol: "■" },
  advanced: { label: "Black", color: "#1f2b4d", symbol: "◆" },
  expert: { label: "Double black", color: "#1f2b4d", symbol: "◆◆" },
  freeride: { label: "Off-piste", color: "#e07b39", symbol: "▲" },
  extreme: { label: "Extreme", color: "#e07b39", symbol: "▲" },
  unknown: { label: "Unrated", color: "#8a96b3", symbol: "○" },
};
export const difficultyOf = (d: string | null) => (d && DIFFICULTY[d] ? d : "unknown");

const SNOW = new THREE.Color("#f4f4f1");
/** exposed cliff rock (lidar-detected), darker than the pale rock used for merely steep faces */
const CLIFF_ROCK = new THREE.Color("#959aa2");
const CLIFF_ROCK_DARK = new THREE.Color("#7b8089");
const SNOW_SHADE = new THREE.Color("#e6e7e4");
const ROCK = new THREE.Color("#d9dbd9");
const EARTH_TOP = new THREE.Color("#d9c3a9");
const EARTH_BOTTOM = new THREE.Color("#a98d74");
const PINE_GREEN = new THREE.Color("#2f5f37");
const PINE_SNOW = new THREE.Color("#f6f6f3");
const TRUNK = new THREE.Color("#6b4a35");
const ASPEN_BARK = new THREE.Color("#eeebe3");
const ASPEN_SCAR = new THREE.Color("#4d4641");
const ASPEN_TWIGS = new THREE.Color("#d8cbc6");
const SCRUB = new THREE.Color("#a5735c");
const TREE_SNOW = new THREE.Color("#f7f7f4");

type TreeKind = "pine" | "aspen" | "scrub";
type RockCellPlacement = { cell: ReturnType<typeof cliffIndex>["cells"][number]; jitter: number };
/** Park features and pipes are drawn larger than life so they read next to the oversized trees. */
const PARK_SCALE = 2.4;
const PARK_SNOW = new THREE.Color("#fbfcfd");
const PARK_SIDE = new THREE.Color("#a9bfd8");
const PARK_BLUE = new THREE.Color("#3d8bfd");
const PARK_ORANGE = new THREE.Color("#ff8a3d");
const PARK_STEEL = new THREE.Color("#aab2bd");
const PARK_DARK = new THREE.Color("#2b3445");
/** Cliff outcrops are drawn a bit larger than life, like the trees, so bands read from across the resort. */
const CLIFF_SCALE = 1.5;
const LIFT_RED = "#d8433b";
const BASE_DEPTH = 260;
const RUN_WIDTH = 11;
const RUN_LIFT = 2.5;
const CABLE_CLEARANCE = 30;
const TOWER_SPACING = 160;
/** Diorama scale: trees, cabins and buildings are drawn larger than life so they read from far away. */
const PROP_SCALE = 2.2;
const CABIN_SPACING = { gondola: 70, chair: 45 };

export interface RunPick {
  index: number;
  name: string | null;
  difficulty: string;
}
export interface LiftPick {
  name: string | null;
  type: string;
}

export interface MountainScene {
  terrain: Terrain;
  root: THREE.Group;
  /** meshes to raycast for run hover; triangle index → run via runForFace */
  runMeshes: THREE.Mesh[];
  /** same meshes, for toggling trail colours on/off */
  runGroup: THREE.Mesh[];
  runForFace: Map<THREE.Mesh, RunPick[]>;
  stations: THREE.InstancedMesh;
  liftForStation: LiftPick[];
  /** Line2 materials need the renderer size to draw pixel-width lines */
  lineMaterials: LineMaterial[];
  peaks: { name: string; ele: number | null; position: THREE.Vector3 }[];
  /** close-up camera at the bottom of the resort's biggest lift */
  baseView: { position: THREE.Vector3; target: THREE.Vector3 } | null;
  /** horizontal unit vector the runs flow toward on average: the side to look at the resort from */
  homeDirection: THREE.Vector2;
  /** cameras looking at each landmark (cliffs from below, parks from the side) */
  landmarkViews: { name: string; kind: string; position: THREE.Vector3; target: THREE.Vector3 }[];
  runRibbon: (runIndex: number) => THREE.BufferGeometry;
  dispose: () => void;
}

/** Small deterministic RNG so trees don't reshuffle on every visit. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMountainScene(data: MountainData): MountainScene {
  const terrain = createTerrain(data);
  const { cols, rows, widthM, depthM } = terrain;
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);
  const rand = rng(42);
  const cliffs = cliffIndex(data);

  // --- terrain surface, flat shaded with per-face colour
  const plane = new THREE.PlaneGeometry(widthM, depthM, cols - 1, rows - 1);
  plane.rotateX(-Math.PI / 2); // row 0 (north) ends up at -z
  const pos = plane.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrain.yForElevation(data.grid.heights[i]));
  const surface = track(plane.toNonIndexed());
  plane.dispose();
  surface.computeVertexNormals();
  const n = surface.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(surface.attributes.position.count * 3);
  const c = new THREE.Color();
  const sp = surface.attributes.position as THREE.BufferAttribute;
  for (let f = 0; f < surface.attributes.position.count; f += 3) {
    const slope = n.getY(f); // flat shading: all three vertices share the face normal
    if (slope < 0.62) c.copy(ROCK);
    else c.copy(SNOW).lerp(SNOW_SHADE, Math.min(1, (1 - slope) * 3));
    // lidar cliffs: grey the snow where the real ground is rock, streaky rather than solid
    const rock = data.cliffs ? cliffs.rockFraction((sp.getX(f) + sp.getX(f + 1) + sp.getX(f + 2)) / 3, (sp.getZ(f) + sp.getZ(f + 1) + sp.getZ(f + 2)) / 3, 18) : 0;
    if (rock > 0.08) c.lerp(CLIFF_ROCK, Math.min(0.8, rock * 2.4));
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.03); // a little low-poly sparkle
    for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
  }
  surface.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const snowMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }));
  const surfaceMesh = new THREE.Mesh(surface, snowMat);
  surfaceMesh.receiveShadow = true;
  root.add(surfaceMesh);

  // --- earth "skirt" around the edges so it reads as a little diorama tile
  const skirtPos: number[] = [];
  const skirtCol: number[] = [];
  const edge = (ax: number, az: number, bx: number, bz: number) => {
    const ay = terrain.yAt(ax, az);
    const by = terrain.yAt(bx, bz);
    const quad = [
      [ax, ay, az, EARTH_TOP],
      [bx, by, bz, EARTH_TOP],
      [bx, -BASE_DEPTH, bz, EARTH_BOTTOM],
      [ax, ay, az, EARTH_TOP],
      [bx, -BASE_DEPTH, bz, EARTH_BOTTOM],
      [ax, -BASE_DEPTH, az, EARTH_BOTTOM],
    ] as const;
    for (const [x, y, z, col] of quad) {
      skirtPos.push(x, y, z);
      skirtCol.push(col.r, col.g, col.b);
    }
  };
  const hw = widthM / 2;
  const hd = depthM / 2;
  const sx = widthM / (cols - 1);
  const sz = depthM / (rows - 1);
  for (let i = 0; i < cols - 1; i++) {
    edge(-hw + (i + 1) * sx, -hd, -hw + i * sx, -hd); // north (faces -z)
    edge(-hw + i * sx, hd, -hw + (i + 1) * sx, hd); // south
  }
  for (let j = 0; j < rows - 1; j++) {
    edge(-hw, -hd + j * sz, -hw, -hd + (j + 1) * sz); // west
    edge(hw, -hd + (j + 1) * sz, hw, -hd + j * sz); // east
  }
  const skirt = track(new THREE.BufferGeometry());
  skirt.setAttribute("position", new THREE.Float32BufferAttribute(skirtPos, 3));
  skirt.setAttribute("color", new THREE.Float32BufferAttribute(skirtCol, 3));
  skirt.computeVertexNormals();
  root.add(new THREE.Mesh(skirt, track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }))));

  // --- runs: ribbons draped over the snow, one merged mesh per difficulty
  const runPaths = data.runs.map((r) => densify(r.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)), 12));
  const ribbon = (path: [number, number][], width: number, lift: number) => {
    const p: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [x0, z0] = path[i];
      const [x1, z1] = path[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const ox = (-(z1 - z0) / len) * (width / 2);
      const oz = ((x1 - x0) / len) * (width / 2);
      const v = [
        [x0 - ox, z0 - oz],
        [x0 + ox, z0 + oz],
        [x1 + ox, z1 + oz],
        [x1 - ox, z1 - oz],
      ].map(([x, z]) => [x, terrain.yAt(x, z) + lift, z]);
      p.push(...v[0], ...v[1], ...v[2], ...v[0], ...v[2], ...v[3]);
    }
    return p;
  };

  const runMeshes: THREE.Mesh[] = [];
  const runForFace = new Map<THREE.Mesh, RunPick[]>();
  const byDifficulty = new Map<string, number[]>();
  data.runs.forEach((r, i) => {
    const d = difficultyOf(r.difficulty);
    if (!byDifficulty.has(d)) byDifficulty.set(d, []);
    byDifficulty.get(d)!.push(i);
  });
  for (const [d, idxs] of byDifficulty) {
    const positions: number[] = [];
    const faces: RunPick[] = [];
    for (const i of idxs) {
      const p = ribbon(runPaths[i], RUN_WIDTH, RUN_LIFT);
      positions.push(...p);
      const pick = { index: i, name: data.runs[i].name, difficulty: d };
      for (let t = 0; t < p.length / 9; t++) faces.push(pick);
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mat = track(
      new THREE.MeshBasicMaterial({ color: DIFFICULTY[d].color, transparent: true, opacity: d === "advanced" || d === "expert" ? 0.55 : 0.5, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    root.add(mesh);
    runMeshes.push(mesh);
    runForFace.set(mesh, faces);
  }

  // --- trees, kept off the runs
  const MASK_M = 20;
  const mCols = Math.ceil(widthM / MASK_M);
  const mRows = Math.ceil(depthM / MASK_M);
  const clear = new Uint8Array(mCols * mRows);
  const mark = (x: number, z: number, r: number) => {
    const cc = Math.floor((x + hw) / MASK_M);
    const rr = Math.floor((z + hd) / MASK_M);
    for (let dr = -r; dr <= r; dr++)
      for (let dc = -r; dc <= r; dc++) {
        const C = cc + dc;
        const R = rr + dr;
        if (C >= 0 && R >= 0 && C < mCols && R < mRows) clear[R * mCols + C] = 1;
      }
  };
  for (const path of runPaths) for (const [x, z] of densify(path, 8)) mark(x, z, 2);
  for (const l of data.lifts) for (const [x, z] of densify(l.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)), 8)) mark(x, z, 0);
  for (const p of data.parks ?? []) for (const [x, z] of densify(p.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)), 8)) mark(x, z, p.kind === "pipe" ? 3 : 2);

  const isClear = (x: number, z: number) =>
    Math.abs(x) < hw - 10 && Math.abs(z) < hd - 10 && !clear[Math.floor((z + hd) / MASK_M) * mCols + Math.floor((x + hw) / MASK_M)] && cliffs.rockFraction(x, z, 10) === 0;
  const slopeAt = (x: number, z: number) => {
    const dx = (terrain.yAt(x + 20, z) - terrain.yAt(x - 20, z)) / 40;
    const dz = (terrain.yAt(x, z + 20) - terrain.yAt(x, z - 20)) / 40;
    return Math.hypot(dx, dz);
  };
  const forest = data.forest;
  /** Satellite forest layer at a scene position: tree kind and real canopy height (m), or null if open. */
  const forestAt = (x: number, z: number): { kind: TreeKind; h: number } | null => {
    if (!forest) return null;
    const c = Math.floor((x + hw) / forest.cellM);
    const r = Math.floor((z + hd) / forest.cellM);
    if (c < 0 || r < 0 || c >= forest.cols || r >= forest.rows) return null;
    const v = forest.cells[r * forest.cols + c];
    if (v === "0") return null;
    return { kind: v === "1" ? "pine" : v === "2" ? "aspen" : "scrub", h: parseInt(forest.heights[r * forest.cols + c], 36) * 2 };
  };
  /** Real canopy height → diorama scale, so a 20 m spruce stand towers over a 4 m oak thicket. */
  const sizeFor = (kind: TreeKind, h: number) => {
    const jitter = 0.85 + rand() * 0.3;
    if (kind === "scrub") return PROP_SCALE * Math.min(2.2, 1.4 + h / 8) * jitter; // drawn chunky so thickets read from afar
    return PROP_SCALE * Math.min(1.3, Math.max(0.55, 0.45 + h / 26)) * jitter;
  };

  const spots: Record<TreeKind, { x: number; z: number; s: number }[]> = { pine: [], aspen: [], scrub: [] };
  const STEP = forest ? 34 : 40;
  for (let z = -hd + STEP / 2; z < hd; z += STEP)
    for (let x = -hw + STEP / 2; x < hw; x += STEP) {
      const tx = x + (rand() - 0.5) * STEP;
      const tz = z + (rand() - 0.5) * STEP;
      if (!isClear(tx, tz) || slopeAt(tx, tz) > 1.1) continue;
      if (forest) {
        const f = forestAt(tx, tz);
        if (!f || rand() < 0.08) continue;
        spots[f.kind].push({ x: tx, z: tz, s: sizeFor(f.kind, f.h) });
        // aspen grow in clonal groves and oak in thickets: tuck a smaller neighbour in beside them
        if (f.kind !== "pine" && rand() < 0.6) {
          const nx = tx + (rand() - 0.5) * 22;
          const nz = tz + (rand() - 0.5) * 22;
          if (isClear(nx, nz) && forestAt(nx, nz)?.kind === f.kind) spots[f.kind].push({ x: nx, z: nz, s: sizeFor(f.kind, f.h) * 0.8 });
        }
      } else {
        // No satellite layer for this mountain: evergreens everywhere below treeline, with glades.
        if (terrain.elevationAt(tx, tz) > 3000 || rand() < 0.22) continue;
        spots.pine.push({ x: tx, z: tz, s: PROP_SCALE * (0.7 + rand() * 0.65) });
      }
    }

  const treeMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  const geos: Record<TreeKind, THREE.BufferGeometry> = { pine: track(snowyPine()), aspen: track(winterAspen()), scrub: track(scrubThicket()) };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const kind of Object.keys(spots) as TreeKind[]) {
    const list = spots[kind];
    if (!list.length) continue;
    const trees = new THREE.InstancedMesh(geos[kind], treeMat, list.length);
    trees.name = `trees:${kind}`;
    list.forEach((t, i) => {
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      m.compose(new THREE.Vector3(t.x, terrain.yAt(t.x, t.z) - 1, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + rand() * 0.3), t.s));
      trees.setMatrixAt(i, m);
    });
    trees.castShadow = true;
    trees.receiveShadow = true;
    root.add(trees);
    disposables.push({ dispose: () => trees.dispose() });
  }

  // --- cliffs: a low-poly outcrop on every lidar rock cell, facing downhill, as tall as the real face.
  // The 40 m terrain mesh rounds cliffs off, so outcrops sit between the true (lidar) height and the
  // mesh surface: the band pokes out of the snow where it really is.
  if (cliffs.cells.length) {
    // Skiable lines through the rock (Daly Chutes, couloirs) stay snow: no outcrop on a mapped run.
    const onRun = new Set<number>();
    for (const path of runPaths) for (const [x, z] of densify(path, 3)) onRun.add(cliffs.indexAt(x, z));
    const variants = [0, 1, 2].map((seed) => track(outcrop(seed)));
    const buckets: RockCellPlacement[][] = [[], [], []];
    for (const cell of cliffs.cells) {
      if (onRun.has(cell.index)) continue;
      // In winter snow still clings below ~50° (those faces get skied), so only some rock pokes through
      // there; dense patches are thinned too since their wide crags already overlap. Snow shows between ribs.
      let keep = cell.steepDeg >= 52 ? 1 : cell.steepDeg >= 47 ? 0.6 : 0.3;
      if (cliffs.rockFraction(cell.x, cell.z, 12) > 0.6) keep *= 0.6;
      // Whole alpine faces of rock (Palmyra, the Cirque): the greyed terrain already reads as rock, so
      // fewer crags keep it from turning into a field of blocks.
      if (cliffs.rockFraction(cell.x, cell.z, 40) > 0.6) keep *= 0.6;
      if (rand() > keep) continue;
      buckets[Math.floor(rand() * 3)].push({ cell, jitter: rand() });
    }
    const rm = new THREE.Matrix4();
    const rq = new THREE.Quaternion();
    const tilt = new THREE.Quaternion();
    const xAxis = new THREE.Vector3(1, 0, 0);
    const up = new THREE.Vector3(0, 1, 0);
    const rockMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
    variants.forEach((geo, v) => {
      const list = buckets[v];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, rockMat, list.length);
      mesh.name = "cliffs";
      list.forEach(({ cell, jitter }, i) => {
        // A crag as tall as a good share of its band: tall bands get tall rock, lone steps stay small.
        // Where rock is dense, crags get wider so neighbours fuse into a continuous wall; lone ones stay small.
        const dense = cliffs.rockFraction(cell.x, cell.z, 12);
        const w = cliffs.cellSize * CLIFF_SCALE * (1 + dense * 0.9 + jitter * 0.3);
        const h = Math.min(16, Math.max(5, cell.heightM * 1.1 + cell.bandM * 0.1)) * terrain.exaggeration * CLIFF_SCALE * (0.75 + jitter * 0.4);
        const base = Math.min(terrain.yAt(cell.x, cell.z), terrain.yForElevation(cell.ele)) - h * 0.2;
        rq.setFromAxisAngle(up, Math.atan2(cell.downX, cell.downZ) + (jitter - 0.5) * 0.5);
        tilt.setFromAxisAngle(xAxis, ((90 - cell.steepDeg) * Math.PI) / 180 * 0.35); // lean back into the slope a little
        rq.multiply(tilt);
        rm.compose(new THREE.Vector3(cell.x, base + h / 2, cell.z), rq, new THREE.Vector3(w, h, w * 0.7));
        mesh.setMatrixAt(i, rm);
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      disposables.push({ dispose: () => mesh.dispose() });
    });
  }

  // --- terrain parks (kickers, boxes, rails down the park line) and halfpipes (a U-channel swept down its line)
  if (data.parks?.length) {
    const parkMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }));
    const pieces = { kicker: track(kicker()), box: track(parkBox()), rail: track(parkRail()) };
    const cycle: (keyof typeof pieces)[] = ["kicker", "box", "kicker", "rail", "kicker", "box"];
    const q = new THREE.Quaternion();
    const pitchQ = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3(1, 0, 0);
    for (const park of data.parks) {
      const path = densify(park.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)), 3);
      if (path.length < 2) continue;
      if (park.kind === "pipe") {
        const geo = track(halfpipe(path, terrain));
        const mesh = new THREE.Mesh(geo, parkMat);
        mesh.name = `pipe:${park.name ?? ""}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        continue;
      }
      let dist = 0;
      let next = 30;
      let k = 0;
      for (let i = 1; i < path.length - 1; i++) {
        const [x0, z0] = path[i - 1];
        const [x1, z1] = path[i];
        dist += Math.hypot(x1 - x0, z1 - z0);
        if (dist < next) continue;
        next += 42;
        const kind = cycle[k++ % cycle.length];
        const [xa, za] = path[Math.max(0, i - 3)];
        const [xb, zb] = path[Math.min(path.length - 1, i + 3)];
        const run = Math.hypot(xb - xa, zb - za) || 1;
        const pitch = Math.atan2(terrain.yAt(xa, za) - terrain.yAt(xb, zb), run); // downhill = forward (+z local)
        q.setFromAxisAngle(yAxis, Math.atan2(xb - xa, zb - za));
        pitchQ.setFromAxisAngle(xAxis, pitch);
        q.multiply(pitchQ);
        const mesh = new THREE.Mesh(pieces[kind], parkMat);
        mesh.position.set(x1, terrain.yAt(x1, z1) - 0.4, z1);
        mesh.quaternion.copy(q);
        mesh.scale.setScalar(PARK_SCALE);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `park:${kind}`;
        root.add(mesh);
      }
    }
  }

  // --- lifts: straight cables between stations (never dipping into the snow), T-towers,
  // little red cabins/chairs hanging off the cable, chunky red stations at each end.
  const lineMaterials: LineMaterial[] = [];
  const cableMat = track(new LineMaterial({ color: 0x555a66, linewidth: 1.1, worldUnits: false, transparent: true, opacity: 0.8 }));
  lineMaterials.push(cableMat);
  const towers: { pos: THREE.Vector3; yaw: number }[] = [];
  const cabins: { pos: THREE.Vector3; yaw: number; gondola: boolean }[] = [];
  const stationSpots: { pos: THREE.Vector3; yaw: number; gondola: boolean }[] = [];
  const liftForStation: LiftPick[] = [];
  let hero: { bottom: THREE.Vector3; top: THREE.Vector3; rise: number } | null = null;
  for (const lift of data.lifts) {
    const gondola = lift.type === "gondola" || lift.type === "cable_car" || lift.type === "mixed_lift";
    const ends = lift.coords.map(([lon, lat]) => terrain.toXZ(lon, lat));
    const path = densify(ends, 10);
    const total = path.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0) || 1;
    const first = path[0];
    const last = path[path.length - 1];
    const yaw = Math.atan2(last[0] - first[0], last[1] - first[1]);
    const y0 = terrain.yAt(...first) + CABLE_CLEARANCE;
    const y1 = terrain.yAt(...last) + CABLE_CLEARANCE;
    const pts: number[] = [];
    let along = 0;
    let sinceTower = 0;
    let sinceCabin = 0;
    const spacing = gondola ? CABIN_SPACING.gondola : CABIN_SPACING.chair;
    path.forEach(([x, z], i) => {
      if (i) {
        const step = Math.hypot(x - path[i - 1][0], z - path[i - 1][1]);
        along += step;
        sinceTower += step;
        sinceCabin += step;
      }
      const y = Math.max(y0 + ((y1 - y0) * along) / total, terrain.yAt(x, z) + CABLE_CLEARANCE);
      pts.push(x, y, z);
      if (sinceTower >= TOWER_SPACING && along < total - 60) {
        towers.push({ pos: new THREE.Vector3(x, y, z), yaw });
        sinceTower = 0;
      }
      if (sinceCabin >= spacing && along > 30 && along < total - 30) {
        cabins.push({ pos: new THREE.Vector3(x, y, z), yaw, gondola });
        sinceCabin = 0;
      }
    });
    const ya = terrain.yAt(...first);
    const yb = terrain.yAt(...last);
    const [bot, top] = ya < yb ? [first, last] : [last, first];
    if (!hero || Math.abs(yb - ya) > hero.rise)
      hero = { bottom: new THREE.Vector3(bot[0], Math.min(ya, yb), bot[1]), top: new THREE.Vector3(top[0], Math.max(ya, yb), top[1]), rise: Math.abs(yb - ya) };
    const geo = track(new LineGeometry());
    geo.setPositions(pts);
    root.add(new Line2(geo, cableMat));
    for (const [x, z] of [first, last]) {
      stationSpots.push({ pos: new THREE.Vector3(x, terrain.yAt(x, z), z), yaw, gondola });
      liftForStation.push({ name: lift.name, type: lift.type });
    }
  }

  const steel = track(new THREE.MeshStandardMaterial({ color: "#3b3f4a", flatShading: true, roughness: 0.6 }));
  const red = track(new THREE.MeshStandardMaterial({ color: LIFT_RED, flatShading: true, roughness: 0.55 }));
  const yAxis = new THREE.Vector3(0, 1, 0);
  const place = (mesh: THREE.InstancedMesh, i: number, p: THREE.Vector3, yaw: number, scale = new THREE.Vector3(1, 1, 1)) =>
    mesh.setMatrixAt(i, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(yAxis, yaw), scale));

  // T-tower: a pole (scaled to reach the cable) plus a crossbar across the line of the lift
  const poleGeo = track(new THREE.CylinderGeometry(1.4, 2.2, 1, 5));
  poleGeo.translate(0, 0.5, 0);
  const barGeo = track(new THREE.BoxGeometry(12 * PROP_SCALE, 1.4, 1.4));
  const poles = new THREE.InstancedMesh(poleGeo, steel, towers.length);
  const bars = new THREE.InstancedMesh(barGeo, steel, towers.length);
  towers.forEach((t, i) => {
    const ground = terrain.yAt(t.pos.x, t.pos.z);
    place(poles, i, new THREE.Vector3(t.pos.x, ground - 1, t.pos.z), t.yaw, new THREE.Vector3(1, t.pos.y - ground + 2, 1));
    place(bars, i, new THREE.Vector3(t.pos.x, t.pos.y + 1, t.pos.z), t.yaw);
  });
  poles.castShadow = bars.castShadow = true;

  // Cabins (gondolas) and chairs hang a few meters below the cable
  const S = PROP_SCALE;
  const gondolaGeo = track(mergeGeometries([new THREE.BoxGeometry(4, 4.4, 4.2).translate(0, -6.5, 0), new THREE.CylinderGeometry(0.25, 0.25, 4.5, 4).translate(0, -2.2, 0)]).scale(S, S, S));
  const chairGeo = track(mergeGeometries([new THREE.BoxGeometry(6, 0.8, 2.4).translate(0, -6, 0), new THREE.BoxGeometry(6, 2.4, 0.6).translate(0, -4.8, -1.1), new THREE.CylinderGeometry(0.2, 0.2, 5, 4).translate(0, -2.5, 0)]).scale(S, S, S));
  const gondolaCabins = cabins.filter((c) => c.gondola);
  const chairCabins = cabins.filter((c) => !c.gondola);
  const gondolaMesh = new THREE.InstancedMesh(gondolaGeo, red, gondolaCabins.length);
  const chairMesh = new THREE.InstancedMesh(chairGeo, red, chairCabins.length);
  gondolaCabins.forEach((c, i) => place(gondolaMesh, i, c.pos, c.yaw));
  chairCabins.forEach((c, i) => place(chairMesh, i, c.pos, c.yaw));
  gondolaMesh.castShadow = chairMesh.castShadow = true;

  // Stations: red body with a dark roof slab
  const stationGeo = track(mergeGeometries([new THREE.BoxGeometry(18, 11, 26).translate(0, 5.5, 0), new THREE.BoxGeometry(22, 3, 30).translate(0, 12.5, 0)]).scale(S, S, S));
  const stations = new THREE.InstancedMesh(stationGeo, red, stationSpots.length);
  stationSpots.forEach((st, i) => place(stations, i, st.pos, st.yaw, st.gondola ? new THREE.Vector3(1.3, 1.3, 1.3) : new THREE.Vector3(1, 1, 1)));
  stations.castShadow = true;
  root.add(poles, bars, gondolaMesh, chairMesh, stations);
  disposables.push({ dispose: () => [poles, bars, gondolaMesh, chairMesh, stations].forEach((x) => x.dispose()) });

  const peaks = data.peaks.map((p) => {
    const [x, z] = terrain.toXZ(p.coord[0], p.coord[1]);
    return { name: p.name, ele: p.ele, position: new THREE.Vector3(x, terrain.yAt(x, z), z) };
  });

  // Camera for the cosy "lift base" view: behind and above the bottom station, looking up the line.
  let baseView: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  if (hero) {
    const dir = new THREE.Vector3().subVectors(hero.top, hero.bottom).setY(0).normalize();
    const target = hero.bottom.clone().addScaledVector(dir, 700);
    target.y = terrain.yAt(target.x, target.z) + 120;
    const side = new THREE.Vector3(-dir.z, 0, dir.x); // perpendicular, so the lift crosses the frame diagonally
    const position = hero.bottom.clone().addScaledVector(dir, -600).addScaledVector(side, 320);
    position.y = Math.max(terrain.yAt(position.x, position.z), hero.bottom.y) + 260;
    baseView = { position, target };
  }

  // Landmarks: look at the spot from below and a little to the side of its fall line, so a cliff band faces the camera.
  const landmarkViews = (data.landmarks ?? []).map((l) => {
    const [x, z] = terrain.toXZ(l.coord[0], l.coord[1]);
    const gx = terrain.yAt(x + 150, z) - terrain.yAt(x - 150, z);
    const gz = terrain.yAt(x, z + 150) - terrain.yAt(x, z - 150);
    const len = Math.hypot(gx, gz) || 1;
    const turn = 0.35; // radians off the fall line, for a three-quarter view
    const dx = (-gx / len) * Math.cos(turn) - (-gz / len) * Math.sin(turn);
    const dz = (-gx / len) * Math.sin(turn) + (-gz / len) * Math.cos(turn);
    const D = l.kind === "pipe" || l.kind === "park" ? 240 : 700;
    const target = new THREE.Vector3(x, terrain.yAt(x, z) + 10, z);
    const position = new THREE.Vector3(x + dx * D, 0, z + dz * D);
    position.y = Math.max(terrain.yAt(position.x, position.z) + D * 0.22, target.y + D * 0.3);
    return { name: l.name, kind: l.kind, position, target };
  });

  // Most resorts face one way (Snowbird & Alta face north): view from where the runs come down to.
  const flow = new THREE.Vector2();
  for (const path of runPaths) {
    if (path.length < 2) continue;
    const [x0, z0] = path[0];
    const [x1, z1] = path[path.length - 1];
    const down = terrain.yAt(x0, z0) >= terrain.yAt(x1, z1) ? 1 : -1;
    flow.x += (x1 - x0) * down;
    flow.y += (z1 - z0) * down;
  }
  const homeDirection = flow.lengthSq() > 1 ? flow.normalize() : new THREE.Vector2(0.39, 0.92);

  return {
    terrain,
    homeDirection,
    landmarkViews,
    root,
    baseView,
    runGroup: runMeshes,
    runMeshes,
    runForFace,
    stations,
    liftForStation,
    lineMaterials,
    peaks,
    runRibbon: (i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(ribbon(runPaths[i], RUN_WIDTH * 1.6, RUN_LIFT + 1), 3));
      return g;
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/** Snow-laden low-poly pine: three tiers, each a white cone over a slightly wider green one so a green rim shows. */
function snowyPine(): THREE.BufferGeometry {
  const tint = (g: THREE.BufferGeometry, color: THREE.Color) => {
    g.deleteAttribute("uv");
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) color.toArray(col, i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  };
  const parts = [tint(new THREE.CylinderGeometry(1.4, 1.8, 6, 5).translate(0, 3, 0), TRUNK)];
  const tiers = [
    { base: 4, r: 10, h: 13 },
    { base: 11, r: 7.6, h: 11 },
    { base: 17.5, r: 5.2, h: 9.5 },
  ];
  for (const t of tiers) {
    parts.push(tint(new THREE.ConeGeometry(t.r, t.h, 7, 1, true).translate(0, t.base + t.h / 2, 0), PINE_GREEN));
    parts.push(tint(new THREE.ConeGeometry(t.r * 0.94, t.h * 0.9, 7, 1, true).translate(0, t.base + t.h * 0.1 + (t.h * 0.9) / 2 + 0.15, 0), PINE_SNOW));
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Gives a non-indexed geometry flat per-face colours: `base`, or `cap` on faces facing up (snow). */
function capColors(g: THREE.BufferGeometry, base: THREE.Color, cap: THREE.Color | null, faceColor?: (centroidY: number) => THREE.Color) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute("uv");
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    nrm.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    const color = cap && nrm.y > 0.4 ? cap : faceColor ? faceColor((a.y + b.y + c.y) / 3) : base;
    for (let k = 0; k < 3; k++) color.toArray(col, (i + k) * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Winter aspen: slender white trunk with dark knots, a bare twiggy crown in pale taupe dusted with snow. */
function winterAspen(): THREE.BufferGeometry {
  const parts = [
    capColors(new THREE.CylinderGeometry(0.9, 1.3, 18, 5, 12).translate(0, 9, 0), ASPEN_BARK, null, (y) =>
      Math.floor(y / 1.5) % 3 === 1 && y > 2 ? ASPEN_SCAR : ASPEN_BARK,
    ),
  ];
  const blobs = [
    { r: 3.6, at: [0, 18, 0] },
    { r: 2.9, at: [1.9, 21.5, 0.8] },
    { r: 2.6, at: [-1.8, 15.5, -1] },
    { r: 2.2, at: [0.4, 24, -0.6] },
  ] as const;
  for (const { r, at } of blobs) parts.push(capColors(new THREE.IcosahedronGeometry(r, 0).scale(1, 1.35, 1).translate(at[0], at[1], at[2]), ASPEN_TWIGS, TREE_SNOW));
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Scrub oak / maple thicket: a low clump of bare brush, snow on top. */
function scrubThicket(): THREE.BufferGeometry {
  const blobs = [
    { r: 2.8, at: [0, 2.2, 0] },
    { r: 2.3, at: [2.6, 1.7, 0.8] },
    { r: 2.1, at: [-2.2, 1.6, 1.2] },
    { r: 1.9, at: [0.6, 1.5, -2.3] },
    { r: 1.7, at: [-1.4, 1.3, -1.9] },
    { r: 1.6, at: [2.4, 1.2, -1.5] },
  ] as const;
  const parts = blobs.map(({ r, at }) => capColors(new THREE.DodecahedronGeometry(r, 0).scale(1, 0.8, 1).translate(at[0], at[1], at[2]), SCRUB, TREE_SNOW));
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Blocky low-poly crag, unit size centred on the origin: a six-sided block, slightly tapered, with a
 * mostly flat top so snow sits on it like a ledge, and a flatter, steeper front (+z, downhill when
 * placed). Neighbouring crags overlap into a stepped cliff band. `seed` gives a few distinct shapes.
 */
function outcrop(seed: number): THREE.BufferGeometry {
  const rand = rng(1000 + seed);
  const g = new THREE.CylinderGeometry(0.48, 0.6, 1, 6, 2).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute;
  // Non-indexed: the same corner appears in several faces, so jitter by position to keep it watertight.
  const moved = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!moved.has(key)) {
      const y = p.getY(i);
      const k = 0.8 + rand() * 0.4;
      const z = p.getZ(i) * k;
      const dy = y > 0.45 ? (rand() - 0.5) * 0.12 : y > -0.45 ? (rand() - 0.5) * 0.25 : 0;
      moved.set(key, [p.getX(i) * k, y + dy, z > 0 ? z * 0.6 : z]);
    }
    p.setXYZ(i, ...moved.get(key)!);
  }
  return capColors(g, CLIFF_ROCK, TREE_SNOW, () => (rand() < 0.45 ? CLIFF_ROCK_DARK : CLIFF_ROCK));
}

/** Paints every face one colour (non-indexed, uv-free) so pieces can be merged. */
function paint(g: THREE.BufferGeometry, color: THREE.Color) {
  return capColors(g, color, null);
}

/**
 * Low-poly kicker (jump), local +z = downhill. A curved ramp up to a lip, then a short knuckle:
 * snow-white take-off with blue-grey sides and a blue painted lip line.
 */
function kicker(): THREE.BufferGeometry {
  const L = 9;
  const H = 2.6;
  const W = 6;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(L * 0.65, 0, L, H);
  shape.lineTo(L + 1.2, H * 0.92);
  shape.lineTo(L + 4.5, 0);
  shape.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -W / 2).rotateY(-Math.PI / 2).translate(0, 0, -L / 2);
  const body = capColors(g, PARK_SIDE, PARK_SNOW);
  const lip = paint(new THREE.BoxGeometry(W + 0.2, 0.45, 0.8).translate(0, H + 0.1, L / 2 - 0.2), PARK_BLUE);
  const merged = mergeGeometries([body, lip]);
  body.dispose();
  lip.dispose();
  return merged;
}

/** Snow-park box: a long flat-topped box on a snow ramp-in, orange top, dark sides. */
function parkBox(): THREE.BufferGeometry {
  const parts = [
    paint(new THREE.BoxGeometry(1.4, 0.9, 9).translate(0, 0.45, 0), PARK_DARK),
    paint(new THREE.BoxGeometry(1.5, 0.12, 9.1).translate(0, 0.96, 0), PARK_ORANGE),
    capColors(new THREE.BoxGeometry(2.4, 0.9, 2.5).translate(0, 0.25, -5.6), PARK_SIDE, PARK_SNOW),
  ];
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/** Rail: a steel tube on three posts with a snow ramp-in. */
function parkRail(): THREE.BufferGeometry {
  const parts = [paint(new THREE.CylinderGeometry(0.14, 0.14, 10, 6).rotateX(Math.PI / 2).translate(0, 1.2, 0), PARK_STEEL)];
  for (const z of [-4.2, 0, 4.2]) parts.push(paint(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 5).translate(0, 0.6, z), PARK_DARK));
  parts.push(capColors(new THREE.BoxGeometry(2.2, 1.1, 2.5).translate(0, 0.35, -6), PARK_SIDE, PARK_SNOW));
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}

/**
 * Halfpipe swept down a path: flat bottom, quarter-pipe walls ending in a little vertical, flat decks,
 * and outer banks back down to the snow. Real superpipe dimensions (22 ft / 6.7 m walls, ~8 m flat),
 * drawn PARK_SCALE× like the other props. The floor follows a straight-line fit of the ground so the pipe
 * keeps an even grade instead of copying every bump of the 40 m terrain.
 */
function halfpipe(path: [number, number][], terrain: Terrain): THREE.BufferGeometry {
  const S = PARK_SCALE;
  const R = 6.7 * S;
  const FLAT = 8 * S;
  const VERT = 0.4 * S;
  const DECK = 4 * S;
  const DIG = R * 0.55; // how far the floor sits below the surrounding snow
  // cross-section, left deck edge → right deck edge: [sideways offset, height above floor]
  const half: [number, number][] = [[FLAT / 2 + R + DECK + R * 0.6, DIG - 1], [FLAT / 2 + R + DECK, R + VERT], [FLAT / 2 + R, R + VERT], [FLAT / 2 + R, R]];
  for (let i = 1; i < 6; i++) {
    const a = (Math.PI / 2) * (i / 6);
    half.push([FLAT / 2 + R * Math.cos(a), R - R * Math.sin(a)]);
  }
  half.push([FLAT / 2, 0]);
  const profile = [...half, ...half.slice().reverse().map(([o, h]) => [-o, h] as [number, number])];

  // distance along the path and a linear fit of ground height → even grade
  const d: number[] = [0];
  for (let i = 1; i < path.length; i++) d.push(d[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const ys = path.map(([x, z]) => terrain.yAt(x, z));
  const n = path.length;
  const md = d.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (d[i] - md) * (ys[i] - my);
    den += (d[i] - md) ** 2;
  }
  const slope = den ? num / den : 0;
  const floorAt = (i: number) => my + slope * (d[i] - md) - DIG;

  const pos: number[] = [];
  const col: number[] = [];
  const ring = (i: number) => {
    const [xa, za] = path[Math.max(0, i - 1)];
    const [xb, zb] = path[Math.min(n - 1, i + 1)];
    const len = Math.hypot(xb - xa, zb - za) || 1;
    const sx = -(zb - za) / len; // sideways (left of travel)
    const sz = (xb - xa) / len;
    const [x, z] = path[i];
    const f = floorAt(i);
    return profile.map(([o, h]) => [x + sx * o, f + h, z + sz * o] as [number, number, number]);
  };
  const WALL = new THREE.Color("#c9dcf2");
  let prev = ring(0);
  for (let i = 1; i < n; i++) {
    const cur = ring(i);
    for (let j = 0; j < profile.length - 1; j++) {
      const quad = [prev[j], cur[j], cur[j + 1], prev[j], cur[j + 1], prev[j + 1]];
      const h = (profile[j][1] + profile[j + 1][1]) / 2;
      const vert = Math.abs(Math.abs(profile[j][0]) - (FLAT / 2 + R)) < 0.01 && Math.abs(Math.abs(profile[j + 1][0]) - (FLAT / 2 + R)) < 0.01;
      // blue coping along the lip, blue-tinted walls, bright floor and decks
      const c = vert ? PARK_BLUE : h < 0.05 || h > R + VERT - 0.05 ? PARK_SNOW : WALL;
      for (const v of quad) {
        pos.push(...v);
        col.push(c.r, c.g, c.b);
      }
    }
    prev = cur;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
