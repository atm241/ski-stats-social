import { NextResponse } from "next/server";
import { apiDay, apiUser, caller, notFound } from "@/lib/api";
import type { ApiDayDetail } from "@/lib/apiTypes";
import { setDayVisibility } from "@/lib/privacy";
import { loadDay } from "@/lib/views";
import { isVisibility } from "@/lib/visibility";

const PROFILE_POINTS = 400;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadDay(id, await caller(req));
  if (!view) return notFound();
  const { day, track, segments, labels, companions, comments, runs } = view;
  const step = Math.max(1, Math.ceil(track.pts.length / PROFILE_POINTS));
  const body: ApiDayDetail = {
    ...(await apiDay(day)),
    visibility: day.visibility,
    isMine: view.isMine,
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
        const r = runs.get(i);
        return {
          kind: s.kind,
          startT: s.startT,
          endT: s.endT,
          verticalM: s.verticalM,
          maxSpeedMps: s.maxSpeedMps,
          name: labels[i]?.names.join(" → ") ?? null,
          difficulty: labels[i]?.difficulty ?? null,
          run: r ? { id: r.id, likes: r.likes, liked: r.liked, canLike: r.canLike, trail: r.trail } : undefined,
        };
      })
      .filter((s) => s.kind === "run" || s.kind === "lift" || s.kind === "skin"),
    profile: track.pts.filter((_, i) => i % step === 0).map((p) => [p[0], p[3]]),
    skiedWith: companions.map((c) => ({ user: apiUser(c.user), dayId: c.day.id, runs: c.runs, lifts: c.lifts })),
    comments: comments.map((c) => ({ id: c.id, user: apiUser(c.user), body: c.body, createdAt: c.createdAt.getTime(), canDelete: c.canDelete })),
    canComment: view.canComment,
  };
  return NextResponse.json(body);
}

/** The owner changes who sees the day. Body: { "visibility": "public" | "friends" | "private" }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { visibility } = (await req.json().catch(() => ({}))) as { visibility?: unknown };
  if (!isVisibility(visibility)) return NextResponse.json({ error: "visibility must be public, friends or private." }, { status: 400 });
  if (!(await setDayVisibility(me.id, id, visibility))) return notFound();
  return NextResponse.json({ visibility });
}
