import * as THREE from "three";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createTerrain, densify, type Terrain } from "./terrain";
import type { MountainData } from "./types";

/*
 * Low-poly "diorama" of a resort: flat-shaded snowy terrain on a layered earth base,
 * instanced snow-laden tiered pines, runs as ribbons draped on the snow, lifts as cables on
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
const SNOW_SHADE = new THREE.Color("#e6e7e4");
const ROCK = new THREE.Color("#d9dbd9");
const EARTH_TOP = new THREE.Color("#d9c3a9");
const EARTH_BOTTOM = new THREE.Color("#a98d74");
const PINE_GREEN = new THREE.Color("#2f5f37");
const PINE_SNOW = new THREE.Color("#f6f6f3");
const TRUNK = new THREE.Color("#6b4a35");
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
  for (let f = 0; f < surface.attributes.position.count; f += 3) {
    const slope = n.getY(f); // flat shading: all three vertices share the face normal
    if (slope < 0.62) c.copy(ROCK);
    else c.copy(SNOW).lerp(SNOW_SHADE, Math.min(1, (1 - slope) * 3));
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

  const treeSpots: { x: number; z: number; s: number }[] = [];
  const STEP = 40;
  const slopeAt = (x: number, z: number) => {
    const dx = (terrain.yAt(x + 20, z) - terrain.yAt(x - 20, z)) / 40;
    const dz = (terrain.yAt(x, z + 20) - terrain.yAt(x, z - 20)) / 40;
    return Math.hypot(dx, dz);
  };
  for (let z = -hd + STEP / 2; z < hd; z += STEP)
    for (let x = -hw + STEP / 2; x < hw; x += STEP) {
      const tx = x + (rand() - 0.5) * STEP;
      const tz = z + (rand() - 0.5) * STEP;
      if (Math.abs(tx) > hw - 10 || Math.abs(tz) > hd - 10) continue;
      if (clear[Math.floor((tz + hd) / MASK_M) * mCols + Math.floor((tx + hw) / MASK_M)]) continue;
      if (slopeAt(tx, tz) > 1.1 || terrain.elevationAt(tx, tz) > 3000) continue;
      if (rand() < 0.22) continue; // glades
      treeSpots.push({ x: tx, z: tz, s: PROP_SCALE * (0.7 + rand() * 0.65) });
    }

  const pineGeo = track(snowyPine());
  const trees = new THREE.InstancedMesh(pineGeo, track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 })), treeSpots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  treeSpots.forEach((t, i) => {
    q.setFromAxisAngle(up, rand() * Math.PI);
    m.compose(new THREE.Vector3(t.x, terrain.yAt(t.x, t.z) - 1, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + rand() * 0.35), t.s));
    trees.setMatrixAt(i, m);
  });
  trees.castShadow = true;
  trees.receiveShadow = true;
  root.add(trees);
  disposables.push({ dispose: () => trees.dispose() });

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

  return {
    terrain,
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
