/**
 * Adds exposed-rock cliffs to an already-built mountain (public/mountains/<slug>.json), found in
 * high-resolution lidar so bands like Deer Valley's Daly Chutes or Snowbird's Cirque land where they really are.
 *
 *   npx tsx scripts/build-cliffs.ts deer-valley [--debug <dir>]
 *
 * Elevation: USGS 3D Elevation Program (3DEP) bare-earth DEM, ~1 m lidar resampled to 2 m (US only;
 * public domain). Bare-earth means trees are stripped out, so rock in the forest still shows up.
 *
 * A 2 m pixel is rock when the ground is steep both locally (±2 m) and over a 12 m baseline. The
 * second test drops ski-run berms and other short steps that a single 2 m pixel can't tell apart from a cliff.
 * Pixels near OSM roads and buildings are ignored (road cuts, foundations). Rock pixels are then
 * grouped into 8 m cells, each with its elevation, downhill direction, steepness and face height.
 *
 * Output: data.cliffs = { cellM, cols, rows, items } where items is a flat list of 5 integers per rock cell:
 * [cell index (row-major from the NW corner), elevation in dm, downhill aspect in 10° steps (0 = north,
 * clockwise), steepness in degrees, face height in m].
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fromArrayBuffer } from "geotiff";
import { PNG } from "pngjs";
import { overpass } from "./lib/overpass";
import type { MountainData } from "../src/lib/mountain/types";

const DEP = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage";
const PX_M = 2;
const CELL_M = 8;
const TILE_PX = 2000;
const MARGIN = 4; // px of overlap so slopes at tile edges see their neighbours
const FINE_DEG = 42;
const COARSE_DEG = 37;
const COARSE_PX = 3; // ±6 m → 12 m baseline
const CELL_MIN_FRAC = 0.25;
const ROAD_BUFFER_M = 10;

async function fetchDem(w: number, s: number, e: number, n: number, cols: number, rows: number) {
  // Ask in Web Mercator, where square pixels match the box's shape. In 4326 the server silently widens
  // the box to keep degree-square pixels. Over a few km, Mercator is linear in latitude to well under a pixel.
  const R = 6378137;
  const mx = (lon: number) => (R * lon * Math.PI) / 180;
  const my = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const url = `${DEP}?bbox=${mx(w)},${my(s)},${mx(e)},${my(n)}&bboxSR=3857&imageSR=3857&size=${cols},${rows}&format=tiff&pixelType=F32&interpolation=RSP_BilinearInterpolation&f=image`;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    let buf: ArrayBuffer;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      buf = await res.arrayBuffer();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
      continue;
    }
    if (res.ok && res.headers.get("content-type")?.includes("tif")) {
      const img = await (await fromArrayBuffer(buf)).getImage();
      if (img.getWidth() !== cols || img.getHeight() !== rows) throw new Error(`3DEP returned ${img.getWidth()}×${img.getHeight()}, wanted ${cols}×${rows}`);
      const [band] = (await img.readRasters({ samples: [0] })) as unknown as Float32Array[];
      return band;
    }
    if (attempt >= 4) throw new Error(`3DEP export failed: ${res.status} ${Buffer.from(buf).toString("utf8", 0, 200)}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const slug = args[0];
  if (!slug) throw new Error("usage: build-cliffs.ts <slug> [--debug <dir>]");
  const debugDir = args.includes("--debug") ? args[args.indexOf("--debug") + 1] : null;
  const file = join("public", "mountains", `${slug}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as MountainData;
  const [west, south, east, north] = data.bbox;
  const { widthM, depthM } = data.grid;
  const lonPerPx = ((east - west) * PX_M) / widthM;
  const latPerPx = ((north - south) * PX_M) / depthM;
  const GC = Math.floor(widthM / PX_M);
  const GR = Math.floor(depthM / PX_M);
  const k = CELL_M / PX_M;
  const cols = Math.floor(GC / k);
  const rows = Math.floor(GR / k);

  // --- roads and buildings → no-rock mask (road cuts and foundations are steep but not cliffs)
  const q = `[out:json][timeout:120];(way["highway"]["highway"!~"path|footway|steps|bridleway|cycleway"](${south},${west},${north},${east});way["building"](${south},${west},${north},${east}););out geom;`;
  const ways = (await overpass<{ elements: { geometry?: { lat: number; lon: number }[] }[] }>(q)).elements.filter((e) => e.geometry);
  const MASK_PX = 2; // mask resolution: 4 m
  const mCols = Math.ceil(GC / MASK_PX);
  const mRows = Math.ceil(GR / MASK_PX);
  const blocked = new Uint8Array(mCols * mRows);
  const r = Math.ceil(ROAD_BUFFER_M / (PX_M * MASK_PX));
  for (const wy of ways) {
    const g = wy.geometry!;
    for (let i = 0; i < g.length; i++) {
      const a = g[i];
      const b = g[Math.min(i + 1, g.length - 1)];
      const steps = Math.max(1, Math.ceil(Math.hypot((b.lon - a.lon) / lonPerPx, (b.lat - a.lat) / latPerPx) / MASK_PX));
      for (let s = 0; s <= steps; s++) {
        const mc = Math.floor((a.lon + ((b.lon - a.lon) * s) / steps - west) / lonPerPx / MASK_PX);
        const mr = Math.floor((north - (a.lat + ((b.lat - a.lat) * s) / steps)) / latPerPx / MASK_PX);
        for (let dr = -r; dr <= r; dr++)
          for (let dc = -r; dc <= r; dc++) {
            const C = mc + dc;
            const R = mr + dr;
            if (C >= 0 && R >= 0 && C < mCols && R < mRows) blocked[R * mCols + C] = 1;
          }
      }
    }
  }
  console.log(`${ways.length} roads/buildings masked; DEM ${GC}×${GR} px at ${PX_M} m → ${cols}×${rows} cells`);

  // --- lidar tiles → rock pixels → 8 m cells
  const rockPx = new Uint8Array(GC * GR); // debug + cell aggregation
  const elev = new Float32Array(GC * GR);
  const gx = new Float32Array(GC * GR); // coarse downhill gradient, for aspect
  const gz = new Float32Array(GC * GR);
  const deg = (t: number) => (Math.atan(t) * 180) / Math.PI;
  const tanFine = Math.tan((FINE_DEG * Math.PI) / 180);
  const tanCoarse = Math.tan((COARSE_DEG * Math.PI) / 180);
  let tiles = 0;
  const nTiles = Math.ceil(GC / TILE_PX) * Math.ceil(GR / TILE_PX);
  for (let r0 = 0; r0 < GR; r0 += TILE_PX)
    for (let c0 = 0; c0 < GC; c0 += TILE_PX) {
      const tc0 = Math.max(0, c0 - MARGIN);
      const tr0 = Math.max(0, r0 - MARGIN);
      const tc1 = Math.min(GC, c0 + TILE_PX + MARGIN);
      const tr1 = Math.min(GR, r0 + TILE_PX + MARGIN);
      const tw = tc1 - tc0;
      const th = tr1 - tr0;
      const z = await fetchDem(west + tc0 * lonPerPx, north - tr1 * latPerPx, west + tc1 * lonPerPx, north - tr0 * latPerPx, tw, th);
      const at = (c: number, rr: number) => z[Math.min(th - 1, Math.max(0, rr)) * tw + Math.min(tw - 1, Math.max(0, c))];
      for (let rr = r0 - tr0; rr < Math.min(th, r0 - tr0 + TILE_PX); rr++)
        for (let c = c0 - tc0; c < Math.min(tw, c0 - tc0 + TILE_PX); c++) {
          const G = (rr + tr0) * GC + (c + tc0);
          const h = at(c, rr);
          if (!(h > -500)) continue; // nodata
          elev[G] = h;
          const fx = (at(c + 1, rr) - at(c - 1, rr)) / (2 * PX_M);
          const fz = (at(c, rr + 1) - at(c, rr - 1)) / (2 * PX_M);
          const cx = (at(c + COARSE_PX, rr) - at(c - COARSE_PX, rr)) / (2 * COARSE_PX * PX_M);
          const cz = (at(c, rr + COARSE_PX) - at(c, rr - COARSE_PX)) / (2 * COARSE_PX * PX_M);
          gx[G] = cx;
          gz[G] = cz;
          if (Math.hypot(fx, fz) < tanFine || Math.hypot(cx, cz) < tanCoarse) continue;
          if (blocked[Math.floor((rr + tr0) / MASK_PX) * mCols + Math.floor((c + tc0) / MASK_PX)]) continue;
          rockPx[G] = 1;
        }
      process.stdout.write(`\rlidar tiles ${++tiles}/${nTiles}`);
    }
  process.stdout.write("\n");

  const items: number[] = [];
  for (let cr = 0; cr < rows; cr++)
    for (let cc = 0; cc < cols; cc++) {
      let n = 0;
      let sum = 0;
      let sx = 0;
      let sz = 0;
      let lo = Infinity;
      let hi = -Infinity;
      for (let dr = 0; dr < k; dr++)
        for (let dc = 0; dc < k; dc++) {
          const G = (cr * k + dr) * GC + cc * k + dc;
          const h = elev[G];
          if (h < lo) lo = h;
          if (h > hi) hi = h;
          if (!rockPx[G]) continue;
          n++;
          sum += h;
          sx += gx[G];
          sz += gz[G];
        }
      if (n < CELL_MIN_FRAC * k * k) continue;
      // (gx, gz) is the uphill gradient in east / south; downhill = −gradient, whose north component is +gz.
      const downE = -sx / n;
      const downN = sz / n;
      const bearing = ((Math.atan2(downE, downN) * 180) / Math.PI + 360) % 360;
      items.push(cr * cols + cc, Math.round((sum / n) * 10), Math.round(bearing / 10) % 36, Math.round(deg(Math.hypot(sx, sz) / n)), Math.max(1, Math.round(hi - lo)));
    }
  const nCells = items.length / 5;
  const steep = [];
  for (let i = 3; i < items.length; i += 5) steep.push(items[i]);
  steep.sort((a, b) => a - b);
  console.log(`${nCells} rock cells (${((nCells * CELL_M * CELL_M) / 1e6).toFixed(2)} km² of exposed rock), steepness p50 ${steep[steep.length >> 1] ?? "-"}°`);

  data.cliffs = { cellM: CELL_M, cols, rows, items };
  data.attribution = data.attribution.replace(/ Cliffs:.*$/, "") + " Cliffs: USGS 3DEP lidar.";
  writeFileSync(file, JSON.stringify(data));
  console.log(`→ ${file}`);

  if (debugDir) {
    mkdirSync(debugDir, { recursive: true });
    // Hillshade (NW light) with rock pixels in red and road mask in blue, at 4 m to keep it viewable.
    const S = 2;
    const W = Math.floor(GC / S);
    const H = Math.floor(GR / S);
    const png = new PNG({ width: W, height: H });
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const G = y * S * GC + x * S;
        const shade = Math.max(0, Math.min(255, 150 + (-gx[G] + gz[G] * -1) * -90 + 60));
        let rgb = [shade, shade, shade];
        if (blocked[Math.floor((y * S) / MASK_PX) * mCols + Math.floor((x * S) / MASK_PX)]) rgb = [shade * 0.7, shade * 0.8, 255];
        let rock = 0;
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) rock += rockPx[G + dy * GC + dx];
        if (rock) rgb = [230, 40, 30];
        png.data.set([...rgb, 255], (y * W + x) * 4);
      }
    writeFileSync(join(debugDir, `${slug}-cliffs.png`), PNG.sync.write(png));
    console.log(`debug image → ${join(debugDir, `${slug}-cliffs.png`)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
