/*
 * Park tricks for the replay. When the skier's track runs down a terrain park or halfpipe, the replay
 * puts them on the features and animates a trick: sliding a rail or box with skis across it, a spin off
 * a kicker, airs wall to wall in the pipe.
 *
 * Everything here is illustrative. GPS (±5 m) can tell that someone skied the park, not which feature
 * they hit, and the park props are placed along the park line, not surveyed. So every trick is tagged
 * `source: "simulated"`. A measured trick (e.g. spin from a watch gyroscope, once we record one) would
 * come in with `source: "measured"` and replace the simulated spin — see `Trick`.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A rail, box or kicker as built in the scene: its riding line in world space, uphill → downhill. */
export interface LineFeature {
  kind: "rail" | "box" | "kicker";
  /** the park it belongs to, e.g. "3 Kings" */
  park: string | null;
  /** rail/box: start of the top surface; kicker: foot of the ramp */
  start: Vec3;
  /** rail/box: end of the top surface; kicker: the lip */
  end: Vec3;
}

/** A halfpipe: its centre line (downhill), the floor's even grade, and the cross-section. */
export interface PipeFeature {
  kind: "pipe";
  park: string | null;
  path: [number, number][];
  /** floor height = floor0 + floorSlope × distance along the path */
  floor0: number;
  floorSlope: number;
  /** half the flat bottom's width */
  halfFlat: number;
  /** transition radius (wall height) */
  radius: number;
}

export type ParkFeature = LineFeature | PipeFeature;

export interface Trick {
  /** what to show, e.g. "Rail slide", "720", "Halfpipe · 360" */
  label: string;
  /** spin in degrees (0 for a straight air or a slide) */
  spinDeg: number;
  source: "simulated" | "measured";
}

/** Where the skier is and how they're posed at this moment of a trick. */
export interface TrickFrame {
  trick: Trick;
  /** what's being ridden; the replay frames a pipe differently (its walls hide a side view) */
  feature: ParkFeature["kind"];
  /** name of the park or pipe being ridden */
  park: string | null;
  position: Vec3;
  /** world yaw of travel, same convention as the replay (atan2(dx, dz)) */
  heading: number;
  /** extra body rotation about the vertical: the slide angle or the spin so far, radians */
  bodyYaw: number;
  /** body roll toward a pipe wall, radians */
  roll: number;
  pose: "ride" | "slide" | "air";
  /** 0..1, how far into a grab */
  grab: number;
  /** 0..1, how far into a spread eagle (arms and skis flung out wide) */
  spread: number;
}

export interface GroundSampler {
  yAt(x: number, z: number): number;
}

