/**
 * Adds a satellite-derived forest layer to an already-built mountain (public/mountains/<slug>.json):
 * where the trees are, and whether they're evergreen (conifers) or deciduous (aspen).
 *
 *   npx tsx scripts/build-forest.ts deer-valley [--debug <dir>]
 *
 * 1. Tree cover: ESA WorldCover 2021 (10 m land cover from Sentinel-1 + Sentinel-2), class 10 "Tree cover".
 *    © ESA WorldCover project / contains modified Copernicus Sentinel data, CC BY 4.0.
 * 2. Leaf type: Sentinel-2 L2A (Element84 Earth Search on AWS). Evergreens stay green all year; aspens
 *    are bright green in mid-summer and bare by late fall. So per 10 m pixel we take the median summer
 *    NDVI and the median leaf-off NDVI (clouds, shadows and snow masked out) and call a tree pixel
 *    deciduous when its NDVI drops by more than a threshold picked from the data (Otsu's method).
 *
 * 3. Aspen vs scrub oak/maple (both drop their leaves): canopy height from Meta / WRI's global 1 m
 *    canopy height map (Maxar imagery + GEDI lidar, AWS Open Data, CC BY 4.0). Aspen stands are
 *    10-20 m tall; Gambel oak and maple thickets 2-6 m. The same heights size the 3D trees.
 *
 * Output: data.forest = { cellM, cols, rows, cells, heights } where `cells` is one character per cell,
 * row-major from the north-west corner: "0" no trees, "1" evergreen, "2" aspen, "3" scrub oak/maple,
 * and `heights` is the cell's canopy height in 2 m steps as one base-36 digit.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fromUrl, type GeoTIFFImage } from "geotiff";
import { PNG } from "pngjs";
import type { MountainData } from "../src/lib/mountain/types";
import { retry } from "./lib/retry";

const SAMPLE_M = 10; // native WorldCover / Sentinel-2 resolution
const CELL_M = 20; // output cell: 2×2 samples
const STAC = "https://earth-search.aws.element84.com/v1/search";
const CHM = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm";
/** Deciduous canopy shorter than this (m) is scrub oak / maple thicket rather than aspen. */
const SCRUB_MAX_M = 7;
const MAX_SCENES = 4;

// ---------------------------------------------------------------- geometry

/** WGS84 lat/lon → UTM easting/northing for a given zone (standard Transverse Mercator series). */
function toUtm(lat: number, lon: number, zone: number, south: boolean): [number, number] {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const φ = (lat * Math.PI) / 180;
  const λ0 = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(φ) ** 2);
  const T = Math.tan(φ) ** 2;
  const C = ep2 * Math.cos(φ) ** 2;
  const A = Math.cos(φ) * ((lon * Math.PI) / 180 - λ0);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * φ -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * φ) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * φ) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * φ));
  const E = k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5) / 120) + 500000;
  let Nn = k0 * (M + N * Math.tan(φ) * (A ** 2 / 2 + ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 + ((61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6) / 720));
  if (south) Nn += 10_000_000;
  return [E, Nn];
}

/**
 * A remote GeoTIFF whose reads survive network trouble. geotiff.js caches in-flight block requests, so a
 * failed one can poison later reads of the same bytes; on failure the file is reopened before the retry.
 * `blockSize` merges small range requests: strip-per-row files (canopy height) otherwise fire hundreds of
 * tiny requests at once, which is what tripped macOS DNS lookups (ENOTFOUND) on long builds.
 */
async function openRemote(url: string, blockSize?: number) {
  // blockSize is passed through to geotiff's BlockedSource at runtime; its RemoteSourceOptions type omits it.
  const options = (blockSize ? { blockSize } : {}) as Parameters<typeof fromUrl>[1];
  const open = async () => (await fromUrl(url, options)).getImage();
  let img: GeoTIFFImage = await retry(`open ${url.split("/").pop()}`, open);
  return {
    img,
    read: (window: number[], what: string) =>
      retry(what, async () => {
        try {
          return (await img.readRasters({ window, samples: [0] })) as unknown as ArrayLike<number>[];
        } catch (e) {
          img = await open().catch(() => img);
          throw e;
        }
      }),
  };
}

