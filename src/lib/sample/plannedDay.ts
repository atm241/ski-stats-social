import { haversine } from "../analysis/geo";
import type { TrackPoint } from "../analysis/types";
import { createTerrain } from "../mountain/terrain";
import type { MountainData } from "../mountain/types";
import { rng } from "./generate";
import { type ItineraryStep, trackRecorder } from "./mountainDay";

/*
 * A demo ski day that follows a written plan on a real resort: "ride Outback Express, hike the Wapiti
 * Peak boot pack to Puma Bowl, ski it, lap A51 …". Between the steps a route finder works out how to
 * get there over the real lift and run network, so the plan only names the parts that matter.
 */

type LonLat = [number, number];

export type PlanStep =
  /** ride this lift (getting to its bottom first) */
  | { lift: string }
  /** ski this run top to bottom */
  | { run: string }
  /** ski this terrain park / halfpipe line */
  | { park: string }
  /** boot-pack this marked hike; with `to`, leave it where it passes closest to that run's top */
  | { hike: string; to?: string }
  /** stand around for this many minutes (lunch, regroup) */
  | { rest: number };

export interface PlannedDayOptions {
  start: Date;
  seed?: number;
  plan: PlanStep[];
  /** finish the day back at the bottom of this lift (e.g. the base gondola) */
  endAt?: string;
}

const LINK_M = 80; // run/lift points this close are connected by a short skate
const OFFPISTE_M = 300; // ...and downhill points this close by an off-piste traverse (keeps the graph connected)
const SKI_MPS = 10;
const SKATE_MPS = 3;
const HIKE_MPS = 0.75;
const CLIMB_S_PER_M = 10; // side-stepping / skating uphill

const dist = (a: LonLat, b: LonLat) => haversine(a[1], a[0], b[1], b[0]);

interface Node {
  p: LonLat;
  ele: number;
}
type Edge = { to: number; cost: number; kind: "run" | "lift" | "skate"; name: string | null };

