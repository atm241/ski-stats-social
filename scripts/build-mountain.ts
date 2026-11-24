/**
 * Builds a low-poly 3D mountain dataset for one resort: a terrain height grid plus its runs,
 * lifts and named peaks, written to public/mountains/<slug>.json for the three.js viewer.
 *
 *   npx tsx scripts/build-mountain.ts deer-valley "Deer Valley Resort"
 *
 * Elevation: AWS Open Data "Terrain Tiles" (Terrarium PNG encoding, Mapzen / Tilezen sources).
 * Runs, lifts and peaks: © OpenStreetMap contributors (ODbL), via the Overpass API.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pointInRing } from "../src/lib/analysis/geo";
import { PNG } from "pngjs";
import type { MountainData } from "../src/lib/mountain/types";
import type { Resort } from "../src/lib/resorts/types";

const ZOOM = 13; // ~15 m/px at Utah latitudes, resampled down to GRID_CELL_M
const GRID_CELL_M = 40;
const PAD = 0.1; // extra terrain margin around the runs and lifts
/** OSM resort outlines lag expansions (Deer Valley's East Village), so search wider than the outline. */
const SEARCH_GROW = 0.4;
const OVERPASS = "https://overpass-api.de/api/interpreter";

const tileX = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const tileY = (lat: number, z: number) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;

