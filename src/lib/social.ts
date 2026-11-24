import "server-only";
import type { SkiDay, User } from "@prisma/client";
import type { Segment } from "./analysis/types";
import type { StoredTrack } from "./analysis/process";
import { prisma } from "./db";

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

const SAME_CHAIR_MS = 2 * 60_000;
const SAME_SPOT_M = 120;

/**
 * Who skied with you: other people's days at the same resort on the same date where at least one
 * lift ride starts within 2 minutes and 120 m of yours (you were on the same lift together).
 */
export async function skiedWith(day: SkiDay & { user: User }): Promise<{ user: User; day: SkiDay; sharedLifts: number }[]> {
  if (!day.resortName) return [];
  const others = await prisma.skiDay.findMany({
    where: { localDate: day.localDate, resortName: day.resortName, NOT: { userId: day.userId } },
    include: { user: true },
  });
  if (!others.length) return [];
  const mine = liftStarts(day);
  return others
    .map((o) => {
      const theirs = liftStarts(o);
      const sharedLifts = mine.filter((a) => theirs.some((b) => Math.abs(a.t - b.t) < SAME_CHAIR_MS && metres(a, b) < SAME_SPOT_M)).length;
      return { user: o.user, day: o as SkiDay, sharedLifts };
    })
    .filter((c) => c.sharedLifts > 0)
    .sort((a, b) => b.sharedLifts - a.sharedLifts);
}

/** Start time and position of each lift ride in a stored day. */
function liftStarts(day: SkiDay) {
  const segs = JSON.parse(day.segments) as Segment[];
  const track = JSON.parse(day.track) as StoredTrack;
  return segs
    .filter((s) => s.kind === "lift")
    .map((s) => {
      // nearest stored point to the lift start
      let best = track.pts[0];
      for (const p of track.pts) {
        if (track.t0 + p[0] * 1000 >= s.startT) {
          best = p;
          break;
        }
      }
      return { t: s.startT, lat: best[1], lon: best[2] };
    });
}

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 110_950);
}
