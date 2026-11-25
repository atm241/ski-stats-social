import "server-only";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { MOUNTAIN_INDEX, type MountainIndexEntry, MOUNTAINS_URL, mountainUrl } from "./source";
import type { MountainData } from "./types";

/**
 * Server-side access to the built mountains: from local files when they're here (development, or a
 * deploy that ships them), otherwise fetched once from NEXT_PUBLIC_MOUNTAINS_URL and kept in memory.
 */
const DIR = process.env.MOUNTAINS_DIR ?? join(process.cwd(), "public", "mountains");
const REMOTE = /^https?:\/\//.test(MOUNTAINS_URL);

/** Parsed local files, re-read only when a file's mtime changes (mountains get rebuilt and added). */
const cache = new Map<string, { mtimeMs: number; data: Promise<unknown> }>();

async function readLocal<T>(file: string): Promise<T | null> {
  const path = join(DIR, file);
  const info = await stat(path).catch(() => null);
  if (!info) return null;
  const hit = cache.get(path);
  if (hit && hit.mtimeMs === info.mtimeMs) return hit.data as Promise<T>;
  const data = readFile(path, "utf8").then((s) => JSON.parse(s) as T);
  cache.set(path, { mtimeMs: info.mtimeMs, data });
  data.catch(() => cache.delete(path)); // half-written file: try again next time
  return data;
}

const remote = new Map<string, Promise<unknown>>();
function readRemote<T>(url: string): Promise<T> {
  let data = remote.get(url) as Promise<T> | undefined;
  if (!data) {
    data = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json() as Promise<T>;
    });
    remote.set(url, data);
    data.catch(() => remote.delete(url));
  }
  return data;
}

async function read<T>(file: string, url: string): Promise<T> {
  const local = await readLocal<T>(file);
  if (local) return local;
  if (REMOTE) return readRemote<T>(url);
  throw new Error(`No mountain file ${file} in ${DIR}`);
}

/** Every built mountain, by name. */
export async function listMountains(): Promise<MountainIndexEntry[]> {
  const index = await read<MountainIndexEntry[]>(MOUNTAIN_INDEX, `${MOUNTAINS_URL}/${MOUNTAIN_INDEX}`).catch(() => null);
  const list = index ?? (await scanLocal());
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

/** Without an index (it's written by the build scripts), open every local file. */
async function scanLocal(): Promise<MountainIndexEntry[]> {
  const files = (await readdir(DIR).catch(() => [])).filter((f) => f.endsWith(".json") && f !== MOUNTAIN_INDEX);
  const out: MountainIndexEntry[] = [];
  for (const f of files) {
    const d = await readLocal<MountainData>(f).catch(() => null);
    if (d?.runs?.length) out.push({ slug: d.slug, name: d.name, resorts: d.resorts ?? [d.name] });
  }
  return out;
}

/** Slug of the prebuilt 3D mountain for a resort, if we have one. */
export async function mountainSlugForResort(resortName: string | null): Promise<string | null> {
  if (!resortName) return null;
  for (const m of await listMountains()) if (m.resorts.includes(resortName)) return m.slug;
  return null;
}

/** Full mountain dataset (runs, lifts, terrain…). */
export function loadMountain(slug: string): Promise<MountainData> {
  return read<MountainData>(`${slug}.json`, mountainUrl(slug));
}
