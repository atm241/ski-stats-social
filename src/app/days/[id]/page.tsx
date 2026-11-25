import { ArrowDownRight, Gauge, Mountain, Play, Route, Timer, TrendingUp, Armchair, Hash } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteCommentAction, deleteDay } from "@/app/actions";
import { Avatar } from "@/components/Avatar";
import { DayBreakdown } from "@/components/DayBreakdown";
import { DayExplorer, type RunSocial } from "@/components/DayExplorer";
import { Difficulty, DIFFICULTY_COLOR, DIFFICULTY_NAME, DIFFICULTY_ORDER, normDifficulty, SectionTitle, Stat } from "@/components/ui";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clockTime, duration, feet, miles, mph, prettyDate } from "@/lib/format";
import { loadDay } from "@/lib/views";
import { CommentForm } from "./CommentForm";

const KIND_LABEL: Record<string, string> = { resort: "Resort", backcountry: "Backcountry", mixed: "Resort + uphill" };

/** "Dana · Alta Ski Area, Feb 15" */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const day = await prisma.skiDay.findUnique({ where: { id }, select: { resortName: true, localDate: true, user: { select: { displayName: true } } } });
  if (!day) return { title: "Not found" };
  return { title: `${day.user.displayName} · ${day.resortName ?? "Backcountry"}, ${prettyDate(day.localDate, { month: "short", day: "numeric" })}` };
}

