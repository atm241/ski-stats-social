import type { SkiDay } from "@prisma/client";
import Link from "next/link";
import { type BestKey, longestStreak, personalBests } from "@/lib/days";
import { feet, miles, mph, prettyDate } from "@/lib/format";

const BESTS: { key: BestKey; icon: string; label: string; fmt: (d: SkiDay) => string }[] = [
  { key: "verticalM", icon: "🏔️", label: "Biggest day", fmt: (d) => `${feet(d.verticalM)} ft` },
  { key: "runCount", icon: "🔁", label: "Most runs", fmt: (d) => `${d.runCount} runs` },
  { key: "maxSpeedMps", icon: "⚡", label: "Top speed", fmt: (d) => `${mph(d.maxSpeedMps)} mph` },
  { key: "tallestRunM", icon: "📏", label: "Tallest run", fmt: (d) => `${feet(d.tallestRunM)} ft` },
  { key: "longestRunM", icon: "🛤️", label: "Longest run", fmt: (d) => `${miles(d.longestRunM)} mi` },
  { key: "peakEleM", icon: "🚩", label: "Highest point", fmt: (d) => `${feet(d.peakEleM)} ft` },
  { key: "uphillM", icon: "🥾", label: "Biggest uphill day", fmt: (d) => `${feet(d.uphillM)} ft` },
];

export function PersonalBests({ days }: { days: SkiDay[] }) {
  const bests = personalBests(days);
  const streak = longestStreak(days);

  return (
    <section>
      <h2 className="mb-2 font-display text-xl font-semibold">Trophy case 🏆</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {BESTS.filter((b) => bests[b.key]).map((b) => {
          const d = bests[b.key]!;
          return (
            <Link key={b.key} href={`/days/${d.id}`} className="card p-3 transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="text-xs font-bold tracking-wide text-ink-soft uppercase">
                <span aria-hidden>{b.icon}</span> {b.label}
              </div>
              <div className="font-display text-xl font-semibold tabular-nums">{b.fmt(d)}</div>
              <div className="truncate text-xs text-ink-soft">
                {d.resortName ?? "Backcountry"} · {prettyDate(d.localDate, { month: "short", day: "numeric" })}
              </div>
            </Link>
          );
        })}
        {streak.length > 1 && (
          <div className="card p-3">
            <div className="text-xs font-bold tracking-wide text-ink-soft uppercase">
              <span aria-hidden>🔥</span> Longest streak
            </div>
            <div className="font-display text-xl font-semibold tabular-nums">{streak.length} days in a row</div>
            <div className="truncate text-xs text-ink-soft">
              {prettyDate(streak.from!, { month: "short", day: "numeric" })} – {prettyDate(streak.to!, { month: "short", day: "numeric" })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
