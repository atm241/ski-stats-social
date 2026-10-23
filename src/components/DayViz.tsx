"use client";

import { useMemo, useRef, useState } from "react";
import type { StoredTrack } from "@/lib/analysis/process";
import type { Segment, SegmentKind } from "@/lib/analysis/types";

type Kind = SegmentKind | "other";

// Validated (dataviz/validate_palette.js): run↔skin pass CVD separation; lifts are a
// recessive dashed neutral so they're never distinguished by hue alone.
const STYLE: Record<Kind, { stroke: string; dash?: string; width: number; label: string }> = {
  run: { stroke: "#2f7fe0", width: 2.5, label: "Run" },
  skin: { stroke: "#d9822b", width: 2.5, label: "Skin / hike" },
  lift: { stroke: "#9aa5bd", dash: "5 4", width: 2, label: "Lift" },
  drive: { stroke: "#d5dbe8", dash: "1 4", width: 1.5, label: "Drive" },
  other: { stroke: "#c4cde0", width: 1.5, label: "Other" },
};

const FT = 3.28084;
const W = 720;
const H = 300;
const PAD = { l: 52, r: 12, t: 12, b: 26 };

interface Pt {
  t: number;
  lat: number;
  lon: number;
  ele: number;
  kind: Kind;
}

/** Split points into consecutive same-kind runs, sharing the boundary point so lines connect. */
function pieces(pts: Pt[]) {
  const out: { kind: Kind; pts: Pt[] }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const last = out.at(-1);
    if (last && last.kind === pts[i].kind) last.pts.push(pts[i]);
    else out.push({ kind: pts[i].kind, pts: i > 0 ? [pts[i - 1], pts[i]] : [pts[i]] });
  }
  return out;
}

