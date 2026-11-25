import { ArrowLeft, Heart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Difficulty, DIFFICULTY_NAME, SectionTitle } from "@/components/ui";
import { mph, prettyDate } from "@/lib/format";
import { listMountains } from "@/lib/mountain/registry";
import { trailBoards } from "@/lib/runs";

type Params = { params: Promise<{ slug: string; trail: string }> };

export async function generateMetadata({ params }: Params) {
  const { trail } = await params;
  return { title: `${decodeURIComponent(trail)} leaderboard` };
}

/** One trail's boards: fastest skiers down it, and the most-liked runs down it. */
export default async function TrailBoardPage({ params }: Params) {
  const { slug, trail: raw } = await params;
  const trail = decodeURIComponent(raw);
  const mountain = (await listMountains()).find((m) => m.slug === slug);
  if (!mountain) notFound();
  const { fastest, liked, totalRuns, difficulty } = await trailBoards(slug, trail);
  if (!totalRuns) notFound();

  const rankClass = (i: number) => `num w-6 text-right ${i < 3 ? "text-accent" : "text-ink-faint"}`;
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link href={`/mountains/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft size={14} aria-hidden /> {mountain.name}
        </Link>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight">
          <Difficulty level={difficulty} size={14} />
          {trail}
        </h1>
        <p className="num mt-1 text-sm text-ink-soft">
          {difficulty ? `${DIFFICULTY_NAME[difficulty] ?? difficulty} · ` : ""}
          {totalRuns} {totalRuns === 1 ? "run" : "runs"} logged
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle right="top speed, best per skier">Fastest</SectionTitle>
          <ol className="card divide-y divide-line overflow-hidden">
            {fastest.map((r, i) => (
              <li key={r.id}>
                <Link href={`/days/${r.dayId}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-raised">
                  <span className={rankClass(i)}>{i + 1}</span>
                  <Avatar user={r.user} size={26} />
                  <span className="min-w-0 flex-1 truncate">{r.user.displayName}</span>
                  <span className="text-xs text-ink-faint">{prettyDate(r.day.localDate, { month: "short", day: "numeric" })}</span>
                  <span className="num w-20 text-right font-medium">{mph(r.maxSpeedMps)} mph</span>
                </Link>
              </li>
            ))}
            {!fastest.length && <li className="px-4 py-3 text-sm text-ink-soft">No clean runs with this as the main trail yet.</li>}
          </ol>
        </section>

        <section>
          <SectionTitle right="individual runs">Most liked</SectionTitle>
          <ol className="card divide-y divide-line overflow-hidden">
            {liked.map((r, i) => (
              <li key={r.id}>
                <Link href={`/days/${r.dayId}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-raised">
                  <span className={rankClass(i)}>{i + 1}</span>
                  <Avatar user={r.user} size={26} />
                  <span className="min-w-0 flex-1 truncate">{r.user.displayName}</span>
                  <span className="text-xs text-ink-faint">{prettyDate(r.day.localDate, { month: "short", day: "numeric" })}</span>
                  <span className="num flex w-14 items-center justify-end gap-1 font-medium text-[#f472b6]">
                    <Heart size={12} fill="currentColor" aria-hidden /> {r.likeCount}
                  </span>
                </Link>
              </li>
            ))}
            {!liked.length && <li className="px-4 py-3 text-sm text-ink-soft">No likes yet. Like a run from its day page.</li>}
          </ol>
        </section>
      </div>
      <p className="text-xs text-ink-faint">Speeds come from GPS and count only while on this trail, not the runout below it. Flagged days are left off.</p>
    </div>
  );
}
