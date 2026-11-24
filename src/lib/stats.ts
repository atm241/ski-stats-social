import "server-only";
import type { SkiDay } from "@prisma/client";
import { dayDetail } from "./days";
import { loadMountain, mountainSlugForResort } from "./mountain/registry";
import { labelSegments } from "./trails";

export interface TrailStats {
  /** vertical (m) per normalised difficulty: easy / intermediate / advanced / expert / freeride */
  byDifficulty: Record<string, number>;
  trails: { name: string; resort: string; difficulty: string | null; runs: number; verticalM: number }[];
  lifts: { name: string; resort: string; rides: number }[];
  /** days whose resort has a trail map (so runs could be named) */
  mappedDays: number;
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
    const { track, segments } = dayDetail(day);
    const labels = labelSegments(track, segments, await loadMountain(slug));
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
