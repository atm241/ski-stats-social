import type { SkiDay, User } from "@prisma/client";
import type { ProcessedDay, StoredTrack } from "./analysis/process";
import type { Segment } from "./analysis/types";
import { prisma } from "./db";

export type SaveOutcome = { status: "saved"; day: SkiDay } | { status: "duplicate"; localDate: string };

export async function saveDay(userId: string, d: ProcessedDay, source: string, fileName?: string): Promise<SaveOutcome> {
  const startedAt = new Date(d.stats.startedAt);
  const endedAt = new Date(d.stats.endedAt);

  // Same day uploaded twice (or from two apps) would double-count vertical.
  const overlap = await prisma.skiDay.findFirst({ where: { userId, startedAt: { lt: endedAt }, endedAt: { gt: startedAt } } });
  if (overlap) return { status: "duplicate", localDate: d.localDate };

  const day = await prisma.skiDay.create({
    data: {
      userId,
      localDate: d.localDate,
      seasonKey: d.seasonKey,
      timezone: d.timezone,
      startedAt,
      endedAt,
      kind: d.stats.kind,
      resortId: d.resort?.id,
      resortName: d.resort?.name,
      resortCountry: d.resort?.country,
      verticalM: d.stats.verticalM,
      uphillM: d.stats.uphillM,
      distanceM: d.stats.distanceM,
      maxSpeedMps: d.stats.maxSpeedMps,
      runCount: d.stats.runCount,
      liftCount: d.stats.liftCount,
      skiTimeS: d.stats.skiTimeS,
      liftTimeS: d.stats.liftTimeS,
      liftWaitS: d.stats.liftWaitS,
      skinTimeS: d.stats.skinTimeS,
      driveTimeS: d.stats.driveTimeS,
      longestRunM: d.stats.longestRunM,
      tallestRunM: d.stats.tallestRunM,
      peakEleM: d.stats.peakEleM,
      flagged: d.stats.flags.length > 0,
      flagReasons: d.stats.flags.length ? JSON.stringify(d.stats.flags) : null,
      source,
      fileName,
      track: JSON.stringify(d.track),
      segments: JSON.stringify(d.stats.segments),
    },
  });
  return { status: "saved", day };
}

export function dayDetail(day: SkiDay) {
  return {
    track: JSON.parse(day.track) as StoredTrack,
    segments: JSON.parse(day.segments) as Segment[],
    flagReasons: day.flagReasons ? (JSON.parse(day.flagReasons) as string[]) : [],
  };
}

export interface SeasonTotals {
  verticalM: number;
  uphillM: number;
  days: number;
  resorts: number;
  backcountryDays: number;
  /** most vertical on a single calendar date */
  bestDayM: number;
  distanceM: number;
  skiTimeS: number;
}

type DayLike = Pick<SkiDay, "verticalM" | "uphillM" | "localDate" | "resortId" | "kind" | "distanceM" | "skiTimeS">;

/** Days are counted by distinct calendar date; resorts only count lift-served days. */
export function totals(days: DayLike[]): SeasonTotals {
  const byDate = new Map<string, number>();
  for (const d of days) byDate.set(d.localDate, (byDate.get(d.localDate) ?? 0) + d.verticalM);
  return {
    verticalM: days.reduce((s, d) => s + d.verticalM, 0),
    uphillM: days.reduce((s, d) => s + d.uphillM, 0),
    days: byDate.size,
    resorts: new Set(days.filter((d) => d.resortId && d.kind !== "backcountry").map((d) => d.resortId)).size,
    backcountryDays: new Set(days.filter((d) => d.kind !== "resort").map((d) => d.localDate)).size,
    bestDayM: Math.max(0, ...byDate.values()),
    distanceM: days.reduce((s, d) => s + d.distanceM, 0),
    skiTimeS: days.reduce((s, d) => s + d.skiTimeS, 0),
  };
}

export type BestKey = "verticalM" | "runCount" | "maxSpeedMps" | "longestRunM" | "tallestRunM" | "peakEleM" | "uphillM";

/** The day holding each personal record (null if no day has a non-zero value). */
export function personalBests(days: SkiDay[]): Record<BestKey, SkiDay | null> {
  const keys: BestKey[] = ["verticalM", "runCount", "maxSpeedMps", "longestRunM", "tallestRunM", "peakEleM", "uphillM"];
  const out = {} as Record<BestKey, SkiDay | null>;
  for (const k of keys) {
    out[k] = days.reduce<SkiDay | null>((best, d) => (d[k] > 0 && (!best || d[k] > best[k]) ? d : best), null);
  }
  return out;
}

/** Longest run of consecutive calendar days skied. */
export function longestStreak(days: Pick<SkiDay, "localDate">[]): { length: number; from?: string; to?: string } {
  const dates = [...new Set(days.map((d) => d.localDate))].sort();
  let best = { length: 0, from: undefined as string | undefined, to: undefined as string | undefined };
  let start = 0;
  for (let i = 0; i < dates.length; i++) {
    const gapDays = i > 0 ? (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86_400_000 : 1;
    if (i > 0 && gapDays !== 1) start = i;
    if (i - start + 1 > best.length) best = { length: i - start + 1, from: dates[start], to: dates[i] };
  }
  return best;
}

export type Metric = "vertical" | "days" | "resorts" | "bestday" | "uphill";
export const METRICS: Metric[] = ["vertical", "days", "resorts", "bestday", "uphill"];

const METRIC_VALUE: Record<Metric, (t: SeasonTotals) => number> = {
  vertical: (t) => t.verticalM,
  days: (t) => t.days,
  resorts: (t) => t.resorts,
  bestday: (t) => t.bestDayM,
  uphill: (t) => t.uphillM,
};

export interface LeaderboardRow extends SeasonTotals {
  rank: number;
  user: User;
}

/**
 * Season leaderboard. Aggregates in memory, which is fine for a small user base;
 * at scale, move this to a SQL GROUP BY or a materialized per-user season table.
 */
export async function leaderboard(seasonKey: string, metric: Metric): Promise<LeaderboardRow[]> {
  const days = await prisma.skiDay.findMany({
    where: { seasonKey, flagged: false },
    select: { userId: true, verticalM: true, uphillM: true, localDate: true, resortId: true, kind: true, distanceM: true, skiTimeS: true, user: true },
  });

  const byUser = new Map<string, { user: User; days: DayLike[] }>();
  for (const d of days) {
    const entry = byUser.get(d.userId) ?? { user: d.user, days: [] };
    entry.days.push(d);
    byUser.set(d.userId, entry);
  }

  const value = METRIC_VALUE[metric];
  const rows = [...byUser.values()]
    .map(({ user, days }) => ({ user, ...totals(days) }))
    .filter((r) => value(r) > 0)
    .sort((a, b) => value(b) - value(a) || b.verticalM - a.verticalM);

  // Standard competition ranking: ties share a rank.
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || value(rows[i - 1]) !== value(r)) rank = i + 1;
    return { ...r, rank };
  });
}

export async function seasonsWithData(): Promise<string[]> {
  const rows = await prisma.skiDay.findMany({ distinct: ["seasonKey"], select: { seasonKey: true }, orderBy: { seasonKey: "desc" } });
  return rows.map((r) => r.seasonKey);
}