// --- tuning (world units = meters of the diorama)
const CAPTURE_M = 24; // how far off a feature's line the GPS track can be and still "hit" it
const ALIGN = 0.4; // cos of the max angle between travel and the feature
const SLIDE_IN = 0.45; // approach + pop onto a rail, as a fraction of its length
const SLIDE_OUT = 0.4; // pop off
const FLIGHT_M = 26; // kicker: lip to landing
const APEX_M = 12; // kicker: height of the air above the lip–landing line
const PIPE_HIT_M = 34; // pipe: distance down the pipe between wall hits
const PIPE_AIR_M = 9; // pipe: air above the coping
const PIPE_AIR_FROM = 0.88; // |sin| beyond which the skier is out above the coping
const LOOKAHEAD_M = 40; // start slowing the replay this far before a feature

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic pick so the same feature on the same run always gets the same trick. */
function hash(a: number, b: number) {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

const KICKER_TRICKS: { label: string; spinDeg: number; grab: boolean; spread?: boolean }[] = [
  { label: "Spread eagle", spinDeg: 0, grab: false, spread: true },
  { label: "Straight air · mute grab", spinDeg: 0, grab: true },
  { label: "360", spinDeg: 360, grab: false },
  { label: "360 · safety grab", spinDeg: 360, grab: true },
  { label: "720", spinDeg: 720, grab: false },
  { label: "540 · tail grab", spinDeg: 540, grab: true },
];
const PIPE_TRICKS: { label: string; spinDeg: number; grab: boolean }[] = [
  { label: "Air · mute grab", spinDeg: 0, grab: true },
  { label: "360", spinDeg: 360, grab: false },
  { label: "Air · safety grab", spinDeg: 0, grab: true },
  { label: "720", spinDeg: 720, grab: true },
];

interface LineGeom {
  f: LineFeature;
  ux: number;
  uz: number;
  len: number;
  yaw: number;
}
interface PipeGeom {
  f: PipeFeature;
  along: number[];
  total: number;
}

export function createParkTricks(features: ParkFeature[], ground: GroundSampler) {
  const lines: LineGeom[] = [];
  const pipes: PipeGeom[] = [];
  for (const f of features) {
    if (f.kind === "pipe") {
      const along = [0];
      for (let i = 1; i < f.path.length; i++) along.push(along[i - 1] + Math.hypot(f.path[i][0] - f.path[i - 1][0], f.path[i][1] - f.path[i - 1][1]));
      if (along.at(-1)! > 1) pipes.push({ f, along, total: along.at(-1)! });
    } else {
      const dx = f.end.x - f.start.x;
      const dz = f.end.z - f.start.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.5) lines.push({ f, ux: dx / len, uz: dz / len, len, yaw: Math.atan2(dx, dz) });
    }
  }

  /** Position along a line feature: t (0 = start, 1 = end, in feature lengths) and signed lateral offset. */
  const project = (g: LineGeom, x: number, z: number) => {
    const rx = x - g.f.start.x;
    const rz = z - g.f.start.z;
    return { t: (rx * g.ux + rz * g.uz) / g.len, lat: -rx * g.uz + rz * g.ux };
  };
  const aligned = (yaw: number, heading: number) => Math.cos(heading - yaw) > ALIGN;

  /** Nearest point on the pipe's centre line: distance along it, lateral offset, local direction. */
  const projectPipe = (g: PipeGeom, x: number, z: number) => {
    let best = { d2: Infinity, s: 0, lat: 0, ux: 0, uz: 1 };
    const p = g.f.path;
    for (let i = 1; i < p.length; i++) {
      const [ax, az] = p[i - 1];
      const sx = p[i][0] - ax;
      const sz = p[i][1] - az;
      const l2 = sx * sx + sz * sz || 1;
      const k = clamp01(((x - ax) * sx + (z - az) * sz) / l2);
      const qx = ax + sx * k;
      const qz = az + sz * k;
      const d2 = (x - qx) ** 2 + (z - qz) ** 2;
      if (d2 < best.d2) {
        const l = Math.sqrt(l2);
        const ux = sx / l;
        const uz = sz / l;
        best = { d2, s: g.along[i - 1] + k * l, lat: -(x - qx) * uz + (z - qz) * ux, ux, uz };
      }
    }
    return best;
  };

  function lineFrame(g: LineGeom, index: number, x: number, z: number, t: number, lat: number, seed: number): TrickFrame | null {
    const { f, ux, uz, len } = g;
    // snap onto the feature's line, easing in and out so the skier doesn't teleport sideways
    const onX = (k: number) => x + uz * lat * k;
    const onZ = (k: number) => z - ux * lat * k;
    const r = hash(index, seed);

    if (f.kind === "kicker") {
      const flight = FLIGHT_M / len;
      if (t < -0.15 || t > 1 + flight + 0.2) return null;
      const pick = KICKER_TRICKS[Math.floor(r * KICKER_TRICKS.length)];
      const trick: Trick = { label: pick.label, spinDeg: pick.spinDeg, source: "simulated" };
      const k = smooth(-0.15, 0.05, t) * (1 - smooth(1 + flight, 1 + flight + 0.2, t));
      const px = onX(k);
      const pz = onZ(k);
      if (t <= 1) {
        const ramp = clamp01(t);
        const y = t < 0 ? ground.yAt(px, pz) : lerp(f.start.y, f.end.y, ramp * ramp);
        return { trick, feature: f.kind,
        park: f.park, position: { x: px, y, z: pz }, heading: g.yaw, bodyYaw: 0, roll: 0, pose: "ride", grab: 0, spread: 0 };
      }
      const u = clamp01((t - 1) / flight); // 0 at the lip, 1 on landing
      const landY = ground.yAt(f.end.x + ux * FLIGHT_M, f.end.z + uz * FLIGHT_M);
      const y = u < 1 ? lerp(f.end.y, landY, u) + APEX_M * 4 * u * (1 - u) : ground.yAt(px, pz);
      const spin = ((pick.spinDeg * Math.PI) / 180) * smooth(0.05, 0.9, u) * (r < 0.5 ? 1 : -1);
      return {
        trick,
        feature: f.kind,
        park: f.park,
        position: { x: px, y: Math.max(y, ground.yAt(px, pz)), z: pz },
        heading: g.yaw,
        bodyYaw: spin,
        roll: 0,
        pose: u < 1 ? "air" : "ride",
        grab: pick.grab ? Math.sin(Math.PI * smooth(0.15, 0.85, u)) : 0,
        spread: pick.spread && u < 1 ? Math.sin(Math.PI * smooth(0.1, 0.85, u)) : 0,
      };
    }

    // rail or box: pop on turning the skis across it, slide, pop off straightening out
    if (t < -SLIDE_IN || t > 1 + SLIDE_OUT) return null;
    const trick: Trick = { label: f.kind === "rail" ? "Rail slide" : "Box slide", spinDeg: 0, source: "simulated" };
    const k = smooth(-SLIDE_IN, -SLIDE_IN + 0.2, t) * (1 - smooth(1 + SLIDE_OUT - 0.15, 1 + SLIDE_OUT, t));
    const px = onX(k);
    const pz = onZ(k);
    const groundY = ground.yAt(px, pz);
    const top = (v: number) => lerp(f.start.y, f.end.y, clamp01(v));
    let y: number;
    let pose: TrickFrame["pose"] = "slide";
    if (t < 0) {
      const u = (t + SLIDE_IN) / SLIDE_IN;
      y = lerp(groundY, top(0), smooth(0.3, 1, u)) + Math.sin(Math.PI * smooth(0.3, 1, u)) * 2.5;
      pose = u > 0.3 ? "air" : "ride";
    } else if (t <= 1) y = top(t);
    else {
      const u = (t - 1) / SLIDE_OUT;
      y = lerp(top(1), groundY, u * u) + Math.sin(Math.PI * Math.min(1, u * 1.4)) * 2;
      pose = u < 0.7 ? "air" : "ride";
    }
    const side = r < 0.5 ? 1 : -1;
    const across = smooth(-SLIDE_IN * 0.6, -0.02, t) * (1 - smooth(1.02, 1 + SLIDE_OUT * 0.7, t));
    return { trick, feature: f.kind,
        park: f.park, position: { x: px, y: Math.max(y, groundY), z: pz }, heading: g.yaw, bodyYaw: side * (Math.PI / 2) * across, roll: 0, pose, grab: 0, spread: 0 };
  }

  function pipeFrame(g: PipeGeom, index: number, x: number, z: number, heading: number, seed: number): TrickFrame | null {
    const pr = projectPipe(g, x, z);
    const { f } = g;
    const outer = f.halfFlat + f.radius;
    // inside the walls only: parks often run right beside the pipe (Park City's Pick'n Shovel)
    if (pr.s <= 0 || pr.s >= g.total || Math.abs(pr.lat) > f.halfFlat + f.radius * 0.8 || !aligned(Math.atan2(pr.ux, pr.uz), heading)) return null;
    const theta = (Math.PI * pr.s) / PIPE_HIT_M;
    const sin = Math.sin(theta);
    const w = outer * sin; // lateral position: wall to wall
    const off = Math.abs(w);
    const wallH = off <= f.halfFlat ? 0 : f.radius - Math.sqrt(Math.max(0, f.radius ** 2 - (off - f.halfFlat) ** 2));
    const air = smooth(PIPE_AIR_FROM, 1, Math.abs(sin));
    const hit = Math.floor(theta / Math.PI + 0.5); // which wall hit we're on / heading to
    const pick = PIPE_TRICKS[Math.floor(hash(index * 131 + hit, seed) * PIPE_TRICKS.length)];
    const psi = theta / Math.PI - Math.floor(theta / Math.PI); // 0..1 through this crossing, apex at 0.5
    const inAir = Math.abs(sin) > PIPE_AIR_FROM;
    const airProgress = smooth(0.34, 0.66, psi);
    // lateral unit vector (left of travel) and the travel direction across the pipe
    const nx = -pr.uz;
    const nz = pr.ux;
    const dLat = (outer * Math.cos(theta) * Math.PI) / PIPE_HIT_M;
    const vx = pr.ux + nx * dLat;
    const vz = pr.uz + nz * dLat;
    const cx = x - nx * pr.lat; // centre-line point
    const cz = z - nz * pr.lat;
    const trick: Trick = inAir ? { label: `Halfpipe · ${pick.label}`, spinDeg: pick.spinDeg, source: "simulated" } : { label: "Halfpipe", spinDeg: 0, source: "simulated" };
    return {
      trick,
      feature: "pipe",
      park: f.park,
      position: { x: cx + nx * w, y: f.floor0 + f.floorSlope * pr.s + wallH + air * PIPE_AIR_M * Math.sin((Math.PI / 2) * air), z: cz + nz * w },
      heading: Math.atan2(vx, vz),
      bodyYaw: inAir ? ((pick.spinDeg * Math.PI) / 180) * airProgress * (hit % 2 ? 1 : -1) : 0,
      // lean into the transition as the wall steepens
      roll: off > f.halfFlat && !inAir ? -Math.sign(w) * Math.min(0.9, Math.asin(Math.min(1, (off - f.halfFlat) / f.radius))) : 0,
      pose: inAir ? "air" : "ride",
      grab: inAir && pick.grab ? Math.sin(Math.PI * airProgress) : 0,
      spread: 0,
    };
  }

  return {
    /** Trick in progress at skier position (x, z) moving along `heading`, or null. `seed` varies tricks per run. */
    at(x: number, z: number, heading: number, seed: number): TrickFrame | null {
      for (let i = 0; i < pipes.length; i++) {
        const fr = pipeFrame(pipes[i], i, x, z, heading, seed);
        if (fr) return fr;
      }
      for (let i = 0; i < lines.length; i++) {
        const g = lines[i];
        if (!aligned(g.yaw, heading)) continue;
        const { t, lat } = project(g, x, z);
        if (Math.abs(lat) > CAPTURE_M) continue;
        const fr = lineFrame(g, i, x, z, t, lat, seed);
        if (fr) return fr;
      }
      return null;
    },
    /** Whether a feature is coming up within LOOKAHEAD_M (or under way): the replay slows down here. */
    near(x: number, z: number, heading: number): boolean {
      for (const g of pipes) {
        const pr = projectPipe(g, x, z);
        // s is clamped at the top of the pipe, so before it d2 is the distance to the drop-in
        const ahead = pr.s > 0 ? pr.s < g.total : Math.sqrt(pr.d2) < LOOKAHEAD_M;
        if (ahead && Math.abs(pr.lat) < g.f.halfFlat + g.f.radius * 0.8 && aligned(Math.atan2(pr.ux, pr.uz), heading)) return true;
      }
      for (const g of lines) {
        if (!aligned(g.yaw, heading)) continue;
        const { t, lat } = project(g, x, z);
        const flight = g.f.kind === "kicker" ? FLIGHT_M / g.len : SLIDE_OUT;
        if (Math.abs(lat) < CAPTURE_M && t * g.len > -LOOKAHEAD_M && t < 1 + flight + 0.2) return true;
      }
      return false;
    },
    count: lines.length + pipes.length,
  };
}
