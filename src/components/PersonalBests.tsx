import { ArrowDownRight, Flame, Gauge, Hash, Mountain, Route, Ruler, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { type BestKey, type Day, longestStreak, personalBests } from "@/lib/days";
import { feet, miles, mph, prettyDate } from "@/lib/format";

const BESTS: { key: BestKey; icon: LucideIcon; label: string; value: (d: Day) => string; unit: string }[] = [
  { key: "verticalM", icon: ArrowDownRight, label: "Biggest day", value: (d) => feet(d.verticalM), unit: "ft" },
  { key: "maxSpeedMps", icon: Gauge, label: "Top speed", value: (d) => mph(d.maxSpeedMps), unit: "mph" },
  { key: "runCount", icon: Hash, label: "Most runs", value: (d) => String(d.runCount), unit: "runs" },
  { key: "tallestRunM", icon: Ruler, label: "Tallest run", value: (d) => feet(d.tallestRunM), unit: "ft" },
  { key: "longestRunM", icon: Route, label: "Longest run", value: (d) => miles(d.longestRunM), unit: "mi" },
  { key: "peakEleM", icon: Mountain, label: "Highest point", value: (d) => feet(d.peakEleM), unit: "ft" },
  { key: "uphillM", icon: TrendingUp, label: "Biggest uphill", value: (d) => feet(d.uphillM), unit: "ft" },
];

export function PersonalBests({ days }: { days: Day[] }) {
  const bests = personalBests(days);
  const streak = longestStreak(days);
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
      {BESTS.filter((b) => bests[b.key]).map((b) => {
        const d = bests[b.key]!;
        return (
          <Link key={b.key} href={`/days/${d.id}`} className="bg-surface p-4 transition-colors hover:bg-raised">
            <div className="label flex items-center gap-1.5">
              <b.icon size={12} aria-hidden /> {b.label}
            </div>
            <div className="num mt-1.5 text-xl font-semibold">
              {b.value(d)}
              <span className="ml-1 font-sans text-xs font-normal text-ink-soft">{b.unit}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-ink-faint">
              {d.resortName ?? "Backcountry"} · {prettyDate(d.localDate, { month: "short", day: "numeric" })}
            </div>
          </Link>
        );
      })}
      {streak.length > 1 && (
        <div className="bg-surface p-4">
          <div className="label flex items-center gap-1.5">
            <Flame size={12} aria-hidden /> Longest streak
          </div>
          <div className="num mt-1.5 text-xl font-semibold">
            {streak.length}
            <span className="ml-1 font-sans text-xs font-normal text-ink-soft">days</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-ink-faint">
            {prettyDate(streak.from!, { month: "short", day: "numeric" })} – {prettyDate(streak.to!, { month: "short", day: "numeric" })}
          </div>
        </div>
      )}
    </div>
  );
}
