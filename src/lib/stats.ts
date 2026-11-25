import "server-only";
import { type Completion, completion, runCatalog } from "./completion";
import { prisma } from "./db";
import { listMountains, loadMountain } from "./mountain/registry";

/**
 * Trail-level stats, read from the run index (Run, RunTrail, LiftRide rows written when a day is
 * saved), so no GPS track is parsed per request. Flagged days never count.
 */

export interface TrailStats {
  /** vertical (m) per normalised difficulty: easy / intermediate / advanced / expert / freeride */
  byDifficulty: Record<string, number>;
  trails: { name: string; mountain: string; difficulty: string | null; runs: number; verticalM: number }[];
  lifts: { name: string; mountain: string; rides: number }[];
  /** days with runs or lifts we could name */
  mappedDays: number;
}

/** One skier's season, or everyone's season at one mountain. */
export type TrailScope = { seasonKey: string } & ({ userId: string } | { mountain: string });

const norm = (d: string | null) => (d === "novice" ? "easy" : d === "extreme" ? "freeride" : d);

export async function trailStats(scope: TrailScope): Promise<TrailStats> {
  const who = "userId" in scope ? { userId: scope.userId } : { mountain: scope.mountain };
  const where = { ...who, flagged: false, day: { seasonKey: scope.seasonKey } };
  const [byTrail, byLift, mappedDays] = await Promise.all([
    prisma.run.groupBy({ by: ["mountain", "trail", "difficulty"], where, _count: { _all: true }, _sum: { verticalM: true } }),
    prisma.liftRide.groupBy({ by: ["mountain", "lift"], where, _count: { _all: true } }),
    prisma.skiDay.count({
      where: {
        seasonKey: scope.seasonKey,
        flagged: false,
        ...("userId" in scope ? { userId: scope.userId } : {}),
        OR: [{ runs: { some: who } }, { liftRides: { some: who } }],
      },
    }),
  ]);

  const byDifficulty: Record<string, number> = {};
  const trails = new Map<string, TrailStats["trails"][number]>();
  for (const g of byTrail) {
    const verticalM = g._sum.verticalM ?? 0;
    const d = norm(g.difficulty);
    if (d) byDifficulty[d] = (byDifficulty[d] ?? 0) + verticalM;
    const key = `${g.mountain}|${g.trail}`;
    const t = trails.get(key) ?? { name: g.trail, mountain: g.mountain, difficulty: g.difficulty, runs: 0, verticalM: 0 };
    t.runs += g._count._all;
    t.verticalM += verticalM;
    trails.set(key, t);
  }
  return {
    byDifficulty,
    trails: [...trails.values()].sort((a, b) => b.runs - a.runs || b.verticalM - a.verticalM),
    lifts: byLift.map((g) => ({ name: g.lift, mountain: g.mountain, rides: g._count._all })).sort((a, b) => b.rides - a.rides),
    mappedDays,
  };
}

/** Runs skied of each 3D-mapped mountain, all seasons (or just `mountain`), best-completed first. */
export async function mountainCompletions(userId: string, mountain?: string): Promise<({ slug: string; name: string } & Completion)[]> {
  const rows = await prisma.runTrail.findMany({ where: { userId, flagged: false, ...(mountain ? { mountain } : {}) }, select: { mountain: true, trail: true }, distinct: ["mountain", "trail"] });
  const skied = new Map<string, string[]>();
  for (const r of rows) skied.set(r.mountain, [...(skied.get(r.mountain) ?? []), r.trail]);
  const known = new Set((await listMountains()).map((m) => m.slug));
  const out = [];
  for (const [slug, names] of skied) {
    if (!known.has(slug)) continue; // a mountain that's since been removed
    const data = await loadMountain(slug);
    out.push({ slug, name: data.name, ...completion(runCatalog(data), names) });
  }
  return out.sort((a, b) => b.skied / b.total - a.skied / a.total);
}
