import Link from "next/link";
import { MountainHero } from "@/components/Art";
import { DayCard } from "@/components/DayCard";
import { LeaderboardList } from "@/components/LeaderboardList";
import { MilestoneBar } from "@/components/MilestoneBar";
import { StatTile } from "@/components/StatTile";
import { currentUser } from "@/lib/auth";
import { APP_NAME, TAGLINE } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { leaderboard, seasonsWithData, totals } from "@/lib/days";
import { feet } from "@/lib/format";
import { currentSeasonKey, seasonLabel } from "@/lib/season";

export default async function Home() {
  const [me, seasons] = await Promise.all([currentUser(), seasonsWithData()]);
  const season = seasons.includes(currentSeasonKey()) ? currentSeasonKey() : (seasons[0] ?? currentSeasonKey());
  const [board, recent, myDays] = await Promise.all([
    leaderboard(season, "vertical"),
    prisma.skiDay.findMany({ orderBy: [{ createdAt: "desc" }, { startedAt: "desc" }], take: 6, include: { user: true } }),
    me ? prisma.skiDay.findMany({ where: { userId: me.id, seasonKey: season, flagged: false } }) : Promise.resolve([]),
  ]);
  const t = totals(myDays);
  const myRank = me ? board.find((r) => r.user.id === me.id)?.rank : undefined;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-4xl bg-linear-to-b from-[#bfe0ff] to-[#e8f3ff] px-6 pt-8 pb-36 sm:px-10 sm:pb-44">
        <MountainHero className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full sm:h-52" />
        <div className="relative max-w-lg">
          {me ? (
            <>
              <p className="font-semibold text-sky-deep">
                {seasonLabel(season)} season {myRank ? `· #${myRank} worldwide` : ""}
              </p>
              <h1 className="font-display text-4xl font-bold sm:text-5xl">Hey {me.displayName} {me.avatar}</h1>
              <p className="mt-2 text-lg text-ink-soft">{t.days ? `${feet(t.verticalM)} ft of vertical across ${t.days} days. Keep sending.` : "Upload your first day to get on the board."}</p>
              <Link href="/upload" className="btn-primary mt-5">
                Upload a day
              </Link>
            </>
          ) : (
            <>
              <h1 className="font-display text-4xl font-bold sm:text-5xl">{APP_NAME}</h1>
              <p className="mt-2 text-lg text-ink-soft">{TAGLINE} Upload from Slopes, Garmin, Strava or your watch.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link href="/login" className="btn-primary">
                  Make your skier
                </Link>
                <Link href="/leaderboard" className="btn-ghost">
                  See the leaderboard
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {me && (
        <section className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon="⛰️" label="Vertical" value={feet(t.verticalM)} unit="ft" tone="sky" />
            <StatTile icon="📅" label="Days" value={String(t.days)} tone="berry" />
            <StatTile icon="🗺️" label="Resorts" value={String(t.resorts)} tone="lilac" />
            <StatTile icon="🥾" label="Skinned up" value={feet(t.uphillM)} unit="ft" tone="sun" />
          </div>
          <MilestoneBar verticalM={t.verticalM} />
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-xl font-semibold">Top vert · {seasonLabel(season)}</h2>
            <Link href="/leaderboard" className="text-sm font-bold text-sky-deep hover:underline">
              Full board →
            </Link>
          </div>
          <LeaderboardList rows={board} metric="vertical" meId={me?.id} limit={5} />
        </section>
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold">Fresh tracks</h2>
          <div className="space-y-2">
            {recent.map((d) => (
              <DayCard key={d.id} day={d} user={d.user} />
            ))}
            {recent.length === 0 && <p className="card p-6 text-center text-ink-soft">Nothing yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
