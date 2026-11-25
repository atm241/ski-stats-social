"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const FT = 3.28084;
const DAY_MS = 86_400_000;

export interface SeasonChartDay {
  id: string;
  localDate: string;
  resortName: string | null;
  verticalM: number;
  runCount: number;
  flagged: boolean;
}

const t = (d: string) => Date.parse(`${d}T00:00:00Z`);
const compact = (ft: number) => (ft >= 10_000 ? `${(ft / 1000).toFixed(ft >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K` : Math.round(ft).toLocaleString());
/** "2026-02-15" → "02/15" */
const mmdd = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}`;
const FLAT_GAP = 36; // px a flat "02/15" needs
const TILTED_GAP = 11; // ...and a steeply tilted one (only its height counts sideways)
const dateFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** Clean y ticks in feet: at most four steps above zero. */
function ticksFor(maxFt: number) {
  const step = [1000, 2000, 2500, 5000, 10_000, 20_000, 25_000, 50_000].find((s) => maxFt / s <= 4) ?? 100_000;
  const top = Math.max(step, Math.ceil(maxFt / step) * step);
  const out: number[] = [];
  for (let v = 0; v <= top; v += step) out.push(v);
  return out;
}

/** rounded data-end (4px), square at the baseline */
function barPath(x: number, y: number, w: number, base: number) {
  const r = Math.min(4, w / 2, base - y);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

/** Vertical per ski day across the season on a real calendar (gaps are days off), with monthly totals under their months. */
export function SeasonChart({ days }: { days: SeasonChartDay[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!days.length) return null;
  const sorted = [...days].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const firstD = new Date(t(sorted[0].localDate));
  const lastD = new Date(t(sorted.at(-1)!.localDate));
  const start = Date.UTC(firstD.getUTCFullYear(), firstD.getUTCMonth(), 1);
  const end = Date.UTC(lastD.getUTCFullYear(), lastD.getUTCMonth() + 1, 1);
  const spanDays = (end - start) / DAY_MS;

  const counted = sorted.filter((d) => !d.flagged);
  const avgFt = counted.length ? counted.reduce((a, d) => a + d.verticalM * FT, 0) / counted.length : 0;
  const ticks = ticksFor(Math.max(...sorted.map((d) => d.verticalM * FT)));
  const topFt = ticks.at(-1)!;
  const best = counted.reduce<SeasonChartDay | null>((b, d) => (!b || d.verticalM > b.verticalM ? d : b), null);

  const PAD_L = 40; // y labels
  const PAD_T = 18; // room for the best-day label
  const H = 170;
  const plotW = Math.max(0, width - PAD_L);
  const slot = plotW / spanDays;
  const bw = Math.max(3, Math.min(24, slot * 0.72));
  const x = (ms: number) => PAD_L + ((ms - start) / DAY_MS) * slot;
  const y = (ft: number) => PAD_T + (1 - ft / topFt) * (H - PAD_T);

  const months: { label: string; x0: number; days: number; ft: number; skied: number }[] = [];
  for (let m = new Date(start); m.getTime() < end; m.setUTCMonth(m.getUTCMonth() + 1)) {
    const m0 = m.getTime();
    const m1 = Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1);
    const inMonth = counted.filter((d) => t(d.localDate) >= m0 && t(d.localDate) < m1);
    months.push({ label: m.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }), x0: x(m0), days: (m1 - m0) / DAY_MS, ft: inMonth.reduce((a, d) => a + d.verticalM * FT, 0), skied: inMonth.length });
  }

  const hovered = hover !== null ? sorted[hover] : null;
  const hx = hovered ? x(t(hovered.localDate) + DAY_MS / 2) : 0;

  // Date under each bar, left to right, skipping any that would crowd the one before.
  // The hovered day always gets its label; neighbours that would touch it step aside.
  // Flat when every day fits; tilted when days bunch up, so back-to-back days still each get a date.
  const barX = sorted.map((d) => x(t(d.localDate) + DAY_MS / 2));
  const tilted = barX.some((bx, i) => i > 0 && bx - barX[i - 1] < FLAT_GAP);
  const gap = tilted ? TILTED_GAP : FLAT_GAP;
  const dateLabels: number[] = [];
  let lastX = -Infinity;
  barX.forEach((bx, i) => {
    if (hover !== null && i !== hover && Math.abs(bx - barX[hover]) < gap) return;
    if (i === hover || bx - lastX >= gap) {
      dateLabels.push(i);
      lastX = bx;
    }
  });
  const AXIS_B = tilted ? 40 : 18; // room under the baseline for the dates

  return (
    <div ref={box} className="relative">
      {width > 0 && (
        <svg width={width} height={H + AXIS_B + 18} role="img" aria-label="Vertical feet per ski day this season" onMouseLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={width} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--color-line-strong)" : "var(--color-line)"} />
              <text x={PAD_L - 8} y={y(v) + 4} textAnchor="end" className="num fill-ink-faint text-[11px]">
                {v === 0 ? "0" : compact(v)}
              </text>
            </g>
          ))}
          {months.map((m, i) => (
            <g key={m.label + i}>
              {i > 0 && <line x1={m.x0} x2={m.x0} y1={PAD_T} y2={H} stroke="var(--color-line)" />}
              <text x={m.x0 + 4} y={H + AXIS_B + 14} className="fill-ink-faint text-[11px] tracking-wide uppercase">
                {m.label}
              </text>
            </g>
          ))}
          {avgFt > 0 && (
            <g>
              <line x1={PAD_L} x2={width} y1={y(avgFt)} y2={y(avgFt)} stroke="var(--color-ink-faint)" />
              <text x={width - 2} y={y(avgFt) - 5} textAnchor="end" className="num fill-ink-soft text-[11px]">
                avg {compact(avgFt)}
              </text>
            </g>
          )}
          {sorted.map((d, i) => {
            const cx = x(t(d.localDate) + DAY_MS / 2);
            const ft = d.verticalM * FT;
            return (
              <path key={d.id} d={barPath(cx - bw / 2, y(ft), bw, H)} fill={d.flagged ? "var(--color-ink-faint)" : "var(--color-vert)"} opacity={hover === null || hover === i ? 1 : 0.45} />
            );
          })}
          {dateLabels.map((i) => {
            const lx = tilted ? barX[i] + 3 : Math.min(width - 15, Math.max(PAD_L + 15, barX[i]));
            return (
              <text
                key={sorted[i].id}
                x={lx}
                y={H + (tilted ? 9 : 14)}
                textAnchor={tilted ? "end" : "middle"}
                transform={tilted ? `rotate(-65 ${lx} ${H + 9})` : undefined}
                className={`num text-[10px] ${i === hover ? "fill-ink font-medium" : "fill-ink-faint"}`}
              >
                {mmdd(sorted[i].localDate)}
              </text>
            );
          })}
          {best && hover === null && (
            <text x={Math.min(width - 24, Math.max(PAD_L + 24, x(t(best.localDate) + DAY_MS / 2)))} y={y(best.verticalM * FT) - 6} textAnchor="middle" className="num fill-ink text-[11px] font-medium">
              {compact(best.verticalM * FT)}
            </text>
          )}
          {/* hit targets: the full column for each day, wider than the bar */}
          {sorted.map((d, i) => {
            const cx = x(t(d.localDate) + DAY_MS / 2);
            const w = Math.max(bw + 6, Math.min(slot, 28));
            return (
              <Link key={d.id} href={`/days/${d.id}`} aria-label={`${d.localDate}, ${Math.round(d.verticalM * FT).toLocaleString()} feet`} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
                <rect x={cx - w / 2} y={PAD_T} width={w} height={H - PAD_T} fill="transparent" onMouseEnter={() => setHover(i)} />
              </Link>
            );
          })}
        </svg>
      )}
      {hovered && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line-strong bg-raised px-3 py-2 text-xs whitespace-nowrap shadow-lg"
          style={{ left: Math.min(width - 90, Math.max(90, hx)), top: Math.max(0, y(hovered.verticalM * FT) - 10) }}
        >
          <div className="text-ink-soft">{dateFmt.format(t(hovered.localDate))}</div>
          <div className="font-medium text-ink">{hovered.resortName ?? "Backcountry"}</div>
          <div className="num text-ink">
            {Math.round(hovered.verticalM * FT).toLocaleString()} ft · {hovered.runCount} runs
          </div>
          {hovered.flagged && <div className="text-ink-faint">Flagged, not counted</div>}
        </div>
      )}
      {/* monthly totals, each under its own month */}
      {width > 0 && (
        <div className="mt-3 grid gap-px overflow-hidden rounded-lg border border-line bg-line" style={{ marginLeft: PAD_L, gridTemplateColumns: months.map((m) => `${m.days}fr`).join(" ") }}>
          {months.map((m, i) => (
            <div key={m.label + i} className="min-w-0 bg-raised px-2 py-1.5">
              <div className="text-[10px] tracking-wider text-ink-faint uppercase">{m.label}</div>
              <div className="num truncate text-sm">{m.ft ? `${compact(m.ft)} ft` : "–"}</div>
              <div className="text-[10px] text-ink-faint">{m.skied ? `${m.skied} ${m.skied === 1 ? "day" : "days"}` : "no days"}</div>
            </div>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>Vertical feet per ski day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Resort</th>
            <th>Vertical (ft)</th>
            <th>Runs</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.id}>
              <td>{d.localDate}</td>
              <td>{d.resortName ?? "Backcountry"}</td>
              <td>{Math.round(d.verticalM * FT)}</td>
              <td>{d.runCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
