import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { MountainData } from "./types";

const DIR = join(process.cwd(), "public", "mountains");

/** Parsed mountain files, re-read only when a file's mtime changes (mountains get rebuilt and added). */
const cache = new Map<string, { mtimeMs: number; data: Promise<MountainData> }>();

async function read(slug: string): Promise<MountainData> {
  const file = join(DIR, `${slug}.json`);
  const { mtimeMs } = await stat(file);
  const hit = cache.get(slug);
  if (hit && hit.mtimeMs === mtimeMs) return hit.data;
  const data = readFile(file, "utf8").then((s) => JSON.parse(s) as MountainData);
  cache.set(slug, { mtimeMs, data });
  return data;
}

/** Every prebuilt 3D mountain, by name. */
export async function listMountains(): Promise<{ slug: string; name: string; resorts: string[] }[]> {
  const files = (await readdir(DIR).catch(() => [])).filter((f) => f.endsWith(".json"));
  const out = [];
  for (const f of files) {
    try {
      const d = await read(f.slice(0, -5));
      if (!d.runs?.length) continue; // half-built or broken file
      out.push({ slug: d.slug, name: d.name, resorts: d.resorts ?? [d.name] });
    } catch {
      /* being written right now; it'll show up next time */
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Slug of the prebuilt 3D mountain for a resort, if we have one. */
export async function mountainSlugForResort(resortName: string | null): Promise<string | null> {
  if (!resortName) return null;
  for (const m of await listMountains()) if (m.resorts.includes(resortName)) return m.slug;
  return null;
}

/** Full mountain dataset (runs, lifts, terrain…). */
export function loadMountain(slug: string): Promise<MountainData> {
  return read(slug);
}
