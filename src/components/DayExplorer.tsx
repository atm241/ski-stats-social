"use client";

import { Armchair, Coffee, Footprints, Car, Heart, TrendingDown, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setRunLikeAction } from "@/app/actions";
import type { StoredTrack } from "@/lib/analysis/process";
import type { Segment, SegmentKind } from "@/lib/analysis/types";
import type { SegmentLabel } from "@/lib/trails";
import { Difficulty } from "./ui";

/*
 * The day, three ways, kept in sync: an altitude/speed profile, a map of the lines, and a
 * Slopes-style timeline of every lift ride and run. Selecting a run anywhere highlights it
 * everywhere and zooms the map to it.
 */

type Kind = SegmentKind | "idle";
const FT = 3.28084;
const MPH = 2.23694;

const COLOR: Record<Kind, string> = {
  run: "var(--color-vert)",
  lift: "var(--color-lift)",
  skin: "var(--color-uphill)",
  drive: "var(--color-ink-faint)",
  idle: "var(--color-ink-faint)",
};
const DASH: Partial<Record<Kind, string>> = { lift: "4 4", drive: "2 4", idle: "1 4" };
const KIND_LABEL: Record<Kind, string> = { run: "Run", lift: "Lift", skin: "Uphill", drive: "Car", idle: "Break" };

interface Pt {
  t: number;
  lat: number;
  lon: number;
  ele: number;
  /** m/s, smoothed over neighbours */
  v: number;
  kind: Kind;
  seg: number;
}

type Item =
  | { type: "seg"; seg: number; runNo?: number; waitMs?: number }
  | { type: "break"; from: number; to: number };

/** Social bits for a named run: its likes, and where its trail's leaderboard lives. Keyed by segment index. */
export type RunSocial = Record<number, { id: string; likes: number; liked: boolean; canLike: boolean; board: string }>;

export function DayExplorer({ track, segments, labels, timeZone, runs }: { track: StoredTrack; segments: Segment[]; labels: (SegmentLabel | null)[]; timeZone: string; runs?: RunSocial }) {
  const pts = useMemo<Pt[]>(() => {
    const raw = track.pts.map(([dt, lat, lon, ele]) => ({ t: track.t0 + dt * 1000, lat, lon, ele }));
    let s = 0;
    return raw.map((p, i) => {
      while (s < segments.length - 1 && segments[s].endT < p.t) s++;
      const inSeg = segments[s] && p.t >= segments[s].startT && p.t <= segments[s].endT;
      const a = raw[Math.max(0, i - 1)];
      const b = raw[Math.min(raw.length - 1, i + 1)];
      const dt = (b.t - a.t) / 1000;
      const v = dt > 0 ? metres(a, b) / dt : 0;
      return { ...p, v, kind: inSeg ? segments[s].kind : "idle", seg: inSeg ? s : -1 };
    });
  }, [track, segments]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let runNo = 0;
    segments.forEach((s, i) => {
      const prev = segments[i - 1];
      const gap = prev ? s.startT - prev.endT : 0;
      // A short gap from a run into a lift is the lift line; longer gaps are breaks.
      const isLine = s.kind === "lift" && prev?.kind === "run" && gap <= 20 * 60_000;
      if (!isLine && gap > 8 * 60_000) out.push({ type: "break", from: prev.endT, to: s.startT });
      out.push({ type: "seg", seg: i, runNo: s.kind === "run" ? ++runNo : undefined, waitMs: isLine && gap > 30_000 ? gap : undefined });
    });
    return out;
  }, [segments]);

  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [metric, setMetric] = useState<"ele" | "speed">("ele");
  const toggle = (seg: number) => setSelected((cur) => (cur === seg ? null : seg));
  const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });

  const sel = selected != null ? segments[selected] : null;
  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="space-y-4">
      <Profile pts={pts} metric={metric} setMetric={setMetric} selected={selected} hover={hover} setHover={setHover} onPick={toggle} fmtTime={fmtTime} labels={labels} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <figure className="card self-start overflow-hidden">
          <figcaption className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <span className="min-w-0 truncate text-[15px] font-semibold tracking-tight">{sel ? (labels[selected!]?.names.join(" → ") ?? KIND_LABEL[sel.kind]) : "Your lines"}</span>
            {sel && (
              <button type="button" onClick={() => setSelected(null)} className="shrink-0 text-xs whitespace-nowrap text-ink-soft hover:text-ink">
                Show whole day
              </button>
            )}
          </figcaption>
          <TrackMap pts={pts} selected={selected} hp={hp} onPick={toggle} />
        </figure>

        <section className="card flex max-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold tracking-tight">Timeline</h2>
            <span className="text-xs text-ink-soft">Tap a run to see it on the map</span>
          </div>
          <ol className="flex-1 divide-y divide-line overflow-y-auto">
            {items.map((it, i) =>
              it.type === "break" ? (
                <li key={`b${i}`} className="flex items-center gap-3 px-4 py-2 text-sm text-ink-soft">
                  <Coffee size={15} className="shrink-0" aria-hidden />
                  <span>Break</span>
                  <span className="num ml-auto text-xs">
                    {fmtTime(it.from)} · {dur(it.to - it.from)}
                  </span>
                </li>
              ) : (
                <SegRow key={it.seg} item={it} seg={segments[it.seg]} label={labels[it.seg]} active={selected === it.seg} onClick={() => toggle(it.seg)} fmtTime={fmtTime} social={runs?.[it.seg]} />
              ),
            )}
          </ol>
        </section>
      </div>
    </div>
  );
}

