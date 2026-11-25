import * as THREE from "three";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { cliffIndex } from "./cliffs";
import type { ParkFeature } from "./park";
import { createTerrain, densify, type Terrain } from "./terrain";
import type { MountainData, ParkLine } from "./types";
import { DIFFICULTY, difficultyOf } from "./difficulty";
import { facing, liftBaseView, type SkiLine, skiLines, viewAt } from "./views";

export { DIFFICULTY, difficultyOf } from "./difficulty";
export type { SkiLine } from "./views";
import { CLIFF_ROCK, CLIFF_SCALE, EARTH_BOTTOM, EARTH_TOP, halfpipe, kicker, outcrop, PARK_SCALE, parkBox, parkRail, PIPE, pipeFloor, RIDE_LINE, rng, ROCK, type RockCellPlacement, scrubThicket, SNOW, SNOW_SHADE, snowyPine, type TreeKind, winterAspen } from "./props";


/*
 * Low-poly "diorama" of a resort: flat-shaded snowy terrain on a layered earth base,
 * instanced trees (snow-laden pines, bare white-trunked aspens, scrub-oak thickets, placed from
 * satellite land cover when the mountain has it), runs as ribbons draped on the snow, lifts as cables on
 * T-towers with little red cabins/chairs and chunky red stations.
 */


