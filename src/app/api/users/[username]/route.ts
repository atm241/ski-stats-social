import { NextResponse } from "next/server";
import { apiDay, apiUser, caller, notFound } from "@/lib/api";
import type { ApiProfile } from "@/lib/apiTypes";
import { loadProfile } from "@/lib/views";

export async function GET(req: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const season = new URL(req.url).searchParams.get("season") ?? undefined;
  const p = await loadProfile(username, await caller(req), season);
  if (!p) return notFound();
  const body: ApiProfile = {
    user: apiUser(p.user),
    isMe: p.isMe,
    following: p.following,
    followers: p.followers,
    followingCount: p.followingCount,
    lifetime: { verticalM: p.lifetime.verticalM, days: p.lifetime.days },
    season: { key: p.season, verticalM: p.totals.verticalM, days: p.totals.days, resorts: p.totals.resorts },
    days: await Promise.all(p.user.days.slice(0, 50).map((d) => apiDay({ ...d, user: p.user }))),
    completions: p.completions.map((c) => ({ slug: c.slug, name: c.name, skied: c.skied, total: c.total })),
  };
  return NextResponse.json(body);
}
