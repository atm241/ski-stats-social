import { haversine } from "../analysis/geo";
import type { TrackPoint } from "../analysis/types";
import { createTerrain } from "../mountain/terrain";
import type { MountainData } from "../mountain/types";
import { rng } from "./generate";

/*
 * Synthetic ski day on a real resort's lift and trail network: ride a real lift, ski a chain of
 * connected real runs down to another lift bottom, repeat. Elevation comes from the real terrain.
 * Used for demo data and the 3D replay until we have real recordings.
 */

const STEP_S = 2;
const LINK_M = 130; // runs/lifts whose ends are this close are treated as connected
const MAX_RUNS_PER_DESCENT = 7;

type LonLat = [number, number];
interface Lift {
  name: string;
  coords: LonLat[]; // bottom → top
  speed: number;
  rise: number;
}
interface Run {
  name: string;
  coords: LonLat[]; // top → bottom
  drop: number;
}
export interface ItineraryStep {
  kind: "lift" | "run";
  name: string;
}

export interface MountainDayOptions {
  start: Date;
  seed?: number;
  /** lift rides in the day */
  laps?: number;
  /** horizontal skiing speed range, m/s */
  skiSpeed?: [number, number];
}

const dist = (a: LonLat, b: LonLat) => haversine(a[1], a[0], b[1], b[0]);