function SegRow({ item, seg, label, active, onClick, fmtTime, social }: { item: Extract<Item, { type: "seg" }>; seg: Segment; label: SegmentLabel | null; active: boolean; onClick: () => void; fmtTime: (t: number) => string; social?: RunSocial[number] }) {
  const ms = seg.endT - seg.startT;
  if (seg.kind === "run") {
    const avg = ms > 0 ? seg.distanceM / (ms / 1000) : 0;
    return (
      <li className={`flex items-stretch transition-colors ${active ? "bg-accent-dim" : "hover:bg-raised"}`}>
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left">
          <span className="num mt-0.5 w-6 shrink-0 text-right text-sm text-ink-faint">{item.runNo}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Difficulty level={label?.difficulty} />
              <span className="truncate font-medium">{label ? label.names.join(" → ") : `Run ${item.runNo}`}</span>
            </div>
            <div className="num mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-soft">
              <span>{fmtTime(seg.startT)}</span>
              <span>{dur(ms)}</span>
              <span>{mi(seg.distanceM)} mi</span>
              <span>avg {Math.round(avg * MPH)} mph</span>
              <span>top {Math.round(seg.maxSpeedMps * MPH)} mph</span>
            </div>
          </div>
          <div className="text-right">
            <div className="num text-[15px] font-semibold text-vert">{ft(seg.verticalM)}</div>
            <div className="text-[11px] text-ink-faint">ft</div>
          </div>
        </button>
        {social ? <RunActions social={social} /> : <span className="w-4 shrink-0" />}
      </li>
    );
  }
  const Icon = seg.kind === "lift" ? Armchair : seg.kind === "skin" ? Footprints : seg.kind === "drive" ? Car : TrendingDown;
  const color = COLOR[seg.kind];
  return (
    <li>
      <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${active ? "bg-accent-dim" : "hover:bg-raised"}`}>
        <span className="flex w-6 shrink-0 justify-end">
          <Icon size={15} style={{ color }} aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-ink-soft">
          <span className="text-ink">{label?.name ?? (seg.kind === "lift" ? "Lift" : seg.kind === "skin" ? "Skinning / bootpack" : "Car ride")}</span>
          {item.waitMs ? <span className="ml-2 text-xs text-warn">{dur(item.waitMs)} line</span> : null}
        </span>
        <span className="num shrink-0 text-xs text-ink-soft">
          {fmtTime(seg.startT)} · {dur(ms)}
          {seg.kind !== "drive" && ` · +${ft(seg.verticalM)} ft`}
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- profile chart

const PAD = { l: 48, r: 12, t: 14, b: 24 };

/** Width of an element in CSS pixels, so SVG charts draw at 1:1 and labels stay readable on phones. */
function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Profile({
  pts,
  metric,
  setMetric,
  selected,
  hover,
  setHover,
  onPick,
  fmtTime,
  labels,
}: {
  pts: Pt[];
  metric: "ele" | "speed";
  setMetric: (m: "ele" | "speed") => void;
  selected: number | null;
  hover: number | null;
  setHover: (i: number | null) => void;
  onPick: (seg: number) => void;
  fmtTime: (t: number) => string;
  labels: (SegmentLabel | null)[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxRef, W] = useWidth<HTMLDivElement>(1000);
  const H = W < 600 ? 180 : 220;
  const val = (p: Pt) => (metric === "ele" ? p.ele * FT : p.kind === "run" ? p.v * MPH : 0);
  const t0 = pts[0].t;
  const t1 = pts.at(-1)!.t;
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of pts) {
    const v = val(p);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (metric === "speed") lo = 0;
  const pad = Math.max(metric === "ele" ? 60 : 2, (hi - lo) * 0.08);
  const y0 = metric === "speed" ? 0 : lo - pad;
  const y1 = hi + pad;
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const ticks = niceTicks(y0, y1, 4);
  const allHours: number[] = [];
  for (let t = Math.ceil(t0 / 3_600_000) * 3_600_000; t <= t1; t += 3_600_000) allHours.push(t);
  const every = Math.max(1, Math.ceil(allHours.length / Math.max(2, Math.floor(W / 110))));
  const hours = allHours.filter((_, i) => i % every === 0);

  // contiguous same-kind pieces so each gets its colour
  const pieces: { kind: Kind; seg: number; pts: Pt[] }[] = [];
  pts.forEach((p, i) => {
    const last = pieces.at(-1);
    if (last && last.kind === p.kind && last.seg === p.seg) last.pts.push(p);
    else pieces.push({ kind: p.kind, seg: p.seg, pts: i ? [pts[i - 1], p] : [p] });
  });

  const indexAt = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const t = t0 + ((((clientX - r.left) / r.width) * W - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    let a = 0;
    let b = pts.length - 1;
    while (a < b) {
      const m = (a + b) >> 1;
      if (pts[m].t < t) a = m + 1;
      else b = m;
    }
    return a;
  };
  const hp = hover != null ? pts[hover] : null;
  const area = `M${x(t0)},${y(y0)} ${pts.map((p) => `L${x(p.t).toFixed(1)},${y(val(p)).toFixed(1)}`).join(" ")} L${x(t1)},${y(y0)} Z`;

  return (
    <figure className="card p-4">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-line bg-raised p-0.5 text-xs font-medium">
          {(["ele", "speed"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMetric(m)} className={`rounded-md px-3 py-1 ${metric === m ? "bg-hover text-ink" : "text-ink-soft hover:text-ink"}`}>
              {m === "ele" ? "Altitude" : "Speed"}
            </button>
          ))}
        </div>
        <ul className="flex flex-wrap gap-3 text-xs text-ink-soft">
          {(["run", "lift", "skin"] as Kind[])
            .filter((k) => pts.some((p) => p.kind === k))
            .map((k) => (
              <li key={k} className="flex items-center gap-1.5">
                <svg width="16" height="4" aria-hidden>
                  <line x1="0" x2="16" y1="2" y2="2" stroke={COLOR[k]} strokeWidth="2.5" strokeDasharray={DASH[k]} />
                </svg>
                {KIND_LABEL[k]}
              </li>
            ))}
        </ul>
      </figcaption>
      <div className="relative" ref={boxRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full cursor-crosshair touch-none select-none"
          onPointerMove={(e) => setHover(indexAt(e.clientX))}
          onPointerLeave={() => setHover(null)}
          onClick={(e) => {
            const p = pts[indexAt(e.clientX)];
            if (p.seg >= 0 && p.kind === "run") onPick(p.seg);
          }}
          role="img"
          aria-label={metric === "ele" ? "Altitude through the day" : "Speed on runs through the day"}
        >
          <defs>
            <linearGradient id="profileFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--color-vert)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--color-vert)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" />
              <text x={PAD.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="num fill-ink-faint text-[11px]">
                {Math.round(v).toLocaleString()}
              </text>
            </g>
          ))}
          {hours.map((t) => (
            <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="num fill-ink-faint text-[11px]">
              {fmtTime(t)}
            </text>
          ))}
          {metric === "ele" && <path d={area} fill="url(#profileFill)" />}
          {selected != null && (
            <rect
              x={x(pts.find((p) => p.seg === selected)?.t ?? t0)}
              width={Math.max(2, x(pts.findLast((p) => p.seg === selected)?.t ?? t0) - x(pts.find((p) => p.seg === selected)?.t ?? t0))}
              y={PAD.t}
              height={H - PAD.t - PAD.b}
              fill="var(--color-accent)"
              opacity="0.08"
            />
          )}
          {pieces.map((pc, i) => (
            <polyline
              key={i}
              points={pc.pts.map((p) => `${x(p.t).toFixed(1)},${y(val(p)).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={COLOR[pc.kind]}
              strokeWidth={pc.kind === "run" ? 2 : 1.5}
              strokeDasharray={DASH[pc.kind]}
              strokeLinejoin="round"
              opacity={selected == null || pc.seg === selected ? 1 : 0.3}
            />
          ))}
          {hp && (
            <g pointerEvents="none">
              <line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--color-ink-soft)" strokeOpacity="0.5" />
              <circle cx={x(hp.t)} cy={y(val(hp))} r="4" fill={COLOR[hp.kind]} stroke="var(--color-bg)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-line-strong bg-raised/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
            style={{ left: `${(x(hp.t) / W) * 100}%`, transform: x(hp.t) > W * 0.65 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
          >
            <div className="num text-sm font-semibold">
              {Math.round(hp.ele * FT).toLocaleString()} ft{hp.kind === "run" && <span className="ml-2 text-speed">{Math.round(hp.v * MPH)} mph</span>}
            </div>
            <div className="mt-0.5 text-ink-soft">
              {hp.seg >= 0 && labels[hp.seg] ? labels[hp.seg]!.name : KIND_LABEL[hp.kind]} · {fmtTime(hp.t)}
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}

// ---------------------------------------------------------------- map

function TrackMap({ pts, selected, hp, onPick }: { pts: Pt[]; selected: number | null; hp: Pt | null; onPick: (seg: number) => void }) {
  const S = 420;
  const view = useMemo(() => {
    const focus = selected != null ? pts.filter((p) => p.seg === selected) : pts;
    const lats = focus.map((p) => p.lat);
    const lons = focus.map((p) => p.lon);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const kx = Math.cos((midLat * Math.PI) / 180);
    const minX = Math.min(...lons) * kx;
    const maxX = Math.max(...lons) * kx;
    const minY = Math.min(...lats);
    const maxY = Math.max(...lats);
    const pad = 28;
    const span = Math.max(maxX - minX, maxY - minY, selected != null ? 0.004 : 1e-6);
    const scale = (S - 2 * pad) / span;
    const ox = (S - (maxX - minX) * scale) / 2;
    const oy = (S - (maxY - minY) * scale) / 2;
    return { px: (p: Pt) => ox + (p.lon * kx - minX) * scale, py: (p: Pt) => S - (oy + (p.lat - minY) * scale) };
  }, [pts, selected]);

  const pieces: { kind: Kind; seg: number; pts: Pt[] }[] = [];
  pts.forEach((p, i) => {
    const last = pieces.at(-1);
    if (last && last.kind === p.kind && last.seg === p.seg) last.pts.push(p);
    else pieces.push({ kind: p.kind, seg: p.seg, pts: i ? [pts[i - 1], p] : [p] });
  });
  const line = (ps: Pt[]) => ps.map((p) => `${view.px(p).toFixed(1)},${view.py(p).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="block aspect-square w-full bg-[radial-gradient(circle_at_30%_20%,#141a24,#0c1016)]" role="img" aria-label="Map of the day's tracks">
      <defs>
        <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0V28" fill="none" stroke="#ffffff" strokeOpacity="0.035" />
        </pattern>
      </defs>
      <rect width={S} height={S} fill="url(#grid)" />
      {pieces
        .filter((pc) => pc.kind !== "idle")
        .map((pc, i) => {
          const on = selected == null || pc.seg === selected;
          return (
            <polyline
              key={i}
              points={line(pc.pts)}
              fill="none"
              stroke={COLOR[pc.kind]}
              strokeWidth={on && selected != null ? 3.5 : pc.kind === "run" ? 2.2 : 1.4}
              strokeDasharray={DASH[pc.kind]}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={on ? (pc.kind === "run" ? 0.95 : 0.7) : 0.12}
              className={pc.kind === "run" ? "cursor-pointer" : undefined}
              onClick={pc.kind === "run" ? () => onPick(pc.seg) : undefined}
            />
          );
        })}
      <circle cx={view.px(pts[0])} cy={view.py(pts[0])} r="4.5" fill="var(--color-good)" stroke="var(--color-bg)" strokeWidth="2" />
      {hp && <circle cx={view.px(hp)} cy={view.py(hp)} r="5.5" fill="var(--color-speed)" stroke="var(--color-bg)" strokeWidth="2" />}
    </svg>
  );
}

// ---------------------------------------------------------------- helpers

function metres(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const ft = (m: number) => Math.round(m * FT).toLocaleString();
const mi = (m: number) => (m / 1609.344).toFixed(1);
function dur(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 1) return `${Math.round(ms / 1000)}s`;
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
function niceTicks(min: number, max: number, count: number) {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/** Like a run (optimistic) and jump to its trail's leaderboard. */
function RunActions({ social }: { social: RunSocial[number] }) {
  const [state, setState] = useState({ liked: social.liked, likes: social.likes });
  const [pending, startTransition] = useTransition();
  const toggle = () => {
    const next = !state.liked;
    setState((s) => ({ liked: next, likes: s.likes + (next ? 1 : -1) }));
    startTransition(async () => {
      const r = await setRunLikeAction(social.id, next);
      if (r) setState({ liked: r.liked, likes: r.likeCount });
    });
  };
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-3">
      <button
        type="button"
        onClick={toggle}
        disabled={!social.canLike || pending}
        title={social.canLike ? (state.liked ? "Unlike this run" : "Like this run") : "Likes"}
        aria-pressed={state.liked}
        className={`num flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors ${state.liked ? "text-[#f472b6]" : "text-ink-faint"} ${social.canLike ? "hover:text-[#f472b6]" : "cursor-default"}`}
      >
        <Heart size={13} fill={state.liked ? "currentColor" : "none"} aria-hidden />
        {state.likes > 0 && state.likes}
      </button>
      <Link href={social.board} title="This trail's leaderboard" className="text-ink-faint hover:text-accent">
        <Trophy size={13} aria-hidden />
      </Link>
    </div>
  );
}