/** Reads the raster window covering a set of sample points and returns a lookup per point (NaN outside). */
async function sampler(url: string, project: (lat: number, lon: number) => [number, number], samples: [number, number][]) {
  const remote = await openRemote(url);
  const img = remote.img;
  const [ox, oy] = img.getOrigin();
  const [rx, ry] = img.getResolution(); // ry is negative (north-up)
  const W = img.getWidth();
  const H = img.getHeight();
  const px = samples.map(([lat, lon]) => {
    const [x, y] = project(lat, lon);
    return [Math.floor((x - ox) / rx), Math.floor((y - oy) / ry)] as [number, number];
  });
  let [cMin, cMax, rMin, rMax] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [c, r] of px) {
    if (c < cMin) cMin = c;
    if (c > cMax) cMax = c;
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
  }
  const c0 = Math.max(0, cMin);
  const c1 = Math.min(W, cMax + 1);
  const r0 = Math.max(0, rMin);
  const r1 = Math.min(H, rMax + 1);
  if (c1 <= c0 || r1 <= r0) return samples.map(() => NaN);
  const [band] = await remote.read([c0, r0, c1, r1], `read ${url}`);
  const w = c1 - c0;
  return px.map(([c, r]) => (c >= c0 && c < c1 && r >= r0 && r < r1 ? band[(r - r0) * w + (c - c0)] : NaN));
}

// ---------------------------------------------------------------- data sources

function worldCoverTile(lat: number, lon: number) {
  const la = Math.floor(lat / 3) * 3;
  const lo = Math.floor(lon / 3) * 3;
  const name = `${la >= 0 ? "N" : "S"}${String(Math.abs(la)).padStart(2, "0")}${lo >= 0 ? "E" : "W"}${String(Math.abs(lo)).padStart(3, "0")}`;
  return `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_${name}_Map.tif`;
}

interface Scene {
  id: string;
  cloud: number;
  epsg: number;
  date: string;
  assets: { red: string; green: string; nir: string; scl: string };
  covers: boolean;
}

async function findScenes(bbox: number[], months: [string, string], years: number[]): Promise<Scene[]> {
  const scenes: Scene[] = [];
  for (const y of years) {
    const res = await retry("STAC search", () => fetch(STAC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        collections: ["sentinel-2-l2a"],
        bbox,
        datetime: `${y}-${months[0]}T00:00:00Z/${y}-${months[1]}T23:59:59Z`,
        query: { "eo:cloud_cover": { lt: 10 } },
        limit: 100,
      }),
    }));
    if (!res.ok) throw new Error(`STAC search: ${res.status}`);
    type F = { id: string; geometry: { coordinates: number[][][] }; properties: Record<string, number>; assets: Record<string, { href: string }> };
    for (const f of ((await res.json()) as { features: F[] }).features) {
      const ring = f.geometry.coordinates[0];
      const inside = (lon: number, lat: number) => {
        let ins = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins;
        }
        return ins;
      };
      const [w, s, e, n] = bbox;
      scenes.push({
        id: f.id,
        cloud: f.properties["eo:cloud_cover"],
        epsg: f.properties["proj:epsg"] ?? f.properties["proj:code"],
        date: String(f.properties.datetime),
        assets: { red: f.assets.red.href, green: f.assets.green.href, nir: f.assets.nir.href, scl: f.assets.scl.href },
        covers: inside(w, s) && inside(w, n) && inside(e, s) && inside(e, n),
      });
    }
  }
  // Whole resort in frame (no edge slivers), nearly cloud-free, most recent first (trees get cut for new runs).
  const recent = (a: Scene, b: Scene) => b.date.localeCompare(a.date);
  const whole = scenes.filter((s) => s.covers && s.cloud < 3).sort(recent);
  if (whole.length) return whole.slice(0, MAX_SCENES);
  // Big resorts can straddle two Sentinel-2 tiles (e.g. Big Sky). Then take the clearest recent scenes of
  // each tile; pixels outside a scene come back NaN, so the per-pixel median stitches the tiles together.
  const byTile = new Map<string, Scene[]>();
  for (const s of scenes.filter((x) => x.cloud < 5).sort(recent)) {
    const tile = s.id.split("_")[1] ?? s.id;
    byTile.set(tile, [...(byTile.get(tile) ?? []), s]);
  }
  return [...byTile.values()].flatMap((list) => list.slice(0, MAX_SCENES));
}

type Band = "red" | "green" | "nir";

/**
 * Per-sample spectral index for one scene, e.g. NDVI from (nir, red). NaN where cloudy, shadowed,
 * snowy or outside the scene. SCL (scene classification, 20 m): keep 4 vegetation, 5 bare, 6 water,
 * 7 unclassified; drop 0-3 (nodata/defect/dark/shadow), 8-10 (cloud/cirrus) and 11 (snow).
 */
