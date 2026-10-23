import Link from "next/link";
import { LeaderboardList, METRIC_BLURB, METRIC_LABEL } from "@/components/LeaderboardList";
import { currentUser } from "@/lib/auth";
import { leaderboard, METRICS, seasonsWithData, type Metric } from "@/lib/days";
import { currentSeasonKey, seasonLabel } from "@/lib/season";

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ season?: string; metric?: string }> }) {
  const sp = await searchParams;
  const seasons = await seasonsWithData();
  const season = sp.season && seasons.includes(sp.season) ? sp.season : seasons.includes(currentSeasonKey()) ? currentSeasonKey() : (seasons[0] ?? currentSeasonKey());
  const metric: Metric = METRICS.includes(sp.metric as Metric) ? (sp.metric as Metric) : "vertical";
  const [rows, me] = await Promise.all([leaderboard(season, metric), currentUser()]);

  const href = (s: string, m: Metric) => `/leaderboard?season=${s}&metric=${m}`;

  return (
    <div className="pt-2">
      <h1 className="mb-1 font-display text-3xl font-bold">Leaderboard 🏆</h1>
      <p className="mb-5 text-ink-soft">Everyone, everywhere, resort and backcountry.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex max-w-full overflow-x-auto rounded-full bg-white p-1 ring-1 ring-line" role="tablist" aria-label="Ranking">
          {METRICS.map((m) => (
            <Link
              key={m}
              href={href(season, m)}
              role="tab"
              aria-selected={m === metric}
              className={`shrink-0 rounded-full px-4 py-1.5 font-display text-sm font-semibold whitespace-nowrap ${m === metric ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
            >
              {METRIC_LABEL[m]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {seasons.map((s) => (
            <Link
              key={s}
              href={href(s, metric)}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${s === season ? "bg-sky-soft text-sky-deep ring-1 ring-sky/40" : "text-ink-soft hover:bg-white"}`}
            >
              {seasonLabel(s)}
            </Link>
          ))}
        </div>
      </div>

      <p className="mb-2 text-sm font-semibold text-ink-soft">{METRIC_BLURB[metric]}</p>
      <LeaderboardList rows={rows} metric={metric} meId={me?.id} />
      <p className="mt-3 text-xs text-ink-soft">Seasons run July–June (southern-hemisphere winters count toward the upcoming season). Flagged days are excluded.</p>
    </div>
  );
}