export function DayViz({ track, segments, timeZone }: { track: StoredTrack; segments: Segment[]; timeZone: string }) {
  const pts: Pt[] = useMemo(
    () =>
      track.pts.map(([dt, lat, lon, ele]) => {
        const t = track.t0 + dt * 1000;
        const seg = segments.find((s) => t >= s.startT && t <= s.endT);
        return { t, lat, lon, ele, kind: seg?.kind ?? "other" };
      }),
    [track, segments],
  );
  const parts = useMemo(() => pieces(pts), [pts]);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Elevation profile scales
  const t0 = pts[0].t;
  const t1 = pts.at(-1)!.t;
  const eMin = Math.min(...pts.map((p) => p.ele));
  const eMax = Math.max(...pts.map((p) => p.ele));
  const ePad = Math.max(20, (eMax - eMin) * 0.08);
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (e: number) => PAD.t + (1 - (e - (eMin - ePad)) / (eMax - eMin + 2 * ePad)) * (H - PAD.t - PAD.b);
  const ticks = niceTicks(eMin * FT, eMax * FT, 4);
  const hourTicks = useMemo(() => {
    const out: number[] = [];
    const first = Math.ceil(t0 / 3600000) * 3600000;
    for (let t = first; t <= t1; t += 3600000) out.push(t);
    const step = Math.ceil(out.length / 7);
    return out.filter((_, i) => i % step === 0);
  }, [t0, t1]);

  // Trail map: equirectangular projection, scaled to fit a square
  const map = useMemo(() => {
    const lats = pts.map((p) => p.lat);
    const lons = pts.map((p) => p.lon);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const kx = Math.cos((midLat * Math.PI) / 180);
    const minX = Math.min(...lons) * kx;
    const maxX = Math.max(...lons) * kx;
    const minY = Math.min(...lats);
    const maxY = Math.max(...lats);
    const S = 300;
    const pad = 16;
    const scale = (S - 2 * pad) / Math.max(maxX - minX, maxY - minY, 1e-6);
    const ox = (S - (maxX - minX) * scale) / 2;
    const oy = (S - (maxY - minY) * scale) / 2;
    return { S, px: (p: Pt) => ox + (p.lon * kx - minX) * scale, py: (p: Pt) => S - (oy + (p.lat - minY) * scale) };
  }, [pts]);

  const onMove = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((sx - PAD.l) / (W - PAD.l - PAD.r)) * (t1 - t0);
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    setHover(lo);
  };

  const hp = hover != null ? pts[hover] : null;
  const usedKinds = (["run", "lift", "skin", "drive"] as Kind[]).filter((k) => pts.some((p) => p.kind === k));
  const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_300px]">
      <figure className="card p-4">
        <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-lg font-semibold">Elevation through the day</span>
          <Legend kinds={usedKinds} />
        </figcaption>
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full touch-none select-none"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label="Elevation profile of the day, coloured by runs, lifts and skinning"
          >
            {ticks.map((ft) => (
              <g key={ft}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(ft / FT)} y2={y(ft / FT)} stroke="#eef2f9" />
                <text x={PAD.l - 8} y={y(ft / FT)} textAnchor="end" dominantBaseline="middle" className="fill-ink-soft text-[11px]">
                  {ft.toLocaleString()}
                </text>
              </g>
            ))}
            {hourTicks.map((t) => (
              <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className="fill-ink-soft text-[11px]">
                {fmtTime(t)}
              </text>
            ))}
            <path
              d={`M${x(t0)},${H - PAD.b} ${pts.map((p) => `L${x(p.t).toFixed(1)},${y(p.ele).toFixed(1)}`).join(" ")} L${x(t1)},${H - PAD.b} Z`}
              fill="#e3f2ff"
              opacity="0.7"
            />
            {parts.map((part, i) => (
              <polyline
                key={i}
                points={part.pts.map((p) => `${x(p.t).toFixed(1)},${y(p.ele).toFixed(1)}`).join(" ")}
                fill="none"
                stroke={STYLE[part.kind].stroke}
                strokeWidth={STYLE[part.kind].width}
                strokeDasharray={STYLE[part.kind].dash}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {hp && (
              <g pointerEvents="none">
                <line x1={x(hp.t)} x2={x(hp.t)} y1={PAD.t} y2={H - PAD.b} stroke="#1f2b4d" strokeOpacity="0.35" />
                <circle cx={x(hp.t)} cy={y(hp.ele)} r="5" fill={STYLE[hp.kind].stroke} stroke="#fff" strokeWidth="2" />
              </g>
            )}
          </svg>
          {hp && (
            <div
              className="pointer-events-none absolute top-0 rounded-xl bg-ink px-3 py-1.5 text-xs text-white shadow-lg"
              style={{ left: `${(x(hp.t) / W) * 100}%`, transform: x(hp.t) > W * 0.7 ? "translateX(calc(-100% - 10px))" : "translateX(10px)" }}
            >
              <div className="font-display text-sm font-semibold">{Math.round(hp.ele * FT).toLocaleString()} ft</div>
              <div className="flex items-center gap-1.5 opacity-80">
                <svg width="14" height="4" aria-hidden>
                  <line x1="0" x2="14" y1="2" y2="2" stroke={STYLE[hp.kind].stroke} strokeWidth="3" strokeDasharray={STYLE[hp.kind].dash} />
                </svg>
                {STYLE[hp.kind].label} · {fmtTime(hp.t)}
              </div>
            </div>
          )}
        </div>
      </figure>

      <figure className="card overflow-hidden p-4">
        <figcaption className="mb-2 font-display text-lg font-semibold">Your lines</figcaption>
        <svg viewBox={`0 0 ${map.S} ${map.S}`} className="w-full rounded-2xl bg-[radial-gradient(circle_at_30%_20%,#f7fbff,#e9f2ff)]" role="img" aria-label="Map of the day's tracks">
          {parts.map((part, i) => (
            <polyline
              key={i}
              points={part.pts.map((p) => `${map.px(p).toFixed(1)},${map.py(p).toFixed(1)}`).join(" ")}
              fill="none"
              stroke={STYLE[part.kind].stroke}
              strokeWidth={STYLE[part.kind].width}
              strokeDasharray={STYLE[part.kind].dash}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={part.kind === "run" || part.kind === "skin" ? 0.85 : 1}
            />
          ))}
          <circle cx={map.px(pts[0])} cy={map.py(pts[0])} r="6" fill="#34c49a" stroke="#fff" strokeWidth="2" />
          {hp && <circle cx={map.px(hp)} cy={map.py(hp)} r="7" fill="#ff6b9a" stroke="#fff" strokeWidth="2.5" />}
        </svg>
        <p className="mt-2 text-xs text-ink-soft">Green dot = where you started. Hover the chart to follow along.</p>
      </figure>
    </div>
  );
}

function Legend({ kinds }: { kinds: Kind[] }) {
  return (
    <ul className="flex flex-wrap gap-3 text-xs font-semibold text-ink-soft">
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="1" x2="17" y1="3" y2="3" stroke={STYLE[k].stroke} strokeWidth="3" strokeDasharray={STYLE[k].dash} strokeLinecap="round" />
          </svg>
          {STYLE[k].label}
        </li>
      ))}
    </ul>
  );
}

function niceTicks(min: number, max: number, count: number) {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Math.round(v));
  return out;
}
