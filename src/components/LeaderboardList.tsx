import Link from "next/link";
import type { LeaderboardRow, Metric } from "@/lib/days";
import { feet } from "@/lib/format";
import { Avatar } from "./Avatar";

const MEDALS = ["🥇", "🥈", "🥉"];

export const METRIC_LABEL: Record<Metric, string> = { vertical: "Vertical", days: "Days", resorts: "Resorts", bestday: "Best day", uphill: "Uphill" };

export const METRIC_BLURB: Record<Metric, string> = {
  vertical: "Total descent this season, resort and backcountry.",
  days: "Distinct days on snow this season.",
  resorts: "Different lift-served resorts skied this season.",
  bestday: "Most vertical skied in a single day.",
  uphill: "Human-powered vertical: skinning and bootpacking.",
};

export function metricValue(row: LeaderboardRow, metric: Metric) {
  if (metric === "vertical") return { value: feet(row.verticalM), unit: "ft", raw: row.verticalM };
  if (metric === "bestday") return { value: feet(row.bestDayM), unit: "ft", raw: row.bestDayM };
  if (metric === "uphill") return { value: feet(row.uphillM), unit: "ft", raw: row.uphillM };
  if (metric === "days") return { value: String(row.days), unit: row.days === 1 ? "day" : "days", raw: row.days };
  return { value: String(row.resorts), unit: row.resorts === 1 ? "resort" : "resorts", raw: row.resorts };
}

export function LeaderboardList({ rows, metric, meId, limit }: { rows: LeaderboardRow[]; metric: Metric; meId?: string; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows;
  const me = meId ? rows.find((r) => r.user.id === meId) : undefined;
  const max = Math.max(1, ...rows.map((r) => metricValue(r, metric).raw));

  if (rows.length === 0) return <p className="card p-6 text-center text-ink-soft">No days logged this season yet. Be the first! ❄️</p>;

  return (
    <ol className="card divide-y divide-line overflow-hidden">
      {shown.map((r) => (
        <Row key={r.user.id} row={r} metric={metric} max={max} highlight={r.user.id === meId} />
      ))}
      {me && !shown.includes(me) && (
        <>
          <li className="py-1 text-center text-ink-soft" aria-hidden>
            ⋮
          </li>
          <Row row={me} metric={metric} max={max} highlight />
        </>
      )}
    </ol>
  );
}

function Row({ row, metric, max, highlight }: { row: LeaderboardRow; metric: Metric; max: number; highlight: boolean }) {
  const v = metricValue(row, metric);
  return (
    <li className={highlight ? "bg-sky-soft/60" : undefined}>
      <Link href={`/u/${row.user.username}`} className="flex items-center gap-3 px-4 py-3 hover:bg-snow">
        <span className="w-8 shrink-0 text-center font-display text-lg font-semibold text-ink-soft tabular-nums">{MEDALS[row.rank - 1] ?? row.rank}</span>
        <Avatar user={row.user} size={42} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-display text-[17px] font-semibold">
              {row.user.displayName}
              {highlight && <span className="chip ml-2 bg-sky text-white">you</span>}
            </span>
            <span className="shrink-0 font-display text-lg font-semibold tabular-nums">
              {v.value}
              <span className="ml-1 text-xs font-medium text-ink-soft">{v.unit}</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#edf2fa]">
              <div className="h-full rounded-full bg-sky" style={{ width: `${(v.raw / max) * 100}%` }} />
            </div>
            <span className="hidden shrink-0 text-xs text-ink-soft sm:inline">
              {metric !== "vertical" && metric !== "bestday" && `${feet(row.verticalM)} ft · `}
              {metric !== "days" && `${row.days}d · `}
              {metric !== "resorts" && `${row.resorts} ${row.resorts === 1 ? "resort" : "resorts"} · `}
              {row.backcountryDays > 0 ? `${row.backcountryDays} BC` : "@" + row.user.username}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
