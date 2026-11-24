import type { SkiDay } from "@prisma/client";
import Link from "next/link";

const FT = 3.28084;

/** Vertical per ski day across the season, one bar per day, plus monthly totals underneath. */
export function SeasonChart({ days }: { days: SkiDay[] }) {
  if (!days.length) return null;
  const sorted = [...days].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const dayMs = 86_400_000;
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const first = t(sorted[0].localDate);
  const last = t(sorted.at(-1)!.localDate);
  // pad to whole months
  const start = Date.UTC(new Date(first).getUTCFullYear(), new Date(first).getUTCMonth(), 1);
  const endD = new Date(last);
  const end = Date.UTC(endD.getUTCFullYear(), endD.getUTCMonth() + 1, 1);
  const span = Math.max(dayMs * 28, end - start);
  const max = Math.max(...sorted.map((d) => d.verticalM));
  const W = 1000;
  const H = 160;
  const bw = Math.max(3, Math.min(14, (W / (span / dayMs)) * 0.7));
  const x = (ms: number) => ((ms - start) / span) * W;

  const months: { label: string; x0: number; x1: number; ft: number; days: number }[] = [];
  for (let m = new Date(start); m.getTime() < end; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const m0 = m.getTime();
    const m1 = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1);
    const inMonth = sorted.filter((d) => t(d.localDate) >= m0 && t(d.localDate) < m1);
    months.push({ label: m.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), x0: x(m0), x1: x(m1), ft: inMonth.reduce((a, d) => a + d.verticalM * FT, 0), days: inMonth.length });
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="w-full" role="img" aria-label="Vertical per ski day this season">
        {months.map((m, i) => (
          <g key={m.label + i}>
            {i > 0 && <line x1={m.x0} x2={m.x0} y1={0} y2={H} stroke="var(--color-line)" />}
            <text x={m.x0 + 4} y={H + 14} className="fill-ink-faint text-[11px]">
              {m.label}
            </text>
          </g>
        ))}
        <line x1={0} x2={W} y1={H} y2={H} stroke="var(--color-line-strong)" />
        {sorted.map((d) => {
          const h = Math.max(2, (d.verticalM / max) * (H - 8));
          return (
            <Link key={d.id} href={`/days/${d.id}`}>
              <rect x={x(t(d.localDate) + dayMs / 2) - bw / 2} y={H - h} width={bw} height={h} rx={Math.min(2, bw / 3)} fill={d.flagged ? "var(--color-ink-faint)" : "var(--color-vert)"} className="opacity-85 hover:opacity-100">
                <title>{`${d.localDate} · ${d.resortName ?? "Backcountry"} · ${Math.round(d.verticalM * FT).toLocaleString()} ft`}</title>
              </rect>
            </Link>
          );
        })}
      </svg>
      <div className="mt-3 grid gap-px overflow-hidden rounded-lg border border-line bg-line" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((m, i) => (
          <div key={m.label + i} className="bg-raised px-2 py-1.5">
            <div className="text-[10px] tracking-wider text-ink-faint uppercase">{m.label}</div>
            <div className="num text-sm">{m.ft ? `${Math.round(m.ft / 1000)}k` : "–"}</div>
            <div className="text-[10px] text-ink-faint">{m.days ? `${m.days}d` : ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
