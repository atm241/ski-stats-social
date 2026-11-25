import "server-only";
import type { User } from "@/generated/prisma/client";
import { prisma } from "./db";
import { friendIds, followingIds } from "./social";
import { newUploadToken } from "./tokens";

/** Finding people: search, suggestions, and invite links that make two people friends in one tap. */

const SEARCH_LIMIT = 20;

/** Name or username search (case-insensitive contains), friends first. */
export async function searchPeople(q: string, me: User | null) {
  const term = q.trim().replace(/^@/, "").slice(0, 40);
  if (term.length < 2) return [];
  const users = await prisma.user.findMany({
    where: { OR: [{ username: { contains: term, mode: "insensitive" } }, { displayName: { contains: term, mode: "insensitive" } }], ...(me ? { NOT: { id: me.id } } : {}) },
    take: SEARCH_LIMIT * 2,
  });
  const friends = new Set(me ? await friendIds(me.id) : []);
  const lower = term.toLowerCase();
  const score = (u: User) => (friends.has(u.id) ? 0 : 2) + (u.username.startsWith(lower) || u.displayName.toLowerCase().startsWith(lower) ? 0 : 1);
  return users.sort((a, b) => score(a) - score(b) || a.displayName.localeCompare(b.displayName)).slice(0, SEARCH_LIMIT);
}

export type Suggestion = { user: User; reason: string };

/**
 * People you may know, strongest signal first: they follow you (follow back), friends of your friends,
 * then people with days at the same mountains. Never people you already follow.
 */
export async function suggestions(me: User, take = 8): Promise<Suggestion[]> {
  const [following, friends, followers] = await Promise.all([
    followingIds(me.id),
    friendIds(me.id),
    prisma.follow.findMany({ where: { followingId: me.id }, select: { followerId: true } }),
  ]);
  const skip = new Set([me.id, ...following]);
  const out = new Map<string, string>();
  const add = (id: string, reason: string) => !skip.has(id) && !out.has(id) && out.set(id, reason);

  for (const f of followers) add(f.followerId, "Follows you");
  if (friends.length) {
    const fof = await prisma.follow.findMany({ where: { followerId: { in: friends } }, select: { followingId: true } });
    const counts = new Map<string, number>();
    for (const f of fof) counts.set(f.followingId, (counts.get(f.followingId) ?? 0) + 1);
    for (const [id, n] of [...counts].sort((a, b) => b[1] - a[1])) add(id, n === 1 ? "Friend of a friend" : `${n} mutual friends`);
  }
  const myResorts = await prisma.skiDay.findMany({ where: { userId: me.id, resortName: { not: null } }, select: { resortName: true }, distinct: ["resortName"] });
  if (myResorts.length) {
    const there = await prisma.skiDay.findMany({ where: { resortName: { in: myResorts.map((r) => r.resortName!) }, userId: { notIn: [...skip] } }, select: { userId: true, resortName: true }, distinct: ["userId"], take: 50 });
    for (const d of there) add(d.userId, `Skis ${d.resortName}`);
  }

  const ids = [...out.keys()].slice(0, take);
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  return ids.flatMap((id) => {
    const user = users.find((u) => u.id === id);
    return user ? [{ user, reason: out.get(id)! }] : [];
  });
}

/** The user's invite code, created on first use. */
export async function inviteCodeFor(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { inviteCode: true } });
  if (u.inviteCode) return u.inviteCode;
  const code = newUploadToken(); // 12 chars from an unambiguous alphabet
  await prisma.user.update({ where: { id: userId }, data: { inviteCode: code } });
  return code;
}

export const inviterFor = (code: string) => prisma.user.findUnique({ where: { inviteCode: code } });

/** Accepting an invite: both follow each other, which is what "friends" means here. */
export async function becomeFriends(a: string, b: string) {
  if (a === b) return;
  await prisma.$transaction([
    prisma.follow.upsert({ where: { followerId_followingId: { followerId: a, followingId: b } }, create: { followerId: a, followingId: b }, update: {} }),
    prisma.follow.upsert({ where: { followerId_followingId: { followerId: b, followingId: a } }, create: { followerId: b, followingId: a }, update: {} }),
  ]);
}
