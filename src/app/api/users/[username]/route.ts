import { NextResponse } from "next/server";
import { apiDay, apiUser, caller, notFound } from "@/lib/api";
import type { ApiProfile } from "@/lib/apiTypes";
import { totals } from "@/lib/days";
import { prisma } from "@/lib/db";
import { currentSeasonKey } from "@/lib/season";
import { followCounts, isFollowing } from "@/lib/social";
import { mountainCompletions } from "@/lib/stats";

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [user, me] = await Promise.all([prisma.user.findUnique({ where: { username }, include: { days: { orderBy: { localDate: "desc" } } } }), caller(req)]);
  if (!user) return notFound();
  const counted = user.days.filter((d) => !d.flagged);
  const seasons = [...new Set(counted.map((d) => d.seasonKey))];
  const key = seasons.includes(currentSeasonKey()) ? currentSeasonKey() : (seasons[0] ?? currentSeasonKey());
  const season = totals(counted.filter((d) => d.seasonKey === key));
  const lifetime = totals(counted);
  const [counts, following, completions] = await Promise.all([followCounts(user.id), me && me.id !== user.id ? isFollowing(me.id, user.id) : false, mountainCompletions(user.days)]);
  const body: ApiProfile = {
    user: apiUser(user),
    isMe: me?.id === user.id,
    following,
    followers: counts.followers,
    followingCount: counts.following,
    lifetime: { verticalM: lifetime.verticalM, days: lifetime.days },
    season: { key, verticalM: season.verticalM, days: season.days, resorts: season.resorts },
    days: await Promise.all(user.days.slice(0, 50).map((d) => apiDay({ ...d, user }))),
    completions: completions.map((c) => ({ slug: c.slug, name: c.name, skied: c.skied, total: c.total })),
  };
  return NextResponse.json(body);
}
