/**
 * Builds data/resorts.json from OpenSkiMap's ski area export.
 *
 *   curl -L https://tiles.openskimap.org/geojson/ski_areas.geojson -o /tmp/ski_areas.geojson
 *   npx tsx scripts/build-resorts.ts /tmp/ski_areas.geojson
 *
 * Data © OpenStreetMap contributors / OpenSkiMap, licensed under ODbL.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Resort } from "../src/lib/resorts/types";

/* eslint-disable @typescript-eslint/no-explicit-any -- one-off script over a third-party GeoJSON dump */

type Ring = [number, number][];

const MAX_RING_VERTICES = 48;
const round = (n: number) => Math.round(n * 1e4) / 1e4;

function simplifyRing(ring: Ring): Ring {
  const step = Math.max(1, Math.ceil(ring.length / MAX_RING_VERTICES));
  const out: Ring = [];
  for (let i = 0; i < ring.length; i += step) out.push([round(ring[i][0]), round(ring[i][1])]);
  return out;
}

function main() {
  const src = process.argv[2];
  if (!src) throw new Error("usage: tsx scripts/build-resorts.ts <ski_areas.geojson>");
  const features = JSON.parse(readFileSync(src, "utf8")).features as any[];

  const resorts: Resort[] = [];
  for (const f of features) {
    const p = f.properties;
    if (!p.name || !(p.activities ?? []).includes("downhill")) continue;
    if (p.status && p.status !== "operating") continue;

    const g = f.geometry;
    const outerRings: Ring[] =
      g.type === "Polygon" ? [g.coordinates[0]] : g.type === "MultiPolygon" ? g.coordinates.map((poly: Ring[]) => poly[0]) : [];
    const rings = outerRings.map(simplifyRing).filter((r) => r.length >= 3);

    const allPts: [number, number][] = rings.length ? rings.flat() : [g.coordinates];
    const lons = allPts.map((c) => c[0]);
    const lats = allPts.map((c) => c[1]);
    const center = p.viewportHint?.center ?? [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
    const place = p.places?.[0];

    // Names are often "local, English, alternate" — prefer the first Latin-script variant.
    const variants = String(p.name).split(", ");
    const name = variants.find((v) => /[A-Za-z]/.test(v)) ?? variants[0];

    resorts.push({
      id: p.id,
      name,
      country: place?.localized?.en?.country ?? null,
      region: place?.localized?.en?.region ?? null,
      center: [round(center[0]), round(center[1])],
      bbox: [round(Math.min(...lons)), round(Math.min(...lats)), round(Math.max(...lons)), round(Math.max(...lats))],
      rings,
      minEle: p.statistics?.minElevation ?? null,
      maxEle: p.statistics?.maxElevation ?? null,
    });
  }

  const out = join(import.meta.dirname, "..", "data", "resorts.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(resorts));
  console.log(`wrote ${resorts.length} resorts to ${out}`);
}

main();
