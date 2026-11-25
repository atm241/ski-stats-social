import type { Day } from "@/lib/days";
import { duration } from "@/lib/format";

/** Where the hours went: skiing, lifts, lift lines, uphill, car, breaks. */
const PARTS = [
  { key: "ski", label: "Skiing", color: "var(--color-vert)" },
  { key: "lift", label: "On lifts", color: "var(--color-lift)" },
  { key: "wait", label: "Lift lines", color: "var(--color-warn)" },
  { key: "skin", label: "Uphill", color: "var(--color-uphill)" },
  { key: "drive", label: "Car", color: "var(--color-ink-faint)" },
  { key: "rest", label: "Breaks", color: "var(--color-line-strong)" },
] as const;

export function DayBreakdown({ day }: { day: Day }) {
  const totalS = Math.max(1, (day.endedAt.getTime() - day.startedAt.getTime()) / 1000);
  const seconds: Record<(typeof PARTS)[number]["key"], number> = {
    ski: day.skiTimeS,
    lift: day.liftTimeS,
    wait: day.liftWaitS,
    skin: day.skinTimeS,
    drive: day.driveTimeS,
    rest: Math.max(0, totalS - day.skiTimeS - day.skinTimeS - day.liftTimeS - day.liftWaitS - day.driveTimeS),
  };
  const parts = PARTS.filter((p) => seconds[p.key] > 0);
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${duration(seconds[p.key] * 1000)}`).join(", ")}>
        {parts.map((p) => (
          <div key={p.key} title={`${p.label}: ${duration(seconds[p.key] * 1000)}`} style={{ flexGrow: seconds[p.key], background: p.color, minWidth: 3 }} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-ink-soft">{p.label}</span>
            <span className="num ml-auto">{duration(seconds[p.key] * 1000)}</span>
            <span className="num w-9 text-right text-xs text-ink-faint">{Math.round((seconds[p.key] / totalS) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
