import type { User } from "@/generated/prisma/client";
import type { ProcessedDay } from "./analysis/process";
import { prisma } from "./db";
import type { Day } from "./dayRecord";
import { indexRuns } from "./runs";

export { type Day, dayDetail, WITH_TRACK } from "./dayRecord";

export type SaveOutcome = { status: "saved"; day: Day } | { status: "duplicate"; localDate: string };

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
  await indexRuns(day, d.track, d.stats.segments); // name its runs now so boards and stats are plain queries
  await refreshSeasonTotal(userId, day.seasonKey);
  return { status: "saved", day };
}

/** Deletes a day and takes it off the leaderboards. */
export async function deleteSkiDay(day: Pick<Day, "id" | "userId" | "seasonKey">) {
  await prisma.skiDay.delete({ where: { id: day.id } });
  await refreshSeasonTotal(day.userId, day.seasonKey);
}

/** Recomputes one skier's stored season totals from their (unflagged) days; call after any change. */
export async function refreshSeasonTotal(userId: string, seasonKey: string) {
  const days = await prisma.skiDay.findMany({ where: { userId, seasonKey, flagged: false }, select: DAY_LIKE });
  const key = { userId_seasonKey: { userId, seasonKey } };
  if (!days.length) return void (await prisma.seasonTotal.deleteMany({ where: { userId, seasonKey } }));
  const t = totals(days);
  await prisma.seasonTotal.upsert({ where: key, create: { userId, seasonKey, ...t }, update: t });
}

/** Rebuilds every stored season total (after changing how totals are counted, or for old data). */
export async function rebuildSeasonTotals() {
  const pairs = await prisma.skiDay.findMany({ distinct: ["userId", "seasonKey"], select: { userId: true, seasonKey: true } });
  await prisma.seasonTotal.deleteMany();
  for (const p of pairs) await refreshSeasonTotal(p.userId, p.seasonKey);
  return pairs.length;
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

type DayLike = Pick<Day, "verticalM" | "uphillM" | "localDate" | "resortId" | "kind" | "distanceM" | "skiTimeS">;
const DAY_LIKE = { verticalM: true, uphillM: true, localDate: true, resortId: true, kind: true, distanceM: true, skiTimeS: true } as const;

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
export function personalBests<D extends Day>(days: D[]): Record<BestKey, D | null> {
  const keys: BestKey[] = ["verticalM", "runCount", "maxSpeedMps", "longestRunM", "tallestRunM", "peakEleM", "uphillM"];
  const out = {} as Record<BestKey, D | null>;
  for (const k of keys) {
    out[k] = days.reduce<D | null>((best, d) => (d[k] > 0 && (!best || d[k] > best[k]) ? d : best), null);
  }
  return out;
}

/** Longest run of consecutive calendar days skied. */
export function longestStreak(days: Pick<Day, "localDate">[]): { length: number; from?: string; to?: string } {
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

/** The stored column each metric ranks by. */
const METRIC_COLUMN = { vertical: "verticalM", days: "days", resorts: "resorts", bestday: "bestDayM", uphill: "uphillM" } as const satisfies Record<Metric, keyof SeasonTotals>;

export interface LeaderboardRow extends SeasonTotals {
  rank: number;
  user: User;
}

export interface Leaderboard {
  /** the top `limit` skiers, best first */
  rows: LeaderboardRow[];
  /** everyone on this board with a non-zero value */
  total: number;
  /** `me`'s row, even when it's below the top `limit` (null if they're not on this board) */
  mine: LeaderboardRow | null;
}

/**
 * Season leaderboard from the stored season totals: a set of people (a friends board) or the public
 * board of everyone who opted in. Standard competition ranking: ties share a rank, then the next
 * rank skips (1, 1, 3). Equal values are listed by vertical.
 */
export async function leaderboard(seasonKey: string, metric: Metric, scope: string[] | "public", opts: { limit?: number; me?: string } = {}): Promise<Leaderboard> {
  const col = METRIC_COLUMN[metric];
  const where = { seasonKey, [col]: { gt: 0 }, ...(scope === "public" ? { user: { globalBoard: true } } : { userId: { in: scope } }) };
  const [top, total, own] = await Promise.all([
    prisma.seasonTotal.findMany({ where, include: { user: true }, orderBy: [{ [col]: "desc" }, { verticalM: "desc" }, { userId: "asc" }], take: opts.limit ?? 100 }),
    prisma.seasonTotal.count({ where }),
    opts.me ? prisma.seasonTotal.findFirst({ where: { ...where, userId: opts.me }, include: { user: true } }) : null,
  ]);
  const rankOf = async (value: number) => 1 + (await prisma.seasonTotal.count({ where: { ...where, [col]: { gt: value } } }));
  let rank = 0;
  const rows = top.map((r, i) => {
    if (i === 0 || top[i - 1][col] !== r[col]) rank = i + 1;
    return { ...rowOf(r), rank };
  });
  const listed = own && rows.find((r) => r.user.id === own.userId);
  const mine = own ? (listed ?? { ...rowOf(own), rank: await rankOf(own[col]) }) : null;
  return { rows, total, mine };
}

function rowOf({ user, verticalM, uphillM, days, resorts, backcountryDays, bestDayM, distanceM, skiTimeS }: SeasonTotals & { user: User }) {
  return { user, verticalM, uphillM, days, resorts, backcountryDays, bestDayM, distanceM, skiTimeS };
}

export async function seasonsWithData(): Promise<string[]> {
  const rows = await prisma.seasonTotal.findMany({ distinct: ["seasonKey"], select: { seasonKey: true }, orderBy: { seasonKey: "desc" } });
  return rows.map((r) => r.seasonKey);
}
