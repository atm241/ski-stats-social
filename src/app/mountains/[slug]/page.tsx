import { Armchair, Heart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { CompletionCard } from "@/components/Completion";
import { runCatalog } from "@/lib/completion";
import { DayCard } from "@/components/DayCard";
import { MountainViewer } from "@/components/MountainViewer";
import { Difficulty, SectionTitle } from "@/components/ui";
import { prisma } from "@/lib/db";
import { totals } from "@/lib/days";
import { feet, mph } from "@/lib/format";
import { listMountains, loadMountain } from "@/lib/mountain/registry";
import { currentSeasonKey, seasonLabel } from "@/lib/season";
import { currentUser } from "@/lib/auth";
import { friendIds } from "@/lib/social";
import { busiestTrails } from "@/lib/runs";
import { mountainCompletions, trailStats } from "@/lib/stats";
import { dayFilter } from "@/lib/privacy";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = (await listMountains()).find((x) => x.slug === slug);
  return { title: m?.name ?? "Not found" };
}

export default async function MountainPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug) || !(await listMountains()).some((m) => m.slug === slug)) notFound();
  const data = await loadMountain(slug);

  const FT = 3.28084;
  let lo = Infinity;
  let hi = -Infinity;
  for (const h of data.grid.heights) {
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  const vert = Math.round((hi - lo) * FT);

  // Who skis here: the most recent season with days at this mountain. The board shows people on
  // the public leaderboard plus you and your friends; the days list only days you may see.
  const me = await currentUser();
  const crew = me ? [me.id, ...(await friendIds(me.id))] : [];
  const resorts = data.resorts ?? [data.name];
  const days = await prisma.skiDay.findMany({ where: { resortName: { in: resorts }, flagged: false }, include: { user: true }, orderBy: [{ localDate: "desc" }, { startedAt: "desc" }] });
  const canSee = await dayFilter(me);
  const shownDays = days.filter(canSee);
  const season = days.some((d) => d.seasonKey === currentSeasonKey()) ? currentSeasonKey() : days[0]?.seasonKey;
  const seasonDays = days.filter((d) => d.seasonKey === season);
  const byUser = new Map<string, { user: (typeof days)[number]["user"]; days: typeof days }>();
  for (const d of seasonDays) if (d.user.globalBoard || crew.includes(d.userId)) byUser.set(d.userId, { user: d.user, days: [...(byUser.get(d.userId)?.days ?? []), d] });
  const board = [...byUser.values()].map((u) => ({ user: u.user, ...totals(u.days) })).sort((a, b) => b.verticalM - a.verticalM);
  const trails = season ? await trailStats({ mountain: slug, seasonKey: season }) : null;
  const boards = await busiestTrails(slug, 12);

  // "Ski every run": your progress here (all seasons), and your friends' for comparison
  const crewUsers = new Map(days.filter((d) => crew.includes(d.userId)).map((d) => [d.userId, d.user]));
  const progress = (
    await Promise.all(
      [...crewUsers].map(async ([id, user]) => {
        const c = (await mountainCompletions(id, slug))[0];
        return c ? { user, c } : null;
      }),
    )
  ).filter((x) => x !== null);
  const myProgress = progress.find((p) => p.user.id === me?.id)?.c;
  const friendsProgress = progress.filter((p) => p.user.id !== me?.id).sort((a, b) => b.c.skied - a.c.skied);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{data.name}</h1>
        <p className="num mt-1 text-sm text-ink-soft">
          {runCatalog(data).size} named runs · {data.lifts.filter((l) => l.name).length} lifts · ~{vert.toLocaleString()} ft of relief
          {resorts.length > 1 && ` · ${resorts.join(" + ")}`}
        </p>
      </div>
      <div className="space-y-2">
        <MountainViewer slug={slug} skiedRuns={myProgress?.skiedNames} />
        <p className="text-xs text-ink-faint">{data.attribution} Terrain height exaggerated 1.25× for the low-poly look.</p>
      </div>

      {myProgress && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section>
            <SectionTitle right="all seasons">Your runs here</SectionTitle>
            <CompletionCard c={myProgress} />
          </section>
          {friendsProgress.length > 0 && (
            <section className="lg:col-span-2">
              <SectionTitle>Friends&apos; progress</SectionTitle>
              <ol className="card divide-y divide-line overflow-hidden">
                {[{ user: me!, c: myProgress }, ...friendsProgress]
                  .sort((a, b) => b.c.skied - a.c.skied)
                  .map((p) => (
                    <li key={p.user.id}>
                      <Link href={`/u/${p.user.username}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-raised">
                        <Avatar user={p.user} size={26} />
                        <span className="min-w-0 flex-1 truncate">{p.user.id === me?.id ? "You" : p.user.displayName}</span>
                        <span className="h-1.5 w-32 overflow-hidden rounded-full bg-hover" aria-hidden>
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((p.c.skied / p.c.total) * 100)}%` }} />
                        </span>
                        <span className="num w-24 text-right">
                          {p.c.skied}
                          <span className="text-ink-faint"> / {p.c.total}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
              </ol>
            </section>
          )}
        </div>
      )}

      {season && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section>
            <SectionTitle right={seasonLabel(season)}>Top skiers here</SectionTitle>
            <ol className="card divide-y divide-line overflow-hidden">
              {board.slice(0, 8).map((r, i) => (
                <li key={r.user.id}>
                  <Link href={`/u/${r.user.username}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-raised">
                    <span className={`num w-5 text-right ${i < 3 ? "text-accent" : "text-ink-faint"}`}>{i + 1}</span>
                    <Avatar user={r.user} size={26} />
                    <span className="min-w-0 flex-1 truncate">{r.user.displayName}</span>
                    <span className="num text-xs text-ink-soft">{r.days}d</span>
                    <span className="num w-20 text-right font-medium">{feet(r.verticalM)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          {trails && trails.trails.length > 0 && (
            <section>
              <SectionTitle>Most skied trails</SectionTitle>
              <ol className="card space-y-2 p-4 text-sm">
                {trails.trails.slice(0, 8).map((t) => (
                  <li key={t.name} className="flex items-center gap-2">
                    <Difficulty level={t.difficulty} size={10} />
                    <span className="min-w-0 truncate">{t.name}</span>
                    <span className="num ml-auto text-ink-soft">×{t.runs}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {trails && trails.lifts.length > 0 && (
            <section>
              <SectionTitle>Busiest lifts</SectionTitle>
              <ol className="card space-y-2 p-4 text-sm">
                {trails.lifts.slice(0, 8).map((l) => (
                  <li key={l.name} className="flex items-center gap-2">
                    <Armchair size={12} className="shrink-0 text-lift" aria-hidden />
                    <span className="min-w-0 truncate">{l.name}</span>
                    <span className="num ml-auto text-ink-soft">×{l.rides}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      {boards.length > 0 && (
        <section>
          <SectionTitle right="fastest and most liked runs">Trail leaderboards</SectionTitle>
          <ul className="card grid divide-line overflow-hidden sm:grid-cols-2 sm:[&>li:nth-child(odd)]:border-r">
            {boards.map((b) => (
              <li key={b.trail} className="border-b border-line">
                <Link href={`/mountains/${slug}/runs/${encodeURIComponent(b.trail)}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-raised">
                  <Difficulty level={b.difficulty} size={10} />
                  <span className="min-w-0 flex-1 truncate">{b.trail}</span>
                  <span className="num text-xs text-ink-faint">{b.runs} runs</span>
                  <span className="num w-16 text-right text-xs text-ink-soft">{mph(b.topSpeedMps)} mph</span>
                  <span className="num flex w-10 items-center justify-end gap-1 text-xs text-[#f472b6]">{b.topLikes > 0 && <><Heart size={11} fill="currentColor" aria-hidden />{b.topLikes}</>}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shownDays.length > 0 && (
        <section>
          <SectionTitle right={`${shownDays.length} total`}>Recent days here</SectionTitle>
          <div className="card divide-y divide-line overflow-hidden">
            {shownDays.slice(0, 8).map((d) => (
              <DayCard key={d.id} day={d} user={d.user} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
