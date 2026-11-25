import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { cliffIndex } from "./cliffs";
import type { Terrain } from "./terrain";

/**
 * Low-poly prop geometry for the mountain diorama (trees, cliff outcrops, park features, halfpipes)
 * and the palette they share with the scene. Geometry only: buildScene.ts places and instances them.
 */

/** Small deterministic RNG so trees don't reshuffle on every visit. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SNOW = new THREE.Color("#f4f4f1");
/** exposed cliff rock (lidar-detected), darker than the pale rock used for merely steep faces */
export const CLIFF_ROCK = new THREE.Color("#959aa2");
export const CLIFF_ROCK_DARK = new THREE.Color("#7b8089");
export const SNOW_SHADE = new THREE.Color("#e6e7e4");
export const ROCK = new THREE.Color("#d9dbd9");
export const EARTH_TOP = new THREE.Color("#d9c3a9");
export const EARTH_BOTTOM = new THREE.Color("#a98d74");
export const PINE_GREEN = new THREE.Color("#2f5f37");
export const PINE_SNOW = new THREE.Color("#f6f6f3");
export const TRUNK = new THREE.Color("#6b4a35");
export const ASPEN_BARK = new THREE.Color("#eeebe3");
export const ASPEN_SCAR = new THREE.Color("#4d4641");
export const ASPEN_TWIGS = new THREE.Color("#d8cbc6");
export const SCRUB = new THREE.Color("#a5735c");
export const TREE_SNOW = new THREE.Color("#f7f7f4");

export type TreeKind = "pine" | "aspen" | "scrub";
export type RockCellPlacement = { cell: ReturnType<typeof cliffIndex>["cells"][number]; jitter: number };
/** Park features and pipes are drawn larger than life so they read next to the oversized trees. */
export const PARK_SCALE = 2.4;
export const PARK_SNOW = new THREE.Color("#fbfcfd");
export const PARK_SIDE = new THREE.Color("#a9bfd8");
export const PARK_BLUE = new THREE.Color("#3d8bfd");
export const PARK_ORANGE = new THREE.Color("#ff8a3d");
export const PARK_STEEL = new THREE.Color("#aab2bd");
export const PARK_DARK = new THREE.Color("#2b3445");
/** Cliff outcrops are drawn a bit larger than life, like the trees, so bands read from across the resort. */
export const CLIFF_SCALE = 1.5;

/** Snow-laden low-poly pine: three tiers, each a white cone over a slightly wider green one so a green rim shows. */
export function snowyPine(): THREE.BufferGeometry {
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
export function capColors(g: THREE.BufferGeometry, base: THREE.Color, cap: THREE.Color | null, faceColor?: (centroidY: number) => THREE.Color) {
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
export function winterAspen(): THREE.BufferGeometry {
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
export function scrubThicket(): THREE.BufferGeometry {
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
export function outcrop(seed: number): THREE.BufferGeometry {
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
export function paint(g: THREE.BufferGeometry, color: THREE.Color) {
  return capColors(g, color, null);
}

/** Each prop's riding line in its local frame, [height, z] uphill → downhill (kicker: ramp foot → lip). */
export const RIDE_LINE: Record<"kicker" | "box" | "rail", [number, number][]> = {
  kicker: [[0, -4.5], [2.9, 4.5]],
  box: [[1.02, -4.5], [1.02, 4.5]],
  rail: [[1.34, -5], [1.34, 5]],
};

/**
 * Low-poly kicker (jump), local +z = downhill. A curved ramp up to a lip, then a short knuckle:
 * snow-white take-off with blue-grey sides and a blue painted lip line.
 */
export function kicker(): THREE.BufferGeometry {
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
export function parkBox(): THREE.BufferGeometry {
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
export function parkRail(): THREE.BufferGeometry {
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
export const PIPE = { R: 6.7 * PARK_SCALE, FLAT: 8 * PARK_SCALE, VERT: 0.4 * PARK_SCALE, DECK: 4 * PARK_SCALE };

/**
 * Even grade for a pipe floor: a straight-line fit of ground height against distance along the path,
 * dug in by part of the wall height. floor(d) = floor0 + slope × d.
 */
export function pipeFloor(path: [number, number][], terrain: Terrain) {
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
  const dig = PIPE.R * 0.55; // how far the floor sits below the surrounding snow
  return { along: d, slope, floor0: my - slope * md - dig };
}

export function halfpipe(path: [number, number][], terrain: Terrain): THREE.BufferGeometry {
  const { R, FLAT, VERT, DECK } = PIPE;
  const DIG = R * 0.55;
  // cross-section, left deck edge → right deck edge: [sideways offset, height above floor]
  const half: [number, number][] = [[FLAT / 2 + R + DECK + R * 0.6, DIG - 1], [FLAT / 2 + R + DECK, R + VERT], [FLAT / 2 + R, R + VERT], [FLAT / 2 + R, R]];
  for (let i = 1; i < 6; i++) {
    const a = (Math.PI / 2) * (i / 6);
    half.push([FLAT / 2 + R * Math.cos(a), R - R * Math.sin(a)]);
  }
  half.push([FLAT / 2, 0]);
  const profile = [...half, ...half.slice().reverse().map(([o, h]) => [-o, h] as [number, number])];

  // even grade instead of copying every bump of the 40 m terrain
  const fit = pipeFloor(path, terrain);
  const n = path.length;
  const floorAt = (i: number) => fit.floor0 + fit.slope * fit.along[i];

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
