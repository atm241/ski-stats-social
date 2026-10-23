import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { DayCard } from "@/components/DayCard";
import { MilestoneBar } from "@/components/MilestoneBar";
import { PersonalBests } from "@/components/PersonalBests";
import { StatTile } from "@/components/StatTile";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { totals } from "@/lib/days";
import { duration, feet, miles } from "@/lib/format";
import { currentSeasonKey, seasonLabel } from "@/lib/season";

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ season?: string }> }) {
  const { username } = await params;
  const sp = await searchParams;
  const [user, me] = await Promise.all([
    prisma.user.findUnique({ where: { username }, include: { days: { orderBy: { localDate: "desc" } } } }),
    currentUser(),
  ]);
  if (!user) notFound();

  const seasons = [...new Set(user.days.map((d) => d.seasonKey))];
  const season = sp.season && seasons.includes(sp.season) ? sp.season : (seasons[0] ?? currentSeasonKey());
  const days = user.days.filter((d) => d.seasonKey === season);
  const counted = days.filter((d) => !d.flagged);
  const t = totals(counted);
  const allTime = totals(user.days.filter((d) => !d.flagged));

  const resorts = new Map<string, { name: string; days: number }>();
  for (const d of counted) {
    if (!d.resortId || d.kind === "backcountry") continue;
    const r = resorts.get(d.resortId) ?? { name: d.resortName!, days: 0 };
    r.days++;
    resorts.set(d.resortId, r);
  }

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar user={user} size={80} />
        <div className="flex-1">
          <h1 className="font-display text-3xl font-bold">{user.displayName}</h1>
          <p className="text-ink-soft">
            @{user.username} · {feet(allTime.verticalM)} ft all-time · {allTime.days} days
          </p>
        </div>
        {me?.id === user.id && (
          <div className="flex gap-2">
            <Link href="/upload" className="btn-primary">
              Upload days
            </Link>
            <Link href="/settings" className="btn-ghost">
              Settings
            </Link>
          </div>
        )}
      </div>

      {seasons.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {seasons.map((s) => (
            <Link
              key={s}
              href={`/u/${user.username}?season=${s}`}
              className={`rounded-full px-3 py-1.5 text-sm font-bold ${s === season ? "bg-sky-soft text-sky-deep ring-1 ring-sky/40" : "text-ink-soft hover:bg-white"}`}
            >
              {seasonLabel(s)}
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon="⛰️" label="Vertical" value={feet(t.verticalM)} unit="ft" tone="sky" />
        <StatTile icon="📅" label="Days" value={String(t.days)} tone="berry" />
        <StatTile icon="🗺️" label="Resorts" value={String(t.resorts)} tone="lilac" />
        <StatTile icon="🥾" label="Uphill" value={feet(t.uphillM)} unit="ft" tone="sun" />
      </div>

      <MilestoneBar verticalM={t.verticalM} />

      <p className="-mt-3 px-1 text-sm text-ink-soft">
        {miles(t.distanceM)} mi skied · {duration(t.skiTimeS * 1000)} of actual skiing
        {t.days > 0 && ` · ${feet(t.verticalM / t.days)} ft per day on average`}
      </p>

      <PersonalBests days={counted} />

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <section className="space-y-2">
          <h2 className="font-display text-xl font-semibold">{seasonLabel(season)} days</h2>
          {days.length === 0 && <p className="card p-6 text-center text-ink-soft">No days yet this season.</p>}
          {days.map((d) => (
            <DayCard key={d.id} day={d} />
          ))}
        </section>
        <aside className="space-y-2">
          <h2 className="font-display text-xl font-semibold">Resorts visited</h2>
          <ul className="card divide-y divide-line">
            {[...resorts.values()]
              .sort((a, b) => b.days - a.days)
              .map((r) => (
                <li key={r.name} className="flex justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="truncate font-semibold">{r.name}</span>
                  <span className="shrink-0 text-ink-soft">{r.days}d</span>
                </li>
              ))}
            {resorts.size === 0 && <li className="px-4 py-3 text-sm text-ink-soft">None yet.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
