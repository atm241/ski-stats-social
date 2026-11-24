/**
 * Overpass API query with an on-disk cache and exponential backoff across public endpoints.
 * The public servers are often at capacity (429/502/504 or no answer), so answers are cached in
 * .cache/overpass/ keyed by the query text: re-running a build step never repeats a query that worked.
 * Delete the folder to refresh OSM data.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const HEADERS = { "User-Agent": "pow-pals-mountain-builder/0.1 (personal project)" };
const CACHE = join(".cache", "overpass");

export async function overpass<T = unknown>(query: string, attempts = 16): Promise<T> {
  const file = join(CACHE, `${createHash("sha256").update(query).digest("hex").slice(0, 24)}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;

  let last = "";
  for (let i = 0; i < attempts; i++) {
    const url = ENDPOINTS[i % ENDPOINTS.length];
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), headers: HEADERS, signal: AbortSignal.timeout(120_000) });
      if (res.ok) {
        const text = await res.text();
        const json = JSON.parse(text) as T & { remark?: string };
        if (!json.remark?.includes("runtime error")) {
          mkdirSync(CACHE, { recursive: true });
          writeFileSync(file, text);
          return json;
        }
        last = `${url}: ${json.remark}`;
      } else last = `${url}: ${res.status}`;
    } catch (e) {
      last = `${url}: ${e instanceof Error ? e.name : String(e)}`;
    }
    const wait = Math.min(90, 5 * 2 ** Math.floor(i / ENDPOINTS.length));
    console.warn(`overpass busy (${last}); retrying in ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw new Error(`overpass failed after ${attempts} attempts: ${last}`);
}
