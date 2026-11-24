import { milestoneProgress } from "@/lib/format";

const fmt = new Intl.NumberFormat("en-US", { notation: "compact" });

/** Progress toward the next vertical club (100k, 250k, …). */
export function MilestoneBar({ verticalM }: { verticalM: number }) {
  const { ft, next, pct } = milestoneProgress(verticalM);
  const done = ft >= next;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-soft">{done ? "Every milestone cleared" : `Next: ${fmt.format(next)} ft club`}</span>
        <span className="num text-ink-faint">{done ? "" : `${Math.round(next - ft).toLocaleString()} ft to go`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-accent-strong to-accent" style={{ width: `${Math.max(pct * 100, 2)}%` }} />
      </div>
    </div>
  );
}
