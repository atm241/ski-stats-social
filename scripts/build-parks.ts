/**
 * Adds terrain parks, halfpipes and landmarks to a built mountain (public/mountains/<slug>.json).
 * Quick to re-run on its own after editing scripts/mountains.config.ts.
 *
 *   npx tsx scripts/build-parks.ts park-city
 *
 * From OpenStreetMap: piste:type=snow_park / halfpipe features, and downhill runs described or named as
 * terrain parks (Park City tags 3 Kings and Pick'n Shovel with description="Terrain Park").
 * Plus hand-placed features from scripts/mountains.config.ts (`parks`, or `parkRuns` for runs that are parks),
 * for things OSM doesn't have yet. Also the marked hike-to routes (piste:type=hike), e.g. Keystone's Outback.
 * Each becomes a downhill centreline; the viewer lays out jumps, boxes and rails (parks) or a pipe along it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MountainData } from "../src/lib/mountain/types";
import { createTerrain } from "../src/lib/mountain/terrain";
import { overpass } from "./lib/overpass";
import { autoLandmarks } from "./lib/landmarks";
import { MOUNTAINS } from "./mountains.config";


async function main() {
  const slug = process.argv[2];
  if (!slug) throw new Error("usage: build-parks.ts <slug>");
  const file = join("public", "mountains", `${slug}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as MountainData;
  const [west, south, east, north] = data.bbox;
  const terrain = createTerrain(data);
  const ele = ([lon, lat]: [number, number]) => terrain.elevationAt(...terrain.toXZ(lon, lat));

  const q = `[out:json][timeout:90];(
    way["piste:type"~"^(snow_park|halfpipe)$"](${south},${west},${north},${east});
    way["piste:type"="downhill"]["description"~"[Tt]errain [Pp]ark"](${south},${west},${north},${east});
    way["piste:type"="downhill"]["name"~"([Tt]errain [Pp]ark|[Hh]alf ?[Pp]ipe|[Ss]uper ?[Pp]ipe)"](${south},${west},${north},${east});
    way["piste:type"="hike"](${south},${west},${north},${east});
  );out geom;`;
  type El = { id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
  let els: El[];
  try {
    els = (await overpass<{ elements: El[] }>(q)).elements.filter((e) => e.geometry && e.geometry.length >= 2);
  } catch (e) {
    // OSM unreachable: keep whatever OSM parks we had, still apply config parks and landmarks.
    console.warn(`${e instanceof Error ? e.message : e}; keeping previous OSM parks`);
    els = [];
  }

  const configNames0 = (MOUNTAINS[slug]?.parks ?? []).map((p) => p.name);
  const configNames = new Set([...configNames0, ...(MOUNTAINS[slug]?.parkRuns ?? []).map((p) => p.name ?? p.run)]);
  const parks: NonNullable<MountainData["parks"]> = els.length ? [] : (data.parks ?? []).filter((p) => !configNames.has(p.name ?? ""));
  const hikes: NonNullable<MountainData["hikes"]> = els.length ? [] : (data.hikes ?? []);
  // Only parks on this mountain: the map's edges reach into neighbours (Park City's touches Solitude).
  const ourRunPts = data.runs.flatMap((r) => r.coords.map(([lon, lat]) => terrain.toXZ(lon, lat)));
  const nearOurRuns = (g: { lat: number; lon: number }[]) =>
    g.some((p) => {
      const [x, z] = terrain.toXZ(p.lon, p.lat);
      return ourRunPts.some(([rx, rz]) => Math.hypot(rx - x, rz - z) < 300);
    });
  for (const e of els) {
    if (!nearOurRuns(e.geometry!)) {
      console.log(`skipping ${e.tags?.name ?? "unnamed park"}: not near this mountain's runs`);
      continue;
    }
    let line = e.geometry!.map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)] as [number, number]);
    if (e.tags?.["piste:type"] === "hike") {
      if (ele(line[0]) > ele(line[line.length - 1])) line.reverse(); // store uphill
      hikes.push({ name: e.tags?.name ?? null, coords: line });
      continue;
    }
    const closed = line.length > 3 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
    if (closed) {
      // an area: use its fall line, from the highest to the lowest corner
      const byEle = [...line].sort((a, b) => ele(b) - ele(a));
      line = [byEle[0], byEle[byEle.length - 1]];
    } else if (ele(line[0]) < ele(line[line.length - 1])) line.reverse(); // draw downhill
    const name = e.tags?.name ?? e.tags?.["piste:name"] ?? null;
    const kind = e.tags?.["piste:type"] === "halfpipe" || /pipe/i.test(name ?? "") ? "pipe" : "park";
    parks.push({ name, kind, coords: line });
  }
  for (const p of MOUNTAINS[slug]?.parks ?? []) parks.push({ name: p.name, kind: p.kind, coords: p.coords, line: p.line });
  for (const p of MOUNTAINS[slug]?.parkRuns ?? []) {
    const run = data.runs.filter((r) => r.name === p.run).sort((a, b) => b.coords.length - a.coords.length)[0];
    if (!run) throw new Error(`park run not found: ${p.run}`);
    const coords = ele(run.coords[0]) >= ele(run.coords[run.coords.length - 1]) ? run.coords : [...run.coords].reverse();
    parks.push({ name: p.name ?? p.run, kind: "park", coords, line: p.line });
  }

  data.parks = parks;
  data.hikes = hikes;

  // Landmarks: a run's midpoint (longest piece with that name), a named peak, or a fixed point.
  // Mountains without a hand-picked list get automatic ones (see autoLandmarks).
  const specs = MOUNTAINS[slug]?.landmarks?.length ? MOUNTAINS[slug].landmarks : autoLandmarks(data, terrain);
  data.landmarks = specs.map((l) => {
    let coord = l.at;
    if (l.run) {
      const run = data.runs.filter((r) => r.name === l.run).sort((a, b) => b.coords.length - a.coords.length)[0];
      if (!run) throw new Error(`landmark run not found: ${l.run}`);
      coord = run.coords[Math.floor(run.coords.length / 2)];
    }
    if (l.peak) {
      const peak = data.peaks.find((p) => p.name === l.peak);
      if (!peak) throw new Error(`landmark peak not found: ${l.peak}`);
      coord = peak.coord;
    }
    if (l.park) {
      const park = parks.find((p) => p.name === l.park);
      if (!park) throw new Error(`landmark park not found: ${l.park}`);
      const [a, b] = [park.coords[0], park.coords[park.coords.length - 1]];
      coord = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
    if (!coord) throw new Error(`landmark ${l.name} needs run, peak, park or at`);
    return { name: l.name, kind: l.kind, coord };
  });

  writeFileSync(file, JSON.stringify(data));
  console.log(`${parks.length} park feature(s): ${parks.map((p) => `${p.name ?? "unnamed"} (${p.kind})`).join(", ") || "none"}`);
  console.log(`${hikes.length} hike(s): ${hikes.map((h) => h.name ?? "unnamed").join(", ") || "none"}`);
  console.log(`${data.landmarks.length} landmark(s): ${data.landmarks.map((l) => l.name).join(", ") || "none"} → ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
