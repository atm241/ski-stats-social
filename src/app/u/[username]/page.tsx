import { ArrowDownRight, CalendarDays, Gauge, Hash, MapPin, Route, Timer, TrendingUp, Armchair } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { DayCard } from "@/components/DayCard";
import { FollowButton } from "@/components/FollowButton";
import { MilestoneBar } from "@/components/MilestoneBar";
import { PersonalBests } from "@/components/PersonalBests";
import { SeasonChart } from "@/components/SeasonChart";
import { Difficulty, DIFFICULTY_COLOR, DIFFICULTY_NAME, DIFFICULTY_ORDER, SectionTitle, Stat } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { totals } from "@/lib/days";
import { duration, feet, miles, mph } from "@/lib/format";
import { currentSeasonKey, seasonLabel } from "@/lib/season";
import { followCounts, isFollowing } from "@/lib/social";
import { trailStats } from "@/lib/stats";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ season?: string }> }) {
  const { username } = await params;
  const sp = await searchParams;
  const [user, me] = await Promise.all([prisma.user.findUnique({ where: { username }, include: { days: { orderBy: { localDate: "desc" } } } }), currentUser()]);
  if (!user) notFound();

  const seasons = [...new Set(user.days.map((d) => d.seasonKey))];
  const season = sp.season && seasons.includes(sp.season) ? sp.season : (seasons[0] ?? currentSeasonKey());
  const days = user.days.filter((d) => d.seasonKey === season);
  const counted = days.filter((d) => !d.flagged);
  const t = totals(counted);
  const allTime = totals(user.days.filter((d) => !d.flagged));
  const runs = counted.reduce((a, d) => a + d.runCount, 0);
  const lifts = counted.reduce((a, d) => a + d.liftCount, 0);
  const liftWait = counted.reduce((a, d) => a + d.liftWaitS, 0);
  const topSpeed = Math.max(0, ...counted.map((d) => d.maxSpeedMps));
  const [counts, following, trails] = await Promise.all([followCounts(user.id), me && me.id !== user.id ? isFollowing(me.id, user.id) : false, trailStats(counted)]);

  const resorts = new Map<string, { name: string; days: number; verticalM: number }>();
  for (const d of counted) {
    if (!d.resortId || d.kind === "backcountry") continue;
    const r = resorts.get(d.resortId) ?? { name: d.resortName!, days: 0, verticalM: 0 };
    r.days++;
    r.verticalM += d.verticalM;
    resorts.set(d.resortId, r);
  }
  const diffTotal = Object.values(trails.byDifficulty).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar user={user} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">{user.displayName}</h1>
          <p className="num mt-1 text-sm text-ink-soft">
            @{user.username} · {feet(allTime.verticalM)} ft lifetime · {allTime.days} days · {counts.followers} followers · {counts.following} following
          </p>
        </div>
        {me && me.id !== user.id && <FollowButton username={user.username} following={following} />}
        {me?.id === user.id && (
          <Link href="/upload" className="btn-primary">
            Upload days
          </Link>
        )}
      </header>

      {seasons.length > 1 && (
        <nav className="flex gap-1 border-b border-line">
          {seasons.map((s) => (
            <Link key={s} href={`/u/${user.username}?season=${s}`} className={`-mb-px border-b-2 px-3 py-2 text-sm ${s === season ? "border-accent text-ink" : "border-transparent text-ink-soft hover:text-ink"}`}>
              {seasonLabel(s)}
            </Link>
          ))}
        </nav>
      )}

      <section className="card p-5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 lg:grid-cols-8">
          <div className="col-span-2">
            <Stat label={`${seasonLabel(season)} vertical`} value={feet(t.verticalM)} unit="ft" icon={ArrowDownRight} accent="var(--color-vert)" size="lg" />
          </div>
          <Stat label="Days" value={String(t.days)} icon={CalendarDays} />
          <Stat label="Runs" value={String(runs)} icon={Hash} />
          <Stat label="Top speed" value={mph(topSpeed)} unit="mph" icon={Gauge} accent="var(--color-speed)" />
          <Stat label="Distance" value={miles(t.distanceM)} unit="mi" icon={Route} />
          <Stat label="Ski time" value={duration(t.skiTimeS * 1000)} icon={Timer} />
          {t.uphillM > 0 ? <Stat label="Uphill" value={feet(t.uphillM)} unit="ft" icon={TrendingUp} accent="var(--color-uphill)" /> : <Stat label="Resorts" value={String(t.resorts)} icon={MapPin} />}
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <MilestoneBar verticalM={t.verticalM} />
        </div>
      </section>

      {counted.length > 0 && (
        <section className="card p-5">
          <SectionTitle right={t.days > 0 ? <span className="num">{feet(t.verticalM / t.days)} ft / day avg</span> : undefined}>Vertical by day</SectionTitle>
          <SeasonChart days={days} />
        </section>
      )}

      {counted.length > 0 && (
        <section>
          <SectionTitle>Personal bests</SectionTitle>
          <PersonalBests days={counted} />
        </section>
      )}

      {trails.mappedDays > 0 && (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="card p-5">
            <SectionTitle>Terrain mix</SectionTitle>
            <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {DIFFICULTY_ORDER.filter((d) => trails.byDifficulty[d]).map((d) => (
                <div key={d} style={{ flexGrow: trails.byDifficulty[d], background: DIFFICULTY_COLOR[d] }} />
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {DIFFICULTY_ORDER.filter((d) => trails.byDifficulty[d]).map((d) => (
                <li key={d} className="flex items-center gap-2">
                  <Difficulty level={d} size={10} />
                  <span className="text-ink-soft">{DIFFICULTY_NAME[d]}</span>
                  <span className="num ml-auto">{feet(trails.byDifficulty[d])} ft</span>
                  <span className="num w-10 text-right text-xs text-ink-faint">{Math.round((trails.byDifficulty[d] / diffTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-ink-faint">By vertical, from {trails.mappedDays} day{trails.mappedDays === 1 ? "" : "s"} at resorts with trail maps.</p>
          </div>
          <div className="card p-5">
            <SectionTitle>Most skied trails</SectionTitle>
            <ol className="space-y-2 text-sm">
              {trails.trails.slice(0, 8).map((r) => (
                <li key={r.resort + r.name} className="flex items-center gap-2">
                  <Difficulty level={r.difficulty} size={10} />
                  <span className="min-w-0 truncate">{r.name}</span>
                  <span className="num ml-auto shrink-0 text-ink-soft">×{r.runs}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card p-5">
            <SectionTitle right={<span className="num">{lifts} rides · {duration(liftWait * 1000)} in line</span>}>Lifts</SectionTitle>
            <ol className="space-y-2 text-sm">
              {trails.lifts.slice(0, 8).map((l) => (
                <li key={l.resort + l.name} className="flex items-center gap-2">
                  <Armchair size={12} className="shrink-0 text-lift" aria-hidden />
                  <span className="min-w-0 truncate">{l.name}</span>
                  <span className="num ml-auto shrink-0 text-ink-soft">×{l.rides}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section>
          <SectionTitle right={`${days.length} days`}>{seasonLabel(season)} days</SectionTitle>
          <div className="card divide-y divide-line overflow-hidden">
            {days.length === 0 && <p className="p-6 text-center text-sm text-ink-soft">No days yet this season.</p>}
            {days.map((d) => (
              <DayCard key={d.id} day={d} />
            ))}
          </div>
        </section>
        <aside>
          <SectionTitle>Resorts</SectionTitle>
          <ul className="card divide-y divide-line overflow-hidden text-sm">
            {[...resorts.values()]
              .sort((a, b) => b.days - a.days)
              .map((r) => (
                <li key={r.name} className="flex items-center gap-3 px-4 py-3">
                  <MapPin size={14} className="shrink-0 text-ink-faint" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="num shrink-0 text-xs text-ink-soft">
                    {r.days}d · {Math.round((r.verticalM * 3.28084) / 1000)}k ft
                  </span>
                </li>
              ))}
            {resorts.size === 0 && <li className="px-4 py-3 text-ink-soft">None yet.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
