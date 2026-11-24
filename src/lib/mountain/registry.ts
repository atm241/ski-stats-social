import "server-only";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { MountainData } from "./types";

const DIR = join(process.cwd(), "public", "mountains");
let byName: Map<string, string> | null = null;

/** Slug of the prebuilt 3D mountain for a resort, if we have one (see scripts/build-mountain.ts). */
export async function mountainSlugForResort(resortName: string | null): Promise<string | null> {
  if (!resortName) return null;
  if (!byName) {
    byName = new Map();
    for (const f of (await readdir(DIR).catch(() => [])).filter((f) => f.endsWith(".json"))) {
      const data = JSON.parse(await readFile(join(DIR, f), "utf8")) as MountainData;
      byName.set(data.name, data.slug);
    }
  }
  return byName.get(resortName) ?? null;
}
