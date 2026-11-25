import "server-only";
import type { SkiDay } from "@prisma/client";
import type { StoredTrack } from "./analysis/process";
import type { Segment } from "./analysis/types";
import { prisma } from "./db";
import { loadMountain, mountainSlugForResort } from "./mountain/registry";
import type { MountainData } from "./mountain/types";
import { runRows } from "./runRows";

/**
 * Per-run records for trail leaderboards: fastest down a trail (best top speed per skier) and the
 * most-liked runs down it. Runs are labelled once when a day is saved.
 */

/** (Re)builds a saved day's runs. Safe to run twice: existing likes on a run survive a rebuild. */
export async function indexRuns(day: SkiDay) {
  const slug = await mountainSlugForResort(day.resortName);
  if (!slug) return 0;
  const rows = runRows(JSON.parse(day.track) as StoredTrack, JSON.parse(day.segments) as Segment[], await loadMountain(slug));
  await prisma.$transaction(async (tx) => {
    await tx.run.deleteMany({ where: { dayId: day.id, index: { notIn: rows.map((r) => r.index) } } });
    for (const r of rows) {
      const data = { userId: day.userId, mountain: slug, trail: r.trail, trails: JSON.stringify(r.trails), difficulty: r.difficulty, startedAt: r.startedAt, durationS: r.durationS, verticalM: r.verticalM, maxSpeedMps: r.maxSpeedMps, flagged: day.flagged };
      const run = await tx.run.upsert({ where: { dayId_index: { dayId: day.id, index: r.index } }, create: { dayId: day.id, index: r.index, ...data }, update: data });
      await tx.runTrail.deleteMany({ where: { runId: run.id } });
      await tx.runTrail.createMany({ data: r.onTrails.map((o) => ({ runId: run.id, mountain: slug, trail: o.trail, maxSpeedMps: o.maxSpeedMps, share: o.share, userId: day.userId, flagged: day.flagged })) });
    }
  });
  return rows.length;
}

/** Like or unlike a run; returns the new state and count. You can't like your own run. */
export async function setRunLike(userId: string, runId: string, like: boolean) {
  const run = await prisma.run.findUnique({ where: { id: runId }, select: { userId: true } });
  if (!run || run.userId === userId) return null;
  const key = { userId_runId: { userId, runId } };
  const had = !!(await prisma.runLike.findUnique({ where: key }));
  if (like && !had) await prisma.$transaction([prisma.runLike.create({ data: { userId, runId } }), prisma.run.update({ where: { id: runId }, data: { likeCount: { increment: 1 } } })]);
  if (!like && had) await prisma.$transaction([prisma.runLike.delete({ where: key }), prisma.run.update({ where: { id: runId }, data: { likeCount: { decrement: 1 } } })]);
  const { likeCount } = await prisma.run.findUniqueOrThrow({ where: { id: runId }, select: { likeCount: true } });
  return { liked: like, likeCount };
}

const BOARD_SIZE = 25;

/**
 * Leaderboards for one trail. Fastest: each skier's best top speed *while on this trail* (a fast
 * runout below a chute doesn't count), flagged days excluded. Most liked: individual runs that went
 * down it, by likes.
 */
export async function trailBoards(mountain: string, trail: string) {
  const onTrail = await prisma.runTrail.findMany({
    where: { mountain, trail, flagged: false },
    include: { run: { include: { user: true, day: { select: { localDate: true } } } } },
    orderBy: { maxSpeedMps: "desc" },
  });
  const seen = new Set<string>();
  const fastest = onTrail
    .filter((t) => t.maxSpeedMps > 0 && (seen.has(t.userId) ? false : (seen.add(t.userId), true)))
    .slice(0, BOARD_SIZE)
    .map((t) => ({ ...t.run, maxSpeedMps: t.maxSpeedMps }));
  const liked = await prisma.run.findMany({
    where: { mountain, onTrails: { some: { trail } }, likeCount: { gt: 0 } },
    include: { user: true, day: { select: { localDate: true } } },
    orderBy: [{ likeCount: "desc" }, { startedAt: "asc" }],
    take: BOARD_SIZE,
  });
  const totalRuns = await prisma.runTrail.count({ where: { mountain, trail } });
  return { fastest, liked, totalRuns, difficulty: trailDifficulty(await loadMountain(mountain), trail) };
}

/** Trails at a mountain with the most runs down them, for the mountain page's leaderboards list. */
export async function busiestTrails(mountain: string, take = 12) {
  const groups = await prisma.runTrail.groupBy({ by: ["trail"], where: { mountain }, _count: { _all: true }, _max: { maxSpeedMps: true }, orderBy: { _count: { trail: "desc" } }, take });
  // most likes on any one run down each trail (a run counts for every trail it went down)
  const liked = await prisma.runTrail.findMany({ where: { mountain, trail: { in: groups.map((g) => g.trail) }, run: { likeCount: { gt: 0 } } }, select: { trail: true, run: { select: { likeCount: true } } } });
  const topLikes = new Map<string, number>();
  for (const l of liked) topLikes.set(l.trail, Math.max(topLikes.get(l.trail) ?? 0, l.run.likeCount));
  const data = await loadMountain(mountain);
  return groups.map((g) => ({ trail: g.trail, difficulty: trailDifficulty(data, g.trail), runs: g._count._all, topSpeedMps: g._max.maxSpeedMps ?? 0, topLikes: topLikes.get(g.trail) ?? 0 }));
}

/** A trail's rating from the map (its longest mapped piece; OSM often splits a trail). */
export function trailDifficulty(data: MountainData, trail: string): string | null {
  let best: { len: number; d: string | null } | null = null;
  for (const r of data.runs) if (r.name === trail && (!best || r.coords.length > best.len)) best = { len: r.coords.length, d: r.difficulty };
  return best?.d ?? null;
}
