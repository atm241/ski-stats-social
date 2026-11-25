import type { MountainData } from "./mountain/types";

/**
 * "Ski every run": how many of a mountain's named runs someone has skied. A run counts once any of
 * your runs spent a real share of its length on it (the chain of trails labelSegments reports), so
 * cutting across a trail doesn't tick it off.
 */

export const COMPLETION_ORDER = ["easy", "intermediate", "advanced", "expert", "freeride", "other"] as const;
export type CompletionLevel = (typeof COMPLETION_ORDER)[number];

const level = (d: string | null | undefined): CompletionLevel =>
  d === "novice" || d === "easy" ? "easy" : d === "intermediate" ? "intermediate" : d === "advanced" ? "advanced" : d === "expert" ? "expert" : d === "freeride" || d === "extreme" ? "freeride" : "other";

/** Every named run on the map once, with the difficulty of its longest mapped piece. */
export function runCatalog(data: MountainData): Map<string, CompletionLevel> {
  const best = new Map<string, { len: number; level: CompletionLevel }>();
  for (const r of data.runs) {
    const name = r.name?.trim();
    if (!name) continue;
    const len = r.coords.length;
    const cur = best.get(name);
    if (!cur || len > cur.len) best.set(name, { len, level: level(r.difficulty) });
  }
  return new Map([...best].map(([name, v]) => [name, v.level]));
}

export interface Completion {
  total: number;
  skied: number;
  byLevel: { level: CompletionLevel; total: number; skied: number }[];
  /** names of the runs skied, for highlighting on the map */
  skiedNames: string[];
}

export function completion(catalog: Map<string, CompletionLevel>, skied: Iterable<string>): Completion {
  const done = new Set([...skied].filter((n) => catalog.has(n)));
  const byLevel = COMPLETION_ORDER.map((lv) => {
    const names = [...catalog].filter(([, l]) => l === lv).map(([n]) => n);
    return { level: lv, total: names.length, skied: names.filter((n) => done.has(n)).length };
  }).filter((b) => b.total > 0);
  return { total: catalog.size, skied: done.size, byLevel, skiedNames: [...done].sort() };
}
