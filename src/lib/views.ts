import "server-only";
import type { User } from "@/generated/prisma/client";
import { dayComments } from "./comments";
import { dayDetail, WITH_TRACK } from "./dayRecord";
import { totals } from "./days";
import { prisma } from "./db";
import { loadMountain, mountainSlugForResort } from "./mountain/registry";
import { currentSeasonKey } from "./season";
import { followCounts, followingIds, isFollowing, skiedWith } from "./social";
import { mountainCompletions } from "./stats";
import { labelSegments } from "./trails";

/**
 * What the day, profile and feed screens show. The web pages and the JSON API (the mobile app) both
 * read from here, so the two clients can't drift apart; each only decides how to present it.
 */

/** A day with its track, trail labels, friends who skied it, comments and per-run likes. */
export async function loadDay(id: string, me: User | null) {
  const day = await prisma.skiDay.findUnique({ where: { id }, include: { user: true }, omit: WITH_TRACK });
  if (!day) return null;
  const { track, segments, flagReasons } = dayDetail(day);
  const slug = await mountainSlugForResort(day.resortName);
  const labels = slug ? labelSegments(track, segments, await loadMountain(slug)) : segments.map(() => null);
  const isMine = me?.id === day.userId;
  const [companions, comments, runs] = await Promise.all([
    skiedWith(day, { track, segments }),
    dayComments(day.id),
    prisma.run.findMany({ where: { dayId: day.id }, include: { likes: me ? { where: { userId: me.id }, select: { userId: true } } : false } }),
  ]);
  return {
    day,
    track,
    segments,
    flagReasons,
    slug,
    labels,
    isMine,
    companions,
    canComment: !!me,
    comments: comments.map((c) => ({ ...c, canDelete: !!me && (me.id === c.userId || isMine) })),
    /** by segment index */
    runs: new Map(runs.map((r) => [r.index, { id: r.id, likes: r.likeCount, liked: !!r.likes?.length, canLike: !!me && !isMine, mountain: r.mountain, trail: r.trail }])),
  };
}

export type DayView = NonNullable<Awaited<ReturnType<typeof loadDay>>>;

/**
 * Someone's profile for one season: `season` if they skied it, else the current season if they have
 * days in it, else their latest. Flagged days are listed but not counted.
 */
export async function loadProfile(username: string, me: User | null, season?: string) {
  const user = await prisma.user.findUnique({ where: { username }, include: { days: { orderBy: [{ localDate: "desc" }, { startedAt: "desc" }] } } });
  if (!user) return null;
  const seasons = [...new Set(user.days.map((d) => d.seasonKey))];
  const key = season && seasons.includes(season) ? season : seasons.includes(currentSeasonKey()) ? currentSeasonKey() : (seasons[0] ?? currentSeasonKey());
  const days = user.days.filter((d) => d.seasonKey === key);
  const counted = days.filter((d) => !d.flagged);
  const [counts, following, completions] = await Promise.all([
    followCounts(user.id),
    me && me.id !== user.id ? isFollowing(me.id, user.id) : false,
    mountainCompletions(user.id), // all seasons
  ]);
  return {
    user,
    isMe: me?.id === user.id,
    canFollow: !!me && me.id !== user.id,
    seasons,
    season: key,
    /** this season's days, newest first */
    days,
    counted,
    totals: totals(counted),
    lifetime: totals(user.days.filter((d) => !d.flagged)),
    followers: counts.followers,
    followingCount: counts.following,
    following,
    completions,
  };
}

/** Latest days from you and the people you follow; everyone's when signed out or following nobody. */
export async function feedDays(me: User | null, take: number) {
  const following = me ? await followingIds(me.id) : [];
  const days = await prisma.skiDay.findMany({
    where: following.length ? { userId: { in: [me!.id, ...following] } } : undefined,
    orderBy: [{ localDate: "desc" }, { startedAt: "desc" }],
    take,
    include: { user: true },
  });
  return { days, everyone: !following.length };
}
