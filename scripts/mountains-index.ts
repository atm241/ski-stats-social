/**
 * Writes public/mountains/index.json (slug, name, resorts of every built mountain) so the app can
 * list mountains without parsing every file. build-mountain runs this; `npm run mountains:index` too.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MOUNTAIN_INDEX, type MountainIndexEntry } from "../src/lib/mountain/source";
import type { MountainData } from "../src/lib/mountain/types";

export function writeMountainIndex(dir = join(process.cwd(), "public", "mountains")) {
  const entries: MountainIndexEntry[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== MOUNTAIN_INDEX).sort()) {
    const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as MountainData;
    if (d.runs?.length) entries.push({ slug: d.slug, name: d.name, resorts: d.resorts ?? [d.name] });
  }
  writeFileSync(join(dir, MOUNTAIN_INDEX), JSON.stringify(entries, null, 1) + "\n");
  return entries.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(`Indexed ${writeMountainIndex()} mountains`);
