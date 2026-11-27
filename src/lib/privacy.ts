import "server-only";
import type { Prisma, User } from "@/generated/prisma/client";
import type { StoredTrack } from "./analysis/process";
import { prisma } from "./db";
import { friendIds } from "./social";
import type { Visibility } from "./visibility";
import { trimTrackEnds } from "./trackPrivacy";

/**
 * Who sees what. A day is public (anyone), friends (mutual follows) or private (only its owner);
 * private days still count toward totals and leaderboards, they just aren't shown. Other people
 * see tracks without their first and last stretch unless the owner turned that off.
 */

type Viewer = Pick<User, "id"> | null;
type DayAccess = { userId: string; visibility: string };

/** A Prisma filter for the days `me` may see. */
export async function visibleDays(me: Viewer): Promise<Prisma.SkiDayWhereInput> {
  if (!me) return { visibility: "public" };
  return { OR: [{ visibility: "public" }, { userId: me.id }, { visibility: "friends", userId: { in: await friendIds(me.id) } }] };
}

/** For filtering a list already loaded: one friends lookup, then a cheap check per day. */
export async function dayFilter(me: Viewer): Promise<(day: DayAccess) => boolean> {
  const friends = new Set(me ? await friendIds(me.id) : []);
  return (d) => d.visibility === "public" || d.userId === me?.id || (d.visibility === "friends" && friends.has(d.userId));
}

export async function canSeeDay(day: DayAccess, me: Viewer): Promise<boolean> {
  if (day.visibility === "public" || day.userId === me?.id) return true;
  return day.visibility === "friends" && !!me && (await dayFilter(me))(day);
}

/** The track as `me` may see it: whole for its owner, otherwise without its ends if the owner asked. */
export function trackFor(track: StoredTrack, owner: Pick<User, "id" | "hideTrackEnds">, me: Viewer): StoredTrack {
  return owner.id === me?.id || !owner.hideTrackEnds ? track : trimTrackEnds(track);
}

/** The owner changes who sees one of their days. Returns false if it isn't theirs. */
export async function setDayVisibility(userId: string, dayId: string, visibility: Visibility) {
  const { count } = await prisma.skiDay.updateMany({ where: { id: dayId, userId }, data: { visibility } });
  return count > 0;
}

/** Privacy settings: who sees new days (optionally applied to every existing day too), and track ends. */
export async function savePrivacy(userId: string, s: { defaultVisibility: Visibility; hideTrackEnds: boolean; applyToPast: boolean }) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { defaultVisibility: s.defaultVisibility, hideTrackEnds: s.hideTrackEnds } }),
    ...(s.applyToPast ? [prisma.skiDay.updateMany({ where: { userId }, data: { visibility: s.defaultVisibility } })] : []),
  ]);
}
