import { ArrowDownRight, ArrowRight, Box, CalendarDays, Gauge, MapPin, Trophy } from "lucide-react";
import Link from "next/link";
import { DayCard } from "@/components/DayCard";
import { LeaderboardList } from "@/components/LeaderboardList";
import { MilestoneBar } from "@/components/MilestoneBar";
import { SectionTitle, Stat } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { APP_NAME, TAGLINE } from "@/lib/brand";
import { prisma } from "@/lib/db";
import { leaderboard, seasonsWithData, totals } from "@/lib/days";
import { feet, mph } from "@/lib/format";
import { listMountains } from "@/lib/mountain/registry";
import { currentSeasonKey, seasonLabel } from "@/lib/season";
import { followingIds } from "@/lib/social";

export default async function Home() {
  const [me, seasons, mountains] = await Promise.all([currentUser(), seasonsWithData(), listMountains()]);
  const season = seasons.includes(currentSeasonKey()) ? currentSeasonKey() : (seasons[0] ?? currentSeasonKey());
  const friends = me ? await followingIds(me.id) : [];
  const feedUsers = me && friends.length ? [me.id, ...friends] : null;
  const [board, feed, myDays] = await Promise.all([
    leaderboard(season, "vertical", "public"),
    prisma.skiDay.findMany({
      where: feedUsers ? { userId: { in: feedUsers } } : undefined,
      orderBy: [{ localDate: "desc" }, { startedAt: "desc" }],
      take: 12,
      include: { user: true },
    }),
    me ? prisma.skiDay.findMany({ where: { userId: me.id, seasonKey: season, flagged: false } }) : Promise.resolve([]),
  ]);
  const t = totals(myDays);
  const myRank = me ? board.find((r) => r.user.id === me.id)?.rank : undefined;
  const top = Math.max(0, ...myDays.map((d) => d.maxSpeedMps));

  return (
    <div className="space-y-10">
      {me ? (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <div className="label">{seasonLabel(season)} season</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Welcome back, {me.displayName.split(" ")[0]}</h1>
            </div>
            <div className="flex gap-2">
              <Link href={`/u/${me.username}`} className="btn-ghost">
                Season stats
              </Link>
              <Link href="/upload" className="btn-primary">
                Upload a day
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 p-5 sm:grid-cols-5">
            <div className="col-span-2">
              <Stat label="Vertical" value={feet(t.verticalM)} unit="ft" icon={ArrowDownRight} accent="var(--color-vert)" size="lg" />
            </div>
            <Stat label="Days" value={String(t.days)} icon={CalendarDays} />
            <Stat label="Top speed" value={mph(top)} unit="mph" icon={Gauge} accent="var(--color-speed)" />
            <Stat label="World rank" value={myRank ? `#${myRank}` : "–"} icon={Trophy} sub={myRank ? `of ${board.length}` : "Upload to rank"} />
          </div>
          <div className="border-t border-line px-5 py-4">
            <MilestoneBar verticalM={t.verticalM} />
          </div>
        </section>
      ) : (
        <section className="relative overflow-hidden rounded-2xl border border-line bg-surface px-6 py-14 sm:px-12">
          <div className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative max-w-xl">
            <div className="label text-accent">Every turn, counted</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{APP_NAME}</h1>
            <p className="mt-4 text-lg text-ink-soft">{TAGLINE} Import from Slopes, Garmin, Strava or any GPX file and get run-by-run stats, named trails and a 3D replay of your day.</p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Link href="/login" className="btn-primary">
                Get started <ArrowRight size={15} aria-hidden />
              </Link>
              <Link href="/leaderboard" className="btn-ghost">
                Leaderboard
              </Link>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <SectionTitle right={feedUsers ? "You and people you follow" : "Everyone"}>Recent days</SectionTitle>
          <div className="card divide-y divide-line overflow-hidden">
            {feed.map((d) => (
              <DayCard key={d.id} day={d} user={d.user} />
            ))}
            {feed.length === 0 && <p className="p-6 text-center text-sm text-ink-soft">Nothing yet.</p>}
          </div>
          {me && !friends.length && <p className="mt-3 text-xs text-ink-faint">Follow skiers from their profile to make this your friends feed.</p>}
        </section>

        <aside className="space-y-8">
          <section>
            <SectionTitle
              right={
                <Link href="/leaderboard" className="hover:text-ink">
                  All →
                </Link>
              }
            >
              Top vertical · {seasonLabel(season)}
            </SectionTitle>
            <LeaderboardList rows={board} metric="vertical" meId={me?.id} limit={5} compact />
          </section>

          {mountains.length > 0 && (
            <section>
              <SectionTitle>3D mountains</SectionTitle>
              <ul className="card divide-y divide-line overflow-hidden">
                {mountains.map((m) => (
                  <li key={m.slug}>
                    <Link href={`/mountains/${m.slug}`} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-raised">
                      <Box size={15} className="shrink-0 text-accent" aria-hidden />
                      <span className="flex-1">{m.name}</span>
                      <MapPin size={13} className="text-ink-faint" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
