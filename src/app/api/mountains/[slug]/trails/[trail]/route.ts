import { NextResponse } from "next/server";
import { apiUser, notFound } from "@/lib/api";
import type { ApiTrailBoard } from "@/lib/apiTypes";
import { trailBoards } from "@/lib/runs";

/** A trail's leaderboards: fastest skiers down it, most-liked runs down it. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; trail: string }> }) {
  const { slug, trail: raw } = await params;
  const trail = decodeURIComponent(raw);
  if (!/^[a-z0-9-]+$/.test(slug)) return notFound();
  const b = await trailBoards(slug, trail).catch(() => null);
  if (!b || !b.totalRuns) return notFound();
  const body: ApiTrailBoard = {
    mountain: slug,
    trail,
    difficulty: b.difficulty,
    totalRuns: b.totalRuns,
    fastest: b.fastest.map((r) => ({ dayId: r.dayId, user: apiUser(r.user), localDate: r.day.localDate, maxSpeedMps: r.maxSpeedMps })),
    liked: b.liked.map((r) => ({ dayId: r.dayId, user: apiUser(r.user), localDate: r.day.localDate, likes: r.likeCount })),
  };
  return NextResponse.json(body);
}