const LIFT_RED = "#d8433b";
const BASE_DEPTH = 260;
const RUN_WIDTH = 11;
const RUN_LIFT = 2.5;
const CABLE_CLEARANCE = 30;
const TOWER_SPACING = 160;
/** Diorama scale: trees, cabins and buildings are drawn larger than life so they read from far away. */
const PROP_SCALE = 2.2;
/** Upper elevation limit for oak/maple scrub (Wasatch & Colorado: roughly 8,000–8,500 ft). */
const SCRUB_MAX_ELE_M = 2500;
/** Rough cap on trees per mountain (instanced, but each still costs vertices every frame). */
const TREE_BUDGET = 70_000;
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
  /** light up these runs (by name) in full colour and fade the rest; null goes back to normal.
   * Returns the world-space bounds of the lit runs, to frame them. */
  highlightRuns: (names: Set<string> | null) => THREE.Box3 | null;
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
  /** the mountain's named lines (chutes, couloirs, faces, steeps): what locals call them, where they drop in */
  lines: SkiLine[];
  runRibbon: (runIndex: number) => THREE.BufferGeometry;
  /** rails, boxes, kickers and halfpipes as built, for the replay's park tricks */
  parkFeatures: ParkFeature[];
  dispose: () => void;
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

  // "My runs": skied runs drawn bright and a little wider on top, everything else faded back
  const highlightMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3, side: THREE.DoubleSide }));
  let highlight: THREE.Mesh | null = null;
  const highlightRuns = (names: Set<string> | null): THREE.Box3 | null => {
    if (highlight) {
      root.remove(highlight);
      highlight.geometry.dispose();
      highlight = null;
    }
    for (const m of runMeshes) {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.userData.base ??= mat.opacity;
      mat.opacity = names ? 0.12 : mat.userData.base;
    }
    if (!names?.size) return null;
    const positions: number[] = [];
    const colors: number[] = [];
    const col = new THREE.Color();
    data.runs.forEach((r, i) => {
      if (!r.name || !names.has(r.name)) return;
      const p = ribbon(runPaths[i], RUN_WIDTH * 1.2, RUN_LIFT + 0.6);
      positions.push(...p);
      col.set(DIFFICULTY[difficultyOf(r.difficulty)].color);
      for (let k = 0; k < p.length / 3; k++) colors.push(col.r, col.g, col.b);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    highlight = new THREE.Mesh(geo, highlightMat);
    highlight.renderOrder = 2;
    root.add(highlight);
    if (!positions.length) return null;
    geo.computeBoundingBox();
    root.updateMatrixWorld();
    return geo.boundingBox!.clone().applyMatrix4(root.matrixWorld);
  };
  disposables.push({ dispose: () => highlight?.geometry.dispose() });

  // --- trees, kept off the runs. With a satellite forest layer the cut runs are already open ground,
  // so the mask only keeps trees off the drawn ribbons (±15 m); a wide margin wiped out real tree
  // islands between close runs (Deer Valley's Stein's Way / Perseverance). Without one, clear widely.
  const MASK_M = 10;
  const pad = data.forest ? 1 : 4;
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
  for (const path of runPaths) for (const [x, z] of densify(path, 5)) mark(x, z, pad);
  for (const l of data.lifts) for (const [x, z] of densify(l.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)), 5)) mark(x, z, 1);
  for (const p of data.parks ?? []) for (const [x, z] of densify(p.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)), 5)) mark(x, z, p.kind === "pipe" ? 6 : 4);

  const isClear = (x: number, z: number) =>
    Math.abs(x) < hw - 10 && Math.abs(z) < hd - 10 && !clear[Math.floor((z + hd) / MASK_M) * mCols + Math.floor((x + hw) / MASK_M)] && cliffs.rockFraction(x, z, 5) === 0 && cliffs.rockFraction(x, z, 12) < 0.2; // among scattered rock (Mayflower Bowl), never on it
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
    const h = parseInt(forest.heights[r * forest.cols + c], 36) * 2;
    // Gambel oak / maple thin out above ~2,500 m; low deciduous canopy up there is young or stunted
    // aspen (Deer Valley's Mayflower Bowl), so draw it as aspen rather than oak thicket.
    if (v === "3" && terrain.elevationAt(x, z) > SCRUB_MAX_ELE_M) return { kind: "aspen", h: Math.max(h, 8) };
    return { kind: v === "1" ? "pine" : v === "2" ? "aspen" : "scrub", h };
  };
  /** Real canopy height → diorama scale, so a 20 m spruce stand towers over a 4 m oak thicket. */
  const sizeFor = (kind: TreeKind, h: number) => {
    const jitter = 0.85 + rand() * 0.3;
    if (kind === "scrub") return PROP_SCALE * Math.min(2.2, 1.4 + h / 8) * jitter; // drawn chunky so thickets read from afar
    return PROP_SCALE * Math.min(1.3, Math.max(0.55, 0.45 + h / 26)) * jitter;
  };

  const spots: Record<TreeKind, { x: number; z: number; s: number }[]> = { pine: [], aspen: [], scrub: [] };
  // One tree per STEP×STEP of forest: dense (24 m) where the budget allows, wider on the giant maps
  // (Park City, Vail) so the tree count, and the frame rate, stays about where Deer Valley's is.
  let woodedM2 = 0;
  if (forest) for (const ch of forest.cells) if (ch !== "0") woodedM2 += forest.cellM * forest.cellM;
  const STEP = forest ? Math.max(24, Math.sqrt(woodedM2 / TREE_BUDGET)) : 40;
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
  const parkFeatures: ParkFeature[] = [];
  if (data.parks?.length) {
    const parkMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 }));
    const pieces = { kicker: track(kicker()), box: track(parkBox()), rail: track(parkRail()) };
    // what's laid down a park line, and how far apart: spaced so each hit is its own moment in a replay
    // (a real park packs them tighter, but back-to-back tricks get tiring to watch)
    const LINES: Record<ParkLine, { cycle: (keyof typeof pieces)[]; gap: number }> = {
      mixed: { cycle: ["kicker", "rail", "box"], gap: 170 },
      jumps: { cycle: ["kicker"], gap: 230 },
      jibs: { cycle: ["box", "rail"], gap: 140 },
    };
    const q = new THREE.Quaternion();
    const pitchQ = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const xAxis = new THREE.Vector3(1, 0, 0);
    for (const park of data.parks) {
      const path = densify(park.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)), 3);
      if (path.length < 2) continue;
      if (park.kind === "pipe") {
        const geo = track(halfpipe(path, terrain));
        const fit = pipeFloor(path, terrain);
        parkFeatures.push({ kind: "pipe", park: park.name, path, floor0: fit.floor0, floorSlope: fit.slope, halfFlat: PIPE.FLAT / 2, radius: PIPE.R });
        const mesh = new THREE.Mesh(geo, parkMat);
        mesh.name = `pipe:${park.name ?? ""}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        continue;
      }
      let dist = 0;
      const { cycle, gap } = LINES[park.line ?? "mixed"];
      let next = 50; // clear of the lift station that often sits at the top of a park
      let k = 0;
      for (let i = 1; i < path.length - 1; i++) {
        const [x0, z0] = path[i - 1];
        const [x1, z1] = path[i];
        dist += Math.hypot(x1 - x0, z1 - z0);
        if (dist < next) continue;
        next += gap;
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
        // the line a skier rides, in world space (root is untransformed)
        mesh.updateMatrix();
        const [a, b] = RIDE_LINE[kind].map(([y, z]) => new THREE.Vector3(0, y, z).applyMatrix4(mesh.matrix));
        parkFeatures.push({ kind, park: park.name, start: { x: a.x, y: a.y, z: a.z }, end: { x: b.x, y: b.y, z: b.z } });
      }
    }
  }

  // --- lifts: straight cables between stations (never dipping into the snow), T-towers,
  // little red cabins/chairs hanging off the cable, chunky red stations at each end.
  const lineMaterials: LineMaterial[] = [];
  const cableMat = track(new LineMaterial({ color: 0x555a66, linewidth: 1.1, worldUnits: false, transparent: true, opacity: 0.8 }));
  lineMaterials.push(cableMat);

  // --- marked hike-to routes (boot packs): dashed amber lines hugging the snow
  if (data.hikes?.length) {
    const hikeMat = track(new LineMaterial({ color: 0xe0a020, linewidth: 2.2, worldUnits: false, dashed: true, dashSize: 16, gapSize: 10, transparent: true, opacity: 0.95 }));
    lineMaterials.push(hikeMat);
    for (const hike of data.hikes) {
      const path = densify(hike.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)), 6);
      if (path.length < 2) continue;
      const g = new LineGeometry();
      g.setPositions(path.flatMap(([x, z]) => [x, terrain.yAt(x, z) + 3, z]));
      const line = new Line2(g, hikeMat);
      line.computeLineDistances();
      line.name = `hike:${hike.name ?? ""}`;
      root.add(line);
      disposables.push({ dispose: () => g.dispose() });
    }
  }
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

  const baseView = hero ? liftBaseView(terrain, hero) : null;
  const landmarkViews = (data.landmarks ?? []).map((l) => {
    const [x, z] = terrain.toXZ(l.coord[0], l.coord[1]);
    return { name: l.name, kind: l.kind, ...viewAt(terrain, x, z, l.kind === "pipe" || l.kind === "park" ? 240 : 700) };
  });
  const lines = skiLines(data, terrain, runPaths);
  const homeDirection = facing(terrain, runPaths);

  return {
    terrain,
    homeDirection,
    landmarkViews,
    lines,
    root,
    baseView,
    runGroup: runMeshes,
    highlightRuns,
    runMeshes,
    runForFace,
    stations,
    liftForStation,
    lineMaterials,
    peaks,
    parkFeatures,
    runRibbon: (i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(ribbon(runPaths[i], RUN_WIDTH * 1.6, RUN_LIFT + 1), 3));
      return g;
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
