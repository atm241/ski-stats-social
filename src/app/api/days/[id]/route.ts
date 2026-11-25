import { NextResponse } from "next/server";
import { apiDay, apiUser, caller, notFound } from "@/lib/api";
import type { ApiDayDetail } from "@/lib/apiTypes";
import { dayComments } from "@/lib/comments";
import { dayDetail } from "@/lib/days";
import { prisma } from "@/lib/db";
import { loadMountain, mountainSlugForResort } from "@/lib/mountain/registry";
import { skiedWith } from "@/lib/social";
import { labelSegments } from "@/lib/trails";

const PROFILE_POINTS = 400;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [day, me] = await Promise.all([prisma.skiDay.findUnique({ where: { id }, include: { user: true } }), caller(req)]);
  if (!day) return notFound();
  const { track, segments } = dayDetail(day);
  const slug = await mountainSlugForResort(day.resortName);
  const labels = slug ? labelSegments(track, segments, await loadMountain(slug)) : segments.map(() => null);
  const step = Math.max(1, Math.ceil(track.pts.length / PROFILE_POINTS));
  const [companions, comments, runs] = await Promise.all([
    skiedWith(day),
    dayComments(day.id),
    prisma.run.findMany({ where: { dayId: day.id }, include: { likes: me ? { where: { userId: me.id }, select: { userId: true } } : false } }),
  ]);
  const runAt = new Map(runs.map((r) => [r.index, r]));
  const body: ApiDayDetail = {
    ...(await apiDay(day)),
    timezone: day.timezone,
    startedAt: day.startedAt.getTime(),
    endedAt: day.endedAt.getTime(),
    skiTimeS: day.skiTimeS,
    liftTimeS: day.liftTimeS,
    liftWaitS: day.liftWaitS,
    longestRunM: day.longestRunM,
    peakEleM: day.peakEleM,
    timeline: segments
      .map((s, i) => {
        const r = runAt.get(i);
        return {
          kind: s.kind,
          startT: s.startT,
          endT: s.endT,
          verticalM: s.verticalM,
          maxSpeedMps: s.maxSpeedMps,
          name: labels[i]?.names.join(" → ") ?? null,
          difficulty: labels[i]?.difficulty ?? null,
          run: r ? { id: r.id, likes: r.likeCount, liked: !!r.likes?.length, canLike: !!me && me.id !== day.userId, trail: r.trail } : undefined,
        };
      })
      .filter((s) => s.kind === "run" || s.kind === "lift" || s.kind === "skin"),
    profile: track.pts.filter((_, i) => i % step === 0).map((p) => [p[0], p[3]]),
    skiedWith: companions.map((c) => ({ user: apiUser(c.user), dayId: c.day.id, runs: c.runs, lifts: c.lifts })),
    comments: comments.map((c) => ({ id: c.id, user: apiUser(c.user), body: c.body, createdAt: c.createdAt.getTime(), canDelete: !!me && (me.id === c.userId || me.id === day.userId) })),
    canComment: !!me,
  };
  return NextResponse.json(body);
}