async function sceneIndex(scene: Scene, a: Band, b: Band, samples: [number, number][]) {
  const zone = scene.epsg % 100;
  const south = Math.floor(scene.epsg / 100) === 327;
  const proj = (lat: number, lon: number) => toUtm(lat, lon, zone, south);
  const [va, vb, scl] = await Promise.all([sampler(scene.assets[a], proj, samples), sampler(scene.assets[b], proj, samples), sampler(scene.assets.scl, proj, samples)]);
  return samples.map((_, i) => {
    const s = scl[i];
    if (!(s >= 4 && s <= 7) || !(va[i] > 0) || !(vb[i] > 0)) return NaN;
    return (va[i] - vb[i]) / (va[i] + vb[i]);
  });
}

const median = (v: number[]) => {
  const s = v.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Otsu's threshold over values in [lo, hi]: the split that best separates two populations. */
function otsu(values: number[], lo: number, hi: number, bins = 100) {
  const hist = new Array(bins).fill(0);
  for (const v of values) hist[Math.min(bins - 1, Math.max(0, Math.floor(((v - lo) / (hi - lo)) * bins)))]++;
  const total = values.length;
  let sumAll = 0;
  hist.forEach((h, i) => (sumAll += i * h));
  let wB = 0;
  let sumB = 0;
  let best = 0;
  let bestI = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (!wB || wB === total) continue;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      bestI = i;
    }
  }
  return lo + ((bestI + 1) / bins) * (hi - lo);
}

/** Web-Mercator zoom-9 quadkey: the canopy height map is split into one 1 m COG per z9 tile. */
function quadkey(lat: number, lon: number, z = 9) {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z);
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
  let q = "";
  for (let i = z; i > 0; i--) {
    const m = 1 << (i - 1);
    q += ((x & m ? 1 : 0) + (y & m ? 2 : 0)).toString();
  }
  return q;
}

/**
 * Canopy height (m) per sample: the 80th percentile of the ~1 m pixels inside each sample's footprint,
 * so a stand reads at crown height rather than averaging in the gaps between trees.
 */