export function plannedDay(data: MountainData, o: PlannedDayOptions): { points: TrackPoint[]; itinerary: ItineraryStep[] } {
  const rand = rng(o.seed ?? 1);
  const terrain = createTerrain(data);
  const ele = (p: LonLat) => terrain.elevationAt(...terrain.toXZ(p[0], p[1]));
  const rec = trackRecorder(o.start, rand, ele);
  const itinerary: ItineraryStep[] = [];
  /** a run continued after a short skate (or reached on the way to its own top) is still one run */
  const pushRun = (name: string) => {
    const last = itinerary[itinerary.length - 1];
    if (!(last?.kind === "run" && last.name === name)) itinerary.push({ kind: "run", name });
  };

  const downhill = (c: LonLat[]) => (ele(c[0]) >= ele(c[c.length - 1]) ? c : [...c].reverse());
  const uphill = (c: LonLat[]) => [...downhill(c)].reverse();
  const byName = <T extends { name: string | null; coords: LonLat[] }>(xs: T[], name: string, what: string) => {
    const hit = xs.filter((x) => x.name === name).sort((a, b) => b.coords.length - a.coords.length)[0];
    if (!hit) throw new Error(`plan: ${what} not found: ${name}`);
    return hit;
  };

  // --- routing graph: run vertices (downhill), lift ends (bottom → top), skates and off-piste links
  const nodes: Node[] = [];
  const edges: Edge[][] = [];
  const add = (p: LonLat) => {
    nodes.push({ p, ele: ele(p) });
    edges.push([]);
    return nodes.length - 1;
  };
  for (const r of data.runs) {
    const c = downhill(r.coords);
    let prev = -1;
    for (const p of c) {
      const i = add(p);
      if (prev >= 0) edges[prev].push({ to: i, cost: dist(nodes[prev].p, p) / SKI_MPS, kind: "run", name: r.name });
      prev = i;
    }
  }
  for (const l of data.lifts) {
    if (l.type === "magic_carpet" || l.type === "platter") continue;
    const c = uphill(l.coords);
    const b = add(c[0]);
    const t = add(c[c.length - 1]);
    edges[b].push({ to: t, cost: 180 + dist(c[0], c[c.length - 1]) / 4.5, kind: "lift", name: l.name });
  }
  // spatial buckets for linking
  const CELL = 0.004; // ~350–450 m
  const bucket = new Map<string, number[]>();
  const key = (p: LonLat) => `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
  nodes.forEach((n, i) => bucket.set(key(n.p), [...(bucket.get(key(n.p)) ?? []), i]));
  const nearby = (p: LonLat) => {
    const [cx, cy] = [Math.floor(p[0] / CELL), Math.floor(p[1] / CELL)];
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...(bucket.get(`${cx + dx},${cy + dy}`) ?? []));
    return out;
  };
  const linkFrom = (i: number, targets: number[]) => {
    for (const j of targets) {
      if (j === i) continue;
      const d = dist(nodes[i].p, nodes[j].p);
      const drop = nodes[i].ele - nodes[j].ele;
      // a small rise is fine to skate, but price it like walking up so chains of them don't turn into a climb
      if (d < LINK_M && drop > -8) edges[i].push({ to: j, cost: 4 + d / SKATE_MPS + Math.max(0, -drop) * CLIMB_S_PER_M, kind: "skate", name: null });
      else if (d < OFFPISTE_M && drop > d * 0.15) edges[i].push({ to: j, cost: 30 + d / 5, kind: "skate", name: null });
    }
  };
  const graphSize = nodes.length;
  for (let i = 0; i < graphSize; i++) linkFrom(i, nearby(nodes[i].p));

  /** Cheapest way from `from` to `to` (seconds): the legs to ride, ski or skate. */
  type Leg = Edge & { from: number };
  const route = (from: LonLat, to: LonLat): Leg[] => {
    const s = add(from);
    const t = add(to);
    linkFrom(s, nearby(from));
    for (const j of nearby(to)) {
      const d = dist(nodes[j].p, to);
      if (d < LINK_M * 2 && nodes[j].ele - nodes[t].ele > -15) edges[j].push({ to: t, cost: 4 + d / SKATE_MPS, kind: "skate", name: null });
    }
    const best = new Float64Array(nodes.length).fill(Infinity);
    const via: Leg[] = new Array(nodes.length);
    best[s] = 0;
    // binary heap of [cost, node]
    const heap: [number, number][] = [[0, s]];
    const push = (c: number, n: number) => {
      heap.push([c, n]);
      for (let k = heap.length - 1; k > 0; ) {
        const up = (k - 1) >> 1;
        if (heap[up][0] <= heap[k][0]) break;
        [heap[up], heap[k]] = [heap[k], heap[up]];
        k = up;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let k = 0; ; ) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [c, n] = pop();
      if (c > best[n]) continue;
      if (n === t) break;
      for (const e of edges[n]) {
        const nc = c + e.cost;
        if (nc < best[e.to]) {
          best[e.to] = nc;
          via[e.to] = { ...e, from: n };
          push(nc, e.to);
        }
      }
    }
    // drop the temporary nodes' edges into the graph
    for (const j of nearby(to)) edges[j] = edges[j].filter((e) => e.to !== t);
    if (best[t] === Infinity) throw new Error(`plan: no way from ${from} to ${to}`);
    const legs: Leg[] = [];
    for (let n = t; n !== s; n = via[n].from) legs.unshift(via[n]);
    return legs;
  };

  // --- moving the skier
  const skiSpeed = () => 7 + rand() * 5;
  const rideLift = (name: string, coords: LonLat[]) => {
    const c = uphill(coords);
    rec.wait(60 + rand() * 180, c[0]); // lift line
    itinerary.push({ kind: "lift", name });
    rec.travel(c, () => 4.5, true);
    rec.wait(15 + rand() * 30, c[c.length - 1]);
  };
  /** Gets to `to` along the network, riding lifts if that's the way. */
  const goTo = (to: LonLat) => {
    if (dist(rec.here(), to) < 15) return;
    const legs = route(rec.here(), to);
    let run: { name: string | null; pts: LonLat[] } | null = null;
    const flush = () => {
      if (run && run.pts.length > 1) {
        if (run.name) pushRun(run.name);
        rec.travel(run.pts, skiSpeed);
      }
      run = null;
    };
    for (const leg of legs) {
      const a = nodes[leg.from].p;
      const b = nodes[leg.to].p;
      if (leg.kind === "lift") {
        flush();
        const lift = data.lifts.find((l) => l.name === leg.name)!;
        rideLift(leg.name ?? "Lift", lift.coords);
      } else if (leg.kind === "run") {
        if (!run || run.name !== leg.name) {
          flush();
          run = { name: leg.name, pts: [a] };
        }
        run.pts.push(b);
      } else {
        flush();
        rec.travel([a, b], nodes[leg.to].ele < nodes[leg.from].ele - 10 ? skiSpeed : () => SKATE_MPS);
      }
    }
    flush();
  };

  // start at the bottom of the first lift in the plan
  const firstLift = o.plan.find((s): s is { lift: string } => "lift" in s);
  const startAt = firstLift ? uphill(byName(data.lifts, firstLift.lift, "lift").coords)[0] : downhill(data.runs[0].coords)[0];
  rec.emit(startAt, ele(startAt) + 1.5);
  rec.wait(120, startAt);

  for (const step of o.plan) {
    if ("lift" in step) {
      const lift = byName(data.lifts, step.lift, "lift");
      goTo(uphill(lift.coords)[0]);
      rideLift(step.lift, lift.coords);
    } else if ("run" in step || "park" in step) {
      const line = "run" in step ? byName(data.runs, step.run, "run") : byName(data.parks ?? [], step.park, "park");
      const c = downhill(line.coords);
      goTo(c[0]);
      pushRun(line.name ?? "Run");
      rec.travel(c, "park" in step ? () => 8 + rand() * 2 : skiSpeed);
    } else if ("hike" in step) {
      const hike = byName(data.hikes ?? [], step.hike, "hike");
      let c = uphill(hike.coords);
      if (step.to) {
        const top = downhill(byName(data.runs, step.to, "run").coords)[0];
        const k = c.reduce((bi, p, i) => (dist(p, top) < dist(c[bi], top) ? i : bi), 0);
        c = [...c.slice(0, k + 1), top];
      }
      goTo(c[0]);
      rec.wait(60 + rand() * 60, c[0]); // skis on the pack
      rec.travel(c, () => HIKE_MPS * (0.8 + rand() * 0.4));
      rec.wait(90 + rand() * 120, c[c.length - 1]); // catch breath, click in
    } else {
      rec.wait(step.rest * 60, rec.here());
    }
  }
  if (o.endAt) goTo(uphill(byName(data.lifts, o.endAt, "lift").coords)[0]);
  return { points: rec.points, itinerary };
}
