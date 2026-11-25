import "server-only";
import type { SkiDay } from "@prisma/client";
import { type Completion, completion, runCatalog } from "./completion";
import type { Segment } from "./analysis/types";
import { dayDetail } from "./days";
import { loadMountain, mountainSlugForResort } from "./mountain/registry";
import type { MountainData } from "./mountain/types";
import { labelSegments } from "./trails";

export interface TrailStats {
  /** vertical (m) per normalised difficulty: easy / intermediate / advanced / expert / freeride */
  byDifficulty: Record<string, number>;
  trails: { name: string; resort: string; difficulty: string | null; runs: number; verticalM: number }[];
  lifts: { name: string; resort: string; rides: number }[];
  /** days whose resort has a trail map (so runs could be named) */
  mappedDays: number;
}

/**
 * Trail labels for a saved day, cached: saved days never change, and the cache is keyed by the loaded
 * mountain file so a rebuilt mountain relabels. Profile and mountain pages label the same days for
 * several panels, so this saves re-parsing tracks and re-matching trails on every request.
 */
const labelCache = new WeakMap<MountainData, Map<string, ReturnType<typeof labelSegments>>>();
const MAX_CACHED_DAYS = 5000;
function dayLabels(day: SkiDay, data: MountainData) {
  let perMountain = labelCache.get(data);
  if (!perMountain) labelCache.set(data, (perMountain = new Map()));
  let labels = perMountain.get(day.id);
  if (!labels) {
    const { track, segments } = dayDetail(day);
    labels = labelSegments(track, segments, data);
    if (perMountain.size >= MAX_CACHED_DAYS) perMountain.delete(perMountain.keys().next().value!);
    perMountain.set(day.id, labels);
  }
  return labels;
}

const norm = (d: string | null) => (d === "novice" ? "easy" : d === "extreme" ? "freeride" : d);

/** Trail-level season stats for days at resorts we have a trail map for. */
export async function trailStats(days: SkiDay[]): Promise<TrailStats> {
  const byDifficulty: Record<string, number> = {};
  const trails = new Map<string, TrailStats["trails"][number]>();
  const lifts = new Map<string, TrailStats["lifts"][number]>();
  let mappedDays = 0;
  for (const day of days) {
    const slug = await mountainSlugForResort(day.resortName);
    if (!slug) continue;
    mappedDays++;
    const segments = JSON.parse(day.segments) as Segment[];
    const labels = dayLabels(day, await loadMountain(slug));
    segments.forEach((s, i) => {
      const l = labels[i];
      if (!l) return;
      const key = `${day.resortName}|${l.name}`;
      if (s.kind === "run") {
        const d = norm(l.difficulty);
        if (d) byDifficulty[d] = (byDifficulty[d] ?? 0) + s.verticalM;
        const t = trails.get(key) ?? { name: l.name, resort: day.resortName!, difficulty: l.difficulty, runs: 0, verticalM: 0 };
        t.runs++;
        t.verticalM += s.verticalM;
        trails.set(key, t);
      } else if (s.kind === "lift") {
        const t = lifts.get(key) ?? { name: l.name, resort: day.resortName!, rides: 0 };
        t.rides++;
        lifts.set(key, t);
      }
    });
  }
  return {
    byDifficulty,
    trails: [...trails.values()].sort((a, b) => b.runs - a.runs || b.verticalM - a.verticalM),
    lifts: [...lifts.values()].sort((a, b) => b.rides - a.rides),
    mappedDays,
  };
}

/** Runs skied of each 3D-mapped mountain in `days` (pass all of someone's days for an all-time count). */
export async function mountainCompletions(days: SkiDay[]): Promise<({ slug: string; name: string } & Completion)[]> {
  const skied = new Map<string, Set<string>>();
  for (const day of days) {
    if (day.flagged) continue;
    const slug = await mountainSlugForResort(day.resortName);
    if (!slug) continue;
    const segments = JSON.parse(day.segments) as Segment[];
    const labels = dayLabels(day, await loadMountain(slug));
    const set = skied.get(slug) ?? new Set<string>();
    segments.forEach((s, i) => s.kind === "run" && labels[i]?.names.forEach((n) => set.add(n)));
    skied.set(slug, set);
  }
  const out = [];
  for (const [slug, names] of skied) {
    const data = await loadMountain(slug);
    out.push({ slug, name: data.name, ...completion(runCatalog(data), names) });
  }
  return out.sort((a, b) => b.skied / b.total - a.skied / a.total);
}