async function canopyHeights(samples: [number, number][], halfLat: number, halfLon: number) {
  const R = 6378137;
  const mx = (lon: number) => (R * lon * Math.PI) / 180;
  const my = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const out = new Float32Array(samples.length).fill(NaN);
  const keyOf = samples.map(([lat, lon]) => quadkey(lat, lon));
  for (const key of new Set(keyOf)) {
    const idx = keyOf.flatMap((k, i) => (k === key ? [i] : []));
    const remote = await openRemote(`${CHM}/${key}.tif`, 1 << 20);
    const img = remote.img;
    const [ox, oy] = img.getOrigin();
    const [rx, ry] = img.getResolution();
    const W = img.getWidth();
    const H = img.getHeight();
    const box = (lat: number, lon: number) => [
      Math.max(0, Math.floor((mx(lon - halfLon) - ox) / rx)),
      Math.min(W, Math.ceil((mx(lon + halfLon) - ox) / rx)),
      Math.max(0, Math.floor((my(lat + halfLat) - oy) / ry)),
      Math.min(H, Math.ceil((my(lat - halfLat) - oy) / ry)),
    ];
    let [c0, c1, r0, r1] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const i of idx) {
      const [a, b, c, d] = box(...samples[i]);
      c0 = Math.min(c0, a);
      c1 = Math.max(c1, b);
      r0 = Math.min(r0, c);
      r1 = Math.max(r1, d);
    }
    // The tiles are stored one full-width row per strip, so read in row bands to keep memory flat.
    const BAND = 600;
    const byRow = [...idx].sort((a, b) => samples[b][0] - samples[a][0]); // north first
    let next = 0;
    for (let rb = r0; rb < r1 && next < byRow.length; rb += BAND) {
      const rEnd = Math.min(r1, rb + BAND + 20);
      const [band] = await remote.read([c0, rb, c1, rEnd], `read canopy ${key}`);
      const w = c1 - c0;
      while (next < byRow.length) {
        const i = byRow[next];
        const [a, b, c, d] = box(...samples[i]);
        if (d > rEnd) break; // footprint runs past this band; handle in the next one
        const vals: number[] = [];
        for (let r = Math.max(c, rb); r < d; r++) for (let cc = a; cc < b; cc++) vals.push(band[(r - rb) * w + (cc - c0)]);
        vals.sort((x, y) => x - y);
        out[i] = vals.length ? vals[Math.floor(vals.length * 0.8)] : NaN;
        next++;
      }
      process.stdout.write("·");
    }
  }
  process.stdout.write("\n");
  return out;
}

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2);
  const slug = args[0];
  if (!slug) throw new Error("usage: build-forest.ts <slug> [--debug <dir>]");
  const debugDir = args.includes("--debug") ? args[args.indexOf("--debug") + 1] : null;
  const file = join("public", "mountains", `${slug}.json`);
  const data = JSON.parse(readFileSync(file, "utf8")) as MountainData;
  const [west, south, east, north] = data.bbox;
  const { widthM, depthM } = data.grid;

  // Sample grid: 10 m, row-major from the north-west corner, aligned with the scene's x/z.
  const sCols = Math.ceil(widthM / SAMPLE_M);
  const sRows = Math.ceil(depthM / SAMPLE_M);
  const samples: [number, number][] = [];
  for (let r = 0; r < sRows; r++)
    for (let c = 0; c < sCols; c++)
      samples.push([north - (((r + 0.5) * SAMPLE_M) / depthM) * (north - south), west + (((c + 0.5) * SAMPLE_M) / widthM) * (east - west)]);
  console.log(`${sCols}×${sRows} samples at ${SAMPLE_M} m`);

  // 1. Tree cover (may span several 3° WorldCover tiles).
  const lc = new Float64Array(samples.length).fill(NaN);
  const tileOf = samples.map(([lat, lon]) => worldCoverTile(lat, lon));
  for (const url of new Set(tileOf)) {
    const idx = tileOf.flatMap((t, i) => (t === url ? [i] : []));
    const vals = await sampler(url, (lat, lon) => [lon, lat], idx.map((i) => samples[i]));
    idx.forEach((i, k) => (lc[i] = vals[k]));
  }
  const isTree = (i: number) => lc[i] === 10;
  const treeCount = samples.reduce((n, _, i) => n + (isTree(i) ? 1 : 0), 0);
  console.log(`WorldCover: ${((treeCount / samples.length) * 100).toFixed(1)}% tree cover`);


  // 2. Seasons. North: summer Jul–Aug, leaf-off late Oct–mid Nov. Flipped down south.
  const lat0 = (south + north) / 2;
  const seasons = (lat0 >= 0
    ? { summer: ["07-01", "08-31"], leafOff: ["10-20", "11-15"] }
    : { summer: ["01-05", "02-28"], leafOff: ["04-20", "05-15"] }) as Record<string, [string, string]>;
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 3, thisYear - 2, thisYear - 1, thisYear];
  const searchBox = [west, south, east, north];
  const scenes: Record<string, Scene[]> = {};
  for (const [name, range] of Object.entries(seasons)) {
    scenes[name] = await findScenes(searchBox, range, years);
    console.log(`${name} scenes: ${scenes[name].map((s) => s.id).join(", ")}`);
    if (!scenes[name].length) throw new Error(`no clear Sentinel-2 scenes for ${name}`);
  }

  // Only WorldCover tree pixels need spectra. SCL is 20 m; the sampler handles each band's resolution.
  const treeIdx = samples.flatMap((_, i) => (isTree(i) ? [i] : []));
  const treeSamples = treeIdx.map((i) => samples[i]);
  const stack = async (list: Scene[], a: Band, b: Band) => {
    const per: number[][] = [];
    for (const s of list) {
      per.push(await sceneIndex(s, a, b, treeSamples));
      process.stdout.write(".");
    }
    return treeSamples.map((_, k) => median(per.map((p) => p[k])));
  };
  const ndviSummer = await stack(scenes.summer, "nir", "red");
  const ndviOff = await stack(scenes.leafOff, "nir", "red");
  process.stdout.write("\n");
  const halfLat = ((SAMPLE_M / 2) * (north - south)) / depthM;
  const halfLon = ((SAMPLE_M / 2) * (east - west)) / widthM;
  const canopy = await canopyHeights(treeSamples, halfLat, halfLon);

  const pcts = (v: number[]) => {
    const s = v.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
    return [0.1, 0.5, 0.9].map((q) => s[Math.floor(q * (s.length - 1))].toFixed(2)).join(" / ");
  };

  // a) Still forest? WorldCover is from 2021; runs cut since then are bare in recent summers.
  const GREEN_SUMMER = 0.45;
  const forest = treeIdx.map((_, k) => Number.isNaN(ndviSummer[k]) || ndviSummer[k] >= GREEN_SUMMER);
  console.log(`summer NDVI p10/50/90 ${pcts(ndviSummer)}; ${forest.filter((f) => !f).length} tree pixels cleared since 2021`);

  // b) Deciduous? NDVI drop from summer to leaf-off, threshold from the data.
  const drop = treeIdx.map((_, k) => ndviSummer[k] - ndviOff[k]);
  const dropT = Math.max(0.12, otsu(drop.filter((d, k) => forest[k] && !Number.isNaN(d)), -0.2, 0.8));
  const deciduous = drop.map((d, k) => forest[k] && d > dropT);
  console.log(`NDVI drop p10/50/90 ${pcts(drop)}; deciduous above ${dropT.toFixed(3)}`);

  // c) Aspen or scrub oak/maple? Canopy height among deciduous pixels.
  const decH = Array.from(canopy).filter((h, k) => deciduous[k] && !Number.isNaN(h));
  const hist = new Array(8).fill(0);
  for (const h of decH) hist[Math.min(7, Math.floor(h / 3))]++;
  console.log(`deciduous canopy height (3 m bins): ${hist.map((n, i) => `${i * 3}-${i * 3 + 3}m ${Math.round((n / decH.length) * 100)}%`).join(", ")}; scrub below ${SCRUB_MAX_M} m`);

  // Per-sample class: 0 none, 1 evergreen, 2 aspen, 3 scrub oak/maple. Unobserved pixels default to evergreen/aspen.
  const cls = new Uint8Array(samples.length);
  const sampleH = new Float32Array(samples.length).fill(NaN);
  treeIdx.forEach((i, k) => {
    if (!forest[k]) return;
    sampleH[i] = canopy[k];
    cls[i] = !deciduous[k] ? 1 : canopy[k] < SCRUB_MAX_M ? 3 : 2;
  });

  // 3. Aggregate 10 m samples into 20 m cells: wooded when ≥ half the samples are, kind by plurality.
  const k = CELL_M / SAMPLE_M;
  const cols = Math.ceil(sCols / k);
  const rows = Math.ceil(sRows / k);
  let cells = "";
  let heights = "";
  const counts = [0, 0, 0, 0];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let n = 0;
      const kinds = [0, 0, 0, 0];
      const hs: number[] = [];
      for (let dr = 0; dr < k; dr++)
        for (let dc = 0; dc < k; dc++) {
          const R = r * k + dr;
          const C = c * k + dc;
          if (R >= sRows || C >= sCols) continue;
          n++;
          kinds[cls[R * sCols + C]]++;
          if (!Number.isNaN(sampleH[R * sCols + C])) hs.push(sampleH[R * sCols + C]);
        }
      const wooded = kinds[1] + kinds[2] + kinds[3];
      let v = 0;
      if (n && wooded * 2 >= n) v = kinds[1] >= kinds[2] && kinds[1] >= kinds[3] ? 1 : kinds[2] >= kinds[3] ? 2 : 3;
      counts[v]++;
      cells += v;
      // canopy height in 2 m steps as one base-36 digit (0-70 m); "0" when open or unknown
      heights += v && hs.length ? Math.min(35, Math.round(median(hs) / 2)).toString(36) : "0";
    }
  const woodedCells = counts[1] + counts[2] + counts[3];
  const share = (n: number) => `${Math.round((n / woodedCells) * 100)}%`;
  console.log(`cells: ${counts[0]} open; of ${woodedCells} wooded: ${share(counts[1])} evergreen, ${share(counts[2])} aspen, ${share(counts[3])} scrub oak/maple`);

  data.forest = { cellM: CELL_M, cols, rows, cells, heights, source: "ESA WorldCover 2021, Copernicus Sentinel-2 seasonal NDVI, Meta/WRI canopy height" };
  data.attribution = data.attribution.replace(/ Forest:.*$/, "") + " Forest: ESA WorldCover 2021, Copernicus Sentinel-2 data, Meta & WRI canopy height.";
  writeFileSync(file, JSON.stringify(data));
  console.log(`→ ${file}`);

  if (debugDir) {
    mkdirSync(debugDir, { recursive: true });
    // Class map: white open, dark green evergreen, gold aspen, rust scrub.
    const png = new PNG({ width: cols, height: rows });
    const pal: Record<string, number[]> = { "0": [245, 245, 240], "1": [36, 92, 52], "2": [235, 190, 40], "3": [180, 60, 45] };
    for (let i = 0; i < cells.length; i++) png.data.set([...pal[cells[i]], 255], i * 4);
    writeFileSync(join(debugDir, `${slug}-forest.png`), PNG.sync.write(png));
    console.log(`debug image → ${join(debugDir, `${slug}-forest.png`)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
