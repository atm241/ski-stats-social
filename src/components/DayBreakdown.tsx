import type { SkiDay } from "@prisma/client";
import { duration, feet, miles, mph } from "@/lib/format";

const FT = 3.28084;

// Same encodings as DayViz: runs blue, skinning orange, lifts recessive gray. Lift lines are a
// hatched light gray and breaks the track color, so no pair relies on hue alone.
const PARTS = [
  { key: "ski", label: "Skiing", fill: "#2f7fe0" },
  { key: "skin", label: "Skinning", fill: "#d9822b" },
  { key: "lift", label: "Riding lifts", fill: "#9aa5bd" },
  { key: "wait", label: "Lift lines", fill: "repeating-linear-gradient(135deg,#c4cde0 0 4px,#e3e9f4 4px 8px)" },
  { key: "rest", label: "Breaks & other", fill: "#edf2fa" },
] as const;

export function DayBreakdown({ day }: { day: SkiDay }) {
  const totalS = Math.max(1, (day.endedAt.getTime() - day.startedAt.getTime()) / 1000);
  const seconds: Record<(typeof PARTS)[number]["key"], number> = {
    ski: day.skiTimeS,
    skin: day.skinTimeS,
    lift: day.liftTimeS,
    wait: day.liftWaitS,
    rest: Math.max(0, totalS - day.skiTimeS - day.skinTimeS - day.liftTimeS - day.liftWaitS),
  };
  const parts = PARTS.filter((p) => seconds[p.key] > 0);

  const avgSpeed = day.skiTimeS > 0 ? day.distanceM / day.skiTimeS : 0;
  const uphillPace = day.skinTimeS > 0 ? (day.uphillM * FT) / (day.skinTimeS / 3600) : 0;

  const stats: { label: string; value: string; hint?: string }[] = [
    { label: "Distance skied", value: `${miles(day.distanceM)} mi` },
    { label: "Avg speed on runs", value: `${mph(avgSpeed)} mph` },
    { label: "Longest run", value: `${miles(day.longestRunM)} mi` },
    { label: "Tallest run", value: `${feet(day.tallestRunM)} ft` },
    { label: "Peak altitude", value: `${feet(day.peakEleM)} ft` },
    day.skinTimeS > 0
      ? { label: "Uphill pace", value: `${feet(uphillPace / FT)} ft/hr`, hint: "~1,000 ft/hr is a solid touring pace" }
      : { label: "Vert per hour", value: `${feet(day.verticalM / (totalS / 3600))} ft/hr`, hint: "Across your whole day on the hill" },
  ];

  return (
    <section className="card space-y-5 p-5">
      <div>
        <h2 className="mb-3 font-display text-lg font-semibold">Where the day went</h2>
        <div className="flex h-5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${duration(seconds[p.key] * 1000)}`).join(", ")}>
          {parts.map((p) => (
            <div key={p.key} title={`${p.label}: ${duration(seconds[p.key] * 1000)}`} style={{ flexGrow: seconds[p.key], background: p.fill, minWidth: 4 }} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-[4px]" style={{ background: p.fill }} aria-hidden />
              <span className="text-ink-soft">{p.label}</span>
              <span className="font-semibold tabular-nums">{duration(seconds[p.key] * 1000)}</span>
              <span className="text-xs text-ink-soft tabular-nums">{Math.round((seconds[p.key] / totalS) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line pt-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs font-bold tracking-wide text-ink-soft uppercase">{s.label}</dt>
            <dd className="font-display text-xl font-semibold tabular-nums">{s.value}</dd>
            {s.hint && <dd className="text-xs text-ink-soft">{s.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}
