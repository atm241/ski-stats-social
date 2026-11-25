import "server-only";
import type { User } from "@/generated/prisma/client";
import type { StoredTrack } from "./analysis/process";
import type { Segment } from "./analysis/types";
import { type Day, dayDetail, WITH_TRACK } from "./dayRecord";
import { prisma } from "./db";
import { type Together, togetherness } from "./together";

/** Ids of the people `userId` follows. */
export async function followingIds(userId: string): Promise<string[]> {
  return (await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } })).map((f) => f.followingId);
}

export async function isFollowing(followerId: string, followingId: string) {
  return !!(await prisma.follow.findUnique({ where: { followerId_followingId: { followerId, followingId } } }));
}

export async function followCounts(userId: string) {
  const [followers, following] = await Promise.all([prisma.follow.count({ where: { followingId: userId } }), prisma.follow.count({ where: { followerId: userId } })]);
  return { followers, following };
}

/** Ids of people who follow `userId` and whom `userId` follows back. */
export async function friendIds(userId: string): Promise<string[]> {
  const [out, inc] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } }),
    prisma.follow.findMany({ where: { followingId: userId }, select: { followerId: true } }),
  ]);
  const back = new Set(inc.map((f) => f.followerId));
  return out.map((f) => f.followingId).filter((id) => back.has(id));
}

export type Companion = { user: User; day: Day; track: StoredTrack; segments: Segment[] } & Together;

/**
 * Friends who skied with you: their day at the same resort on the same date, with the lifts and runs
 * you shared (see together.ts). Only mutual follows are shown, so a stranger on the next chair is
 * never revealed on your day, and you never show up on theirs.
 */
export async function skiedWith(day: Day, mine: { track: StoredTrack; segments: Segment[] }): Promise<Companion[]> {
  if (!day.resortName) return [];
  const friends = await friendIds(day.userId);
  if (!friends.length) return [];
  const others = await prisma.skiDay.findMany({
    where: { localDate: day.localDate, resortName: day.resortName, userId: { in: friends } },
    include: { user: true },
    omit: WITH_TRACK,
  });
  return others
    .map(({ track: t, segments: s, user, ...day }) => {
      const { track, segments } = dayDetail({ track: t, segments: s, flagReasons: null });
      return { user, day, track, segments, ...togetherness(mine, track) };
    })
    .filter((c) => c.lifts + c.runs > 0)
    .sort((a, b) => b.sharedS - a.sharedS);
}
