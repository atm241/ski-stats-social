import { NextResponse } from "next/server";
import { apiUser, caller } from "@/lib/api";
import type { ApiLeaderboard } from "@/lib/apiTypes";
import { leaderboard, METRICS, type Metric, seasonsWithData } from "@/lib/days";
import { currentSeasonKey } from "@/lib/season";
import { friendIds } from "@/lib/social";

/** ?season=2025-26&metric=vertical&scope=public|friends (friends = mutual follows, needs auth) */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const me = await caller(req);
  const seasons = await seasonsWithData();
  const wanted = q.get("season");
  const season = wanted && seasons.includes(wanted) ? wanted : seasons.includes(currentSeasonKey()) ? currentSeasonKey() : (seasons[0] ?? currentSeasonKey());
  const metric: Metric = METRICS.includes(q.get("metric") as Metric) ? (q.get("metric") as Metric) : "vertical";
  const scope = q.get("scope") === "friends" && me ? "friends" : "public";
  const rows = await leaderboard(season, metric, scope === "friends" ? [me!.id, ...(await friendIds(me!.id))] : "public");
  const body: ApiLeaderboard = {
    season,
    seasons,
    metric,
    scope,
    rows: rows.map((r) => ({ rank: r.rank, user: apiUser(r.user), verticalM: r.verticalM, days: r.days, resorts: r.resorts, bestDayM: r.bestDayM, uphillM: r.uphillM })),
  };
  return NextResponse.json(body);
}
