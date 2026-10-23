import { milestoneProgress } from "@/lib/format";

const fmt = new Intl.NumberFormat("en-US", { notation: "compact" });

export function MilestoneBar({ verticalM }: { verticalM: number }) {
  const { ft, next, pct } = milestoneProgress(verticalM);
  const done = ft >= next;
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-display font-semibold">{done ? "🏅 Legend status" : `Next up: the ${fmt.format(next)} ft club`}</span>
        <span className="text-ink-soft tabular-nums">{done ? "" : `${Math.round(next - ft).toLocaleString()} ft to go`}</span>
      </div>
      <div className="relative h-4 overflow-hidden rounded-full bg-[#edf2fa]" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[repeating-linear-gradient(135deg,#5ab4ff_0_10px,#78c3ff_10px_20px)]" style={{ width: `${Math.max(pct * 100, 3)}%` }} />
      </div>
    </div>
  );
}
