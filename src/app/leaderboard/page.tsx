import Link from "next/link";
import { LeaderboardList, METRIC_BLURB, METRIC_LABEL } from "@/components/LeaderboardList";
import { currentUser } from "@/lib/auth";
import { leaderboard, METRICS, seasonsWithData, type Metric } from "@/lib/days";
import { currentSeasonKey, seasonLabel } from "@/lib/season";
import { friendIds } from "@/lib/social";

export const metadata = { title: "Leaderboard" };

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ season?: string; metric?: string; scope?: string }> }) {
  const sp = await searchParams;
  const [seasons, me] = await Promise.all([seasonsWithData(), currentUser()]);
  const season = sp.season && seasons.includes(sp.season) ? sp.season : seasons.includes(currentSeasonKey()) ? currentSeasonKey() : (seasons[0] ?? currentSeasonKey());
  const metric: Metric = METRICS.includes(sp.metric as Metric) ? (sp.metric as Metric) : "vertical";
  const friends = me && sp.scope === "friends" ? [me.id, ...(await friendIds(me.id))] : undefined; // mutual follows
  const { rows, mine, total } = await leaderboard(season, metric, friends ?? "public", { me: me?.id });

  const href = (o: { s?: string; m?: Metric; scope?: string }) => `/leaderboard?season=${o.s ?? season}&metric=${o.m ?? metric}${(o.scope ?? sp.scope) === "friends" ? "&scope=friends" : ""}`;
  const tab = (active: boolean) => `shrink-0 rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${active ? "bg-hover text-ink" : "text-ink-soft hover:text-ink"}`;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-sm text-ink-soft">{METRIC_BLURB[metric]}</p>

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <div className="flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Ranking">
          {METRICS.map((m) => (
            <Link key={m} href={href({ m })} role="tab" aria-selected={m === metric} className={tab(m === metric)}>
              {METRIC_LABEL[m]}
            </Link>
          ))}
        </div>
        {me && (
          <div className="flex rounded-lg border border-line bg-surface p-0.5">
            <Link href={href({ scope: "all" })} className={tab(sp.scope !== "friends")}>
              Public
            </Link>
            <Link href={href({ scope: "friends" })} className={tab(sp.scope === "friends")}>
              Friends
            </Link>
          </div>
        )}
        <div className="ml-auto flex gap-1">
          {seasons.map((s) => (
            <Link key={s} href={href({ s })} className={tab(s === season)}>
              {seasonLabel(s)}
            </Link>
          ))}
        </div>
      </div>

      {me && !friends && !me.globalBoard && (
        <p className="card mb-4 px-4 py-3 text-sm text-ink-soft">
          You&apos;re not on the public board. Your friends see your stats either way;{" "}
          <Link href="/settings#leaderboards" className="text-accent hover:text-accent-strong">
            join it in Settings
          </Link>{" "}
          if you want to rank against everyone.
        </p>
      )}
      <LeaderboardList rows={rows} mine={mine} metric={metric} />
      {total > rows.length && <p className="mt-3 text-xs text-ink-faint">Top {rows.length} of {total.toLocaleString()}.</p>}
      {friends && friends.length === 1 && <p className="mt-3 text-sm text-ink-soft">Your friends board shows people you follow who follow you back.</p>}
      <p className="mt-4 text-xs text-ink-faint">Seasons run July–June (southern-hemisphere winters count toward the upcoming season). Flagged days are excluded.</p>
    </div>
  );
}
