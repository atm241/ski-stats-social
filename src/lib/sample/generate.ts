import type { TrackPoint } from "../analysis/types";

/** Synthetic GPS tracks for tests and demo data. Not used for real uploads. */

const STEP_S = 2;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class TrackBuilder {
  points: TrackPoint[] = [];
  x = 0;
  y = 0;
  constructor(
    private lat0: number,
    private lon0: number,
    public ele: number,
    public t: number,
    private rand: () => number,
    private eleNoise = 3,
  ) {}

  private gauss() {
    return (this.rand() + this.rand() + this.rand() - 1.5) * 1.4;
  }

  private emit() {
    const lat = this.lat0 + (this.y + this.gauss() * 2) / 111320;
    const lon = this.lon0 + (this.x + this.gauss() * 2) / (111320 * Math.cos((this.lat0 * Math.PI) / 180));
    this.points.push({ t: this.t, lat, lon, ele: this.ele + this.gauss() * this.eleNoise });
  }

  wait(seconds: number) {
    for (let s = 0; s < seconds; s += STEP_S) {
      this.t += STEP_S * 1000;
      this.emit();
    }
  }

  /** Straight-line move to (x, y, ele) at a horizontal speed, optionally weaving side to side. */
  moveTo(x: number, y: number, ele: number, speed: number, weave = 0) {
    const sx = this.x;
    const sy = this.y;
    const se = this.ele;
    const len = Math.hypot(x - sx, y - sy);
    const steps = Math.max(1, Math.round(len / speed / STEP_S));
    const px = -(y - sy) / (len || 1);
    const py = (x - sx) / (len || 1);
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      const w = weave * Math.sin(f * Math.PI * 10);
      this.x = sx + (x - sx) * f + px * w;
      this.y = sy + (y - sy) * f + py * w;
      this.ele = se + (ele - se) * f;
      this.t += STEP_S * 1000;
      this.emit();
    }
  }
}

export interface ResortDayOptions {
  lat: number;
  lon: number;
  baseEle: number;
  topEle: number;
  laps: number;
  start: Date;
  seed?: number;
  /** Adds a 25 m uphill bump midway down each run. */
  bumpyRuns?: boolean;
  /** Prepends a drive up and down a mountain road. */
  drive?: boolean;
  /** Horizontal ski speed, m/s. */
  runSpeed?: number;
}

export function resortDay(o: ResortDayOptions): TrackPoint[] {
  const rand = rng(o.seed ?? 1);
  const b = new TrackBuilder(o.lat, o.lon, o.baseEle, o.start.getTime(), rand);
  const vert = o.topEle - o.baseEle;

  if (o.drive) {
    b.moveTo(-12000, 0, o.baseEle - 450, 15);
    b.moveTo(0, 0, o.baseEle, 15);
  }

  for (let lap = 0; lap < o.laps; lap++) {
    const bearing = (lap % 4) * (Math.PI / 2) + rand() * 0.6;
    const liftLen = vert * 1.8;
    const tx = Math.cos(bearing) * liftLen;
    const ty = Math.sin(bearing) * liftLen;

    b.wait(120 + rand() * 300); // lift line
    b.moveTo(tx, ty, o.topEle, 4 + rand()); // chair: ~2.2 m/s vertical
    b.wait(30 + rand() * 90);

    const speed = (o.runSpeed ?? 8) + rand() * 3;
    if (o.bumpyRuns) {
      const mx = tx / 2;
      const my = ty / 2;
      const midEle = o.baseEle + vert / 2;
      b.moveTo(mx, my, midEle, speed, 40);
      b.moveTo(mx * 0.9, my * 0.9, midEle + 25, 2);
      b.wait(60);
      b.moveTo(0, 0, o.baseEle, speed, 40);
    } else {
      b.moveTo(tx * 0.5, ty * 0.5, o.baseEle + vert * 0.45, speed, 40);
      b.wait(30 + rand() * 60);
      b.moveTo(0, 0, o.baseEle, speed, 40);
    }

    if (lap === Math.floor(o.laps / 2)) b.wait(45 * 60); // lunch
  }
  return b.points;
}

export interface BackcountryDayOptions {
  lat: number;
  lon: number;
  baseEle: number;
  /** bootpack: hike straight up on foot instead of a switchbacking skin track */
  laps: { gain: number; bootpack?: boolean }[];
  start: Date;
  seed?: number;
}

export function backcountryDay(o: BackcountryDayOptions): TrackPoint[] {
  const rand = rng(o.seed ?? 2);
  const b = new TrackBuilder(o.lat, o.lon, o.baseEle, o.start.getTime(), rand);
  let x = 0;
  for (const lap of o.laps) {
    const len = lap.bootpack ? lap.gain * 1.3 : lap.gain * 4;
    if (lap.bootpack) b.moveTo(x + len * 0.1, len, b.ele + lap.gain, 0.13 + rand() * 0.04, 3); // steep bootpack, ~1,100–1,500 ft/hr
    else b.moveTo(x + len * 0.3, len, b.ele + lap.gain, 0.45 + rand() * 0.15, 25); // skin track, ~1,200–1,600 ft/hr
    b.wait(600 + rand() * 300); // transition
    x += len * 0.3;
    b.moveTo(x, 0, b.ele - lap.gain, 6 + rand() * 3, 30);
    b.wait(120);
  }
  return b.points;
}

export interface PassLapsOptions {
  lat: number;
  lon: number;
  /** elevation of the pass / trailhead at the top of the road */
  topEle: number;
  laps: number;
  drop: number;
  start: Date;
  /** car speed for the hitchhike back up, m/s */
  carSpeed: number;
  /** drive down the far side of the pass at the end of the day */
  driveOut?: boolean;
  seed?: number;
}

/** Ski down from a road pass, hitch a ride back up the switchbacking road, repeat. */
export function passLapsDay(o: PassLapsOptions): TrackPoint[] {
  const rand = rng(o.seed ?? 4);
  const b = new TrackBuilder(o.lat, o.lon, o.topEle, o.start.getTime(), rand);
  const ROAD_GRADE = 0.09;
  for (let lap = 0; lap < o.laps; lap++) {
    const runLen = o.drop / 0.35;
    b.wait(120);
    b.moveTo(0, -runLen, o.topEle - o.drop, 8 + rand() * 3, 30); // ski to the road
    b.wait(300 + rand() * 600); // thumb out
    // road climbs back via a switchback out to the side, ~9% grade
    const half = o.drop / ROAD_GRADE / 2;
    const wx = Math.sqrt(Math.max(half ** 2 - (runLen / 2) ** 2, 0));
    b.moveTo(wx, -runLen / 2, o.topEle - o.drop / 2, o.carSpeed);
    b.moveTo(0, 0, o.topEle, o.carSpeed);
  }
  if (o.driveOut) b.moveTo(-600 / ROAD_GRADE, 0, o.topEle - 600, 15);
  return b.points;
}

export function toGpx(points: TrackPoint[], name = "Ski day"): string {
  const pts = points
    .map((p) => `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}"><ele>${p.ele.toFixed(1)}</ele><time>${new Date(p.t).toISOString()}</time></trkpt>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="sample-generator" xmlns="http://www.topografix.com/GPX/1/1">
<trk><name>${name}</name><trkseg>
${pts}
</trkseg></trk>
</gpx>
`;
}