async function fetchTile(z: number, x: number, y: number): Promise<PNG> {
  const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
  if (!res.ok) throw new Error(`terrain tile ${z}/${x}/${y}: ${res.status}`);
  return PNG.sync.read(Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const [slug, resortName] = process.argv.slice(2);
  if (!slug || !resortName) throw new Error('usage: build-mountain.ts <slug> "<Resort name>"');
  const resorts = JSON.parse(readFileSync("data/resorts.json", "utf8")) as Resort[];
  const resort = resorts.find((r) => r.name === resortName);
  if (!resort) throw new Error(`resort not found: ${resortName}`);

  // --- runs, lifts, peaks from OpenStreetMap, searched a bit wider than the resort outline
  const [w0, s0, e0, n0] = resort.bbox;
  const gLon = (e0 - w0) * SEARCH_GROW;
  const gLat = (n0 - s0) * SEARCH_GROW;
  const sb = `${s0 - gLat},${w0 - gLon},${n0 + gLat},${e0 + gLon}`;
  const q = `[out:json][timeout:90];(
    way["piste:type"="downhill"](${sb});
    way["aerialway"](${sb});
    node["natural"="peak"]["name"](${sb});
    way["landuse"="winter_sports"]["name"](${sb});
  );out geom;`;
  const osmRes = await fetch(OVERPASS, {
    method: "POST",
    body: new URLSearchParams({ data: q }),
    headers: { "User-Agent": "pow-pals-mountain-builder/0.1 (personal project)" },
  });
  if (!osmRes.ok) throw new Error(`overpass: ${osmRes.status} ${await osmRes.text()}`);
  type El = { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] };
  const elements = ((await osmRes.json()) as { elements: El[] }).elements;

  // Drop anything that mostly sits inside a *different* resort's outline (e.g. Park City next door).
  const neighbours = elements
    .filter((e) => e.tags?.landuse === "winter_sports" && e.tags.name !== resort.name && e.geometry)
    .map((e) => e.geometry!.map((p) => [p.lon, p.lat] as [number, number]));
  const belongsElsewhere = (g: { lat: number; lon: number }[]) =>
    neighbours.some((ring) => g.filter((p) => pointInRing(p.lon, p.lat, ring)).length > g.length / 2);
  const ours = elements.filter((e) => e.type === "way" && e.geometry && e.tags?.landuse !== "winter_sports" && !belongsElsewhere(e.geometry));
  const runWays = ours.filter((e) => e.tags?.["piste:type"] === "downhill" && e.tags?.area !== "yes");
  const liftWays = ours.filter((e) => e.tags?.aerialway && !["station", "pylon", "goods", "zip_line"].includes(e.tags.aerialway));
  console.log(`kept ${runWays.length} runs, ${liftWays.length} lifts (${neighbours.length} neighbouring resort outline(s) excluded)`);

  // Terrain extent = everything we kept, plus margin.
  const pts = [...runWays, ...liftWays].flatMap((e) => e.geometry!);
  const bw = Math.min(...pts.map((p) => p.lon));
  const be = Math.max(...pts.map((p) => p.lon));
  const bs = Math.min(...pts.map((p) => p.lat));
  const bn = Math.max(...pts.map((p) => p.lat));
  const bbox: [number, number, number, number] = [bw - (be - bw) * PAD, bs - (bn - bs) * PAD, be + (be - bw) * PAD, bn + (bn - bs) * PAD];
  const [west, south, east, north] = bbox;

  // --- terrain: stitch Terrarium tiles, then sample a regular metric grid
  const x0 = Math.floor(tileX(west, ZOOM));
  const x1 = Math.floor(tileX(east, ZOOM));
  const y0 = Math.floor(tileY(north, ZOOM));
  const y1 = Math.floor(tileY(south, ZOOM));
  const tiles = new Map<string, PNG>();
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.set(`${x}/${y}`, await fetchTile(ZOOM, x, y));
  console.log(`fetched ${tiles.size} terrain tiles`);

  const elevAt = (lon: number, lat: number) => {
    const fx = tileX(lon, ZOOM);
    const fy = tileY(lat, ZOOM);
    const tile = tiles.get(`${Math.floor(fx)}/${Math.floor(fy)}`)!;
    const px = Math.min(255, Math.floor((fx % 1) * 256));
    const py = Math.min(255, Math.floor((fy % 1) * 256));
    const i = (py * 256 + px) * 4;
    return tile.data[i] * 256 + tile.data[i + 1] + tile.data[i + 2] / 256 - 32768;
  };

  const lat0 = (south + north) / 2;
  const mPerLat = 111_320;
  const mPerLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const widthM = (east - west) * mPerLon;
  const depthM = (north - south) * mPerLat;
  const cols = Math.round(widthM / GRID_CELL_M) + 1;
  const rows = Math.round(depthM / GRID_CELL_M) + 1;
  const heights: number[] = [];
  for (let r = 0; r < rows; r++) {
    const lat = north - (r / (rows - 1)) * (north - south);
    for (let c = 0; c < cols; c++) heights.push(Math.round(elevAt(west + (c / (cols - 1)) * (east - west), lat)));
  }

  const line = (g: { lat: number; lon: number }[]) => g.map((p) => [+p.lon.toFixed(6), +p.lat.toFixed(6)] as [number, number]);
  const data: MountainData = {
    slug,
    name: resort.name,
    bbox,
    grid: { cols, rows, cellM: GRID_CELL_M, widthM, depthM, heights },
    runs: runWays.map((e) => ({ id: e.id, name: e.tags?.["piste:name"] ?? e.tags?.name ?? null, difficulty: e.tags?.["piste:difficulty"] ?? null, coords: line(e.geometry!) })),
    lifts: liftWays.map((e) => ({ id: e.id, name: e.tags?.name ?? null, type: e.tags!.aerialway, coords: line(e.geometry!) })),
    peaks: elements
      .filter((e) => e.type === "node" && e.tags?.natural === "peak" && e.lon! > west && e.lon! < east && e.lat! > south && e.lat! < north)
      .map((e) => ({ name: e.tags!.name, ele: e.tags?.ele ? Number(e.tags.ele) : null, coord: [e.lon!, e.lat!] as [number, number] })),
    attribution: "Terrain: AWS Terrain Tiles (Mapzen/Tilezen). Runs & lifts: © OpenStreetMap contributors.",
  };

  const out = join("public", "mountains", `${slug}.json`);
  mkdirSync(join("public", "mountains"), { recursive: true });
  writeFileSync(out, JSON.stringify(data));
  console.log(`${cols}×${rows} grid (${Math.round(widthM)}×${Math.round(depthM)} m), ${data.runs.length} runs, ${data.lifts.length} lifts, ${data.peaks.length} peaks → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