export default async function DayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadDay(id, await currentUser());
  if (!view) notFound();
  const { day, track, segments, flagReasons, slug, labels, companions, comments, isMine, canComment } = view;
  const runSocial: RunSocial = Object.fromEntries(
    [...view.runs].map(([i, r]) => [i, { id: r.id, likes: r.likes, liked: r.liked, canLike: r.canLike, board: `/mountains/${r.mountain}/runs/${encodeURIComponent(r.trail)}` }]),
  );

  const runs = segments.flatMap((s, i) => (s.kind === "run" ? [{ s, l: labels[i] }] : []));
  const avgRunSpeed = day.skiTimeS > 0 ? day.distanceM / day.skiTimeS : 0;
  // difficulty mix by vertical, and most-skied trails / lifts
  const byDiff = new Map<string, number>();
  const trailCount = new Map<string, { n: number; difficulty: string | null }>();
  for (const { s, l } of runs) {
    const d = normDifficulty(l?.difficulty);
    if (d) byDiff.set(d, (byDiff.get(d) ?? 0) + s.verticalM);
    if (l) for (const n of l.names) trailCount.set(n, { n: (trailCount.get(n)?.n ?? 0) + 1, difficulty: n === l.name ? l.difficulty : (trailCount.get(n)?.difficulty ?? null) });
  }
  const liftCount = new Map<string, number>();
  segments.forEach((s, i) => s.kind === "lift" && labels[i] && liftCount.set(labels[i]!.name, (liftCount.get(labels[i]!.name) ?? 0) + 1));
  const diffTotal = [...byDiff.values()].reduce((a, b) => a + b, 0);
  const topTrails = [...trailCount.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  const topLifts = [...liftCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/u/${day.user.username}`} className="flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
            <Avatar user={day.user} size={22} />
            {day.user.displayName} · {prettyDate(day.localDate)}
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{day.resortName ?? (day.uphillM > 0 ? "Backcountry tour" : "Backcountry laps")}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="chip">{KIND_LABEL[day.kind] ?? "Resort"}</span>
            {day.resortCountry && <span className="chip">{day.resortCountry}</span>}
            <span className="chip num">
              {clockTime(day.startedAt, day.timezone)} – {clockTime(day.endedAt, day.timezone)}
            </span>
          </div>
        </div>
        {slug && (
          <Link href={`/days/${day.id}/replay`} className="btn-primary">
            <Play size={15} fill="currentColor" aria-hidden /> 3D replay
          </Link>
        )}
      </header>

      {day.flagged && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 p-4 text-sm text-warn">
          <strong className="font-semibold">Not on the leaderboard yet.</strong> <span className="text-ink-soft">{flagReasons.join(" ")}</span>
        </div>
      )}

      <section className="card grid grid-cols-2 gap-x-6 gap-y-6 p-5 sm:grid-cols-4 lg:grid-cols-8">
        <div className="col-span-2">
          <Stat label="Vertical" value={feet(day.verticalM)} unit="ft" icon={ArrowDownRight} accent="var(--color-vert)" size="lg" />
        </div>
        <Stat label="Runs" value={String(day.runCount)} icon={Hash} />
        <Stat label="Top speed" value={mph(day.maxSpeedMps)} unit="mph" icon={Gauge} accent="var(--color-speed)" />
        <Stat label="Distance" value={miles(day.distanceM)} unit="mi" icon={Route} />
        <Stat label="Ski time" value={duration(day.skiTimeS * 1000)} icon={Timer} />
        {day.uphillM > 0 ? (
          <Stat label="Uphill" value={feet(day.uphillM)} unit="ft" icon={TrendingUp} accent="var(--color-uphill)" />
        ) : (
          <Stat label="Lifts" value={String(day.liftCount)} icon={Armchair} accent="var(--color-lift)" />
        )}
        <Stat label="Peak" value={feet(day.peakEleM)} unit="ft" icon={Mountain} />
      </section>

      <DayExplorer track={track} segments={segments} labels={labels} timeZone={day.timezone} runs={runSocial} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <SectionTitle>Where the day went</SectionTitle>
          <DayBreakdown day={day} />
          <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
            <Stat size="sm" label="Avg run speed" value={mph(avgRunSpeed)} unit="mph" />
            <Stat size="sm" label="Longest run" value={miles(day.longestRunM)} unit="mi" />
            <Stat size="sm" label="Tallest run" value={feet(day.tallestRunM)} unit="ft" />
          </dl>
        </section>

        <section className="card p-5">
          <SectionTitle right={slug ? undefined : "Trail names need a mapped resort"}>Trails</SectionTitle>
          {diffTotal > 0 ? (
            <>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                {DIFFICULTY_ORDER.filter((d) => byDiff.get(d)).map((d) => (
                  <div key={d} style={{ flexGrow: byDiff.get(d), background: DIFFICULTY_COLOR[d] }} title={DIFFICULTY_NAME[d]} />
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                {DIFFICULTY_ORDER.filter((d) => byDiff.get(d)).map((d) => (
                  <li key={d} className="flex items-center gap-2">
                    <Difficulty level={d} size={10} />
                    <span className="text-ink-soft">{DIFFICULTY_NAME[d]}</span>
                    <span className="num">{Math.round((byDiff.get(d)! / diffTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid grid-cols-2 gap-6 border-t border-line pt-4 text-sm">
                <div>
                  <div className="label mb-2">Most skied</div>
                  <ul className="space-y-1.5">
                    {topTrails.map(([name, v]) => (
                      <li key={name} className="flex items-center gap-2">
                        <Difficulty level={v.difficulty} size={10} />
                        <span className="truncate">{name}</span>
                        <span className="num ml-auto text-ink-soft">×{v.n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="label mb-2">Lifts</div>
                  <ul className="space-y-1.5">
                    {topLifts.map(([name, n]) => (
                      <li key={name} className="flex items-center gap-2">
                        <Armchair size={12} className="shrink-0 text-lift" aria-hidden />
                        <span className="truncate">{name}</span>
                        <span className="num ml-auto text-ink-soft">×{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">
              {slug ? "No named trails matched this track." : `We don't have a trail map for ${day.resortName ?? "this area"} yet, so runs are numbered instead of named.`}
            </p>
          )}
        </section>
      </div>

      {companions.length > 0 && (
        <section className="card p-5">
          <SectionTitle
            right={
              slug ? (
                <Link href={`/days/${day.id}/replay`} className="text-accent hover:text-accent-strong">
                  Watch together in 3D
                </Link>
              ) : undefined
            }
          >
            Skied with
          </SectionTitle>
          <ul className="flex flex-wrap gap-3">
            {companions.map((c) => (
              <li key={c.day.id}>
                <Link href={`/days/${c.day.id}`} className="card-raised flex items-center gap-3 px-3 py-2 hover:border-line-strong">
                  <Avatar user={c.user} size={30} />
                  <div className="text-sm">
                    <div className="font-medium">{c.user.displayName}</div>
                    <div className="num text-xs text-ink-soft">
                      {[c.runs && `${c.runs} ${c.runs === 1 ? "run" : "runs"}`, c.lifts && `${c.lifts} ${c.lifts === 1 ? "lift" : "lifts"}`].filter(Boolean).join(" · ")} together
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-5">
        <SectionTitle right={comments.length ? <span className="num">{comments.length}</span> : undefined}>Comments</SectionTitle>
        {comments.length > 0 && (
          <ul className="mb-4 space-y-4">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-3">
                <Link href={`/u/${c.user.username}`} className="shrink-0">
                  <Avatar user={c.user} size={30} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-sm">
                    <Link href={`/u/${c.user.username}`} className="font-medium hover:text-accent">
                      {c.user.displayName}
                    </Link>
                    <span className="text-xs text-ink-faint">{c.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    {c.canDelete && (
                      <form action={deleteCommentAction.bind(null, c.id, day.id)} className="ml-auto">
                        <button className="text-xs text-ink-faint hover:text-bad">Delete</button>
                      </form>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-ink-soft">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {canComment ? (
          <CommentForm dayId={day.id} />
        ) : (
          <p className="text-sm text-ink-soft">
            <Link href="/login" className="text-accent hover:text-accent-strong">
              Sign in
            </Link>{" "}
            to comment.
          </p>
        )}
      </section>

      {isMine && (
        <form action={deleteDay.bind(null, day.id)} className="text-right">
          <button className="text-sm text-ink-faint hover:text-bad">Delete this day</button>
        </form>
      )}
    </div>
  );
}