export function mountainDay(data: MountainData, o: MountainDayOptions): { points: TrackPoint[]; itinerary: ItineraryStep[] } {
  const rand = rng(o.seed ?? 1);
  const terrain = createTerrain(data);
  const ele = (p: LonLat) => terrain.elevationAt(...terrain.toXZ(p[0], p[1]));
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const shuffle = <T>(xs: T[]) => xs.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

  const lifts: Lift[] = data.lifts
    .filter((l) => l.coords.length >= 2 && l.type !== "platter" && l.type !== "magic_carpet")
    .map((l) => {
      const c = ele(l.coords[0]) < ele(l.coords.at(-1)!) ? l.coords : [...l.coords].reverse();
      return { name: l.name ?? "Lift", coords: c, speed: l.type === "gondola" ? 5.5 : 4.5, rise: ele(c.at(-1)!) - ele(c[0]) };
    })
    .filter((l) => l.rise > 60);
  const runs: Run[] = data.runs
    .filter((r) => r.coords.length >= 2)
    .map((r) => {
      const c = ele(r.coords[0]) >= ele(r.coords.at(-1)!) ? r.coords : [...r.coords].reverse();
      return { name: r.name ?? "Unnamed run", coords: c, drop: ele(c[0]) - ele(c.at(-1)!) };
    })
    .filter((r) => r.drop > 15);

  const runsFrom = (p: LonLat) => runs.filter((r) => dist(r.coords[0], p) < LINK_M && ele(r.coords[0]) < ele(p) + 20);
  const liftsAt = (p: LonLat, allowed: Set<Lift>) => lifts.filter((l) => allowed.has(l) && dist(l.coords[0], p) < LINK_M * 1.5);

  /** Random depth-first search for a chain of runs from `p` that ends at an allowed lift bottom. */
  const descend = (p: LonLat, allowed: Set<Lift>, depth = 0, seen = new Set<Run>()): { runs: Run[]; lift: Lift } | null => {
    if (depth >= MAX_RUNS_PER_DESCENT) return null;
    for (const r of shuffle(runsFrom(p)).slice(0, 5)) {
      if (seen.has(r)) continue;
      const end = r.coords.at(-1)!;
      const here = liftsAt(end, allowed);
      // Usually keep skiing a bit before taking the next lift, like a real day.
      if (here.length && (depth >= 1 || rand() < 0.5)) return { runs: [r], lift: pick(here) };
      const rest = descend(end, allowed, depth + 1, new Set([...seen, r]));
      if (rest) return { runs: [r, ...rest.runs], lift: rest.lift };
      if (here.length) return { runs: [r], lift: pick(here) };
    }
    return null;
  };

  // Keep only lifts you can ski down from to another usable lift (iterate until stable).
  // Remember one way down from each lift, as a fallback when a random search misses on a big network.
  let usable = new Set(lifts);
  const known = new Map<Lift, { runs: Run[]; lift: Lift }>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const l of usable) {
      let found: { runs: Run[]; lift: Lift } | null = null;
      for (let k = 0; k < 12 && !found; k++) found = descend(l.coords.at(-1)!, usable);
      if (found) known.set(l, found);
      else {
        usable.delete(l);
        changed = true;
      }
    }
    // a remembered descent may end at a lift that has since been dropped
    for (const [l, d] of known) if (!usable.has(l) || !usable.has(d.lift)) known.delete(l);
    for (const l of usable) if (!known.has(l)) changed = true;
    if (changed) for (const l of usable) if (!known.has(l)) {
      const d = descend(l.coords.at(-1)!, usable);
      if (d) known.set(l, d);
      else usable.delete(l);
    }
  }
  if (usable.size === 0) throw new Error(`no connected lift/run network found for ${data.name}`);
  usable = new Set([...usable]);

  // --- generate GPS points
  const points: TrackPoint[] = [];
  const itinerary: ItineraryStep[] = [];
  let t = o.start.getTime();
  let here: LonLat = [0, 0];
  const noise = () => (rand() + rand() + rand() - 1.5) * 1.2;
  const emit = (p: LonLat, elevation: number) => {
    const mLat = 111_320;
    const mLon = 111_320 * Math.cos((p[1] * Math.PI) / 180);
    points.push({ t, lat: p[1] + noise() / mLat, lon: p[0] + noise() / mLon, ele: elevation + noise() * 1.5 });
    here = p;
  };
  const wait = (seconds: number, p: LonLat) => {
    for (let s = 0; s < seconds; s += STEP_S) {
      t += STEP_S * 1000;
      emit(p, ele(p) + 1.5);
    }
  };
  /** Moves along a polyline; elevation from terrain, or linearly between its ends for lifts. */
  const travel = (coords: LonLat[], speed: () => number, onCable = false) => {
    const total = coords.reduce((s, c, i) => (i ? s + dist(coords[i - 1], c) : 0), 0);
    const e0 = ele(coords[0]) + 8;
    const e1 = ele(coords.at(-1)!) + 8;
    let along = 0;
    for (let i = 1; i < coords.length; i++) {
      const [a, b] = [coords[i - 1], coords[i]];
      const len = dist(a, b);
      let s = 0;
      while (s < len) {
        s = Math.min(len, s + speed() * STEP_S);
        const f = s / len;
        const p: LonLat = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        t += STEP_S * 1000;
        emit(p, onCable ? e0 + ((e1 - e0) * (along + s)) / total : ele(p) + 1.5);
      }
      along += len;
    }
  };
  const [vMin, vMax] = o.skiSpeed ?? [7, 12];
  const skiSpeed = () => vMin + rand() * (vMax - vMin);

  const laps = o.laps ?? 10;
  let lift = pick([...usable]);
  here = lift.coords[0];
  emit(here, ele(here) + 1.5);
  for (let lap = 0; lap < laps; lap++) {
    wait(60 + rand() * 240, lift.coords[0]); // lift line
    itinerary.push({ kind: "lift", name: lift.name });
    travel(lift.coords, () => lift.speed, true);
    wait(20 + rand() * 60, lift.coords.at(-1)!); // strap in, look around

    let descent: { runs: Run[]; lift: Lift } | null = null;
    for (let k = 0; k < 20 && !descent; k++) descent = descend(lift.coords.at(-1)!, usable);
    descent ??= known.get(lift)!;
    for (const r of descent.runs) {
      if (dist(here, r.coords[0]) > 5) travel([here, r.coords[0]], () => 3); // skate over to the run
      itinerary.push({ kind: "run", name: r.name });
      travel(r.coords, skiSpeed);
      if (rand() < 0.3) wait(20 + rand() * 60, r.coords.at(-1)!); // regroup
    }
    lift = descent.lift;
    if (dist(here, lift.coords[0]) > 5) travel([here, lift.coords[0]], () => 3);
    if (lap === Math.floor(laps / 2)) wait(45 * 60, lift.coords[0]); // lunch
  }
  return { points, itinerary };
}
