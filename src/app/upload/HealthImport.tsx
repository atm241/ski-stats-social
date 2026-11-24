"use client";

import { Check, HeartPulse, Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { feet, prettyDate } from "@/lib/format";
import { extractRoutes, findSkiWorkouts } from "@/lib/healthExport";
import type { UploadFileResult } from "../api/uploads/route";

type Phase = { kind: "idle" } | { kind: "scan" | "extract"; pct: number } | { kind: "upload"; done: number; total: number } | { kind: "done" } | { kind: "error"; message: string };

const BATCH = 10;

/** Import ski & snowboard workouts from an Apple Health export.zip, filtering on this device. */
export function HealthImport() {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [found, setFound] = useState(0);
  const [results, setResults] = useState<UploadFileResult[]>([]);

  async function run(file: File) {
    setResults([]);
    try {
      setPhase({ kind: "scan", pct: 0 });
      const workouts = await findSkiWorkouts(file, (r, t) => setPhase({ kind: "scan", pct: r / t }));
      setFound(workouts.length);
      if (!workouts.length) {
        setPhase({ kind: "error", message: "No skiing or snowboarding workouts with GPS routes in this export. Record them with the Workout app's Downhill Skiing or Snowboarding type." });
        return;
      }
      setPhase({ kind: "extract", pct: 0 });
      const routes = await extractRoutes(
        file,
        workouts.map((w) => w.routePath),
        (r, t) => setPhase({ kind: "extract", pct: r / t }),
      );
      const all: UploadFileResult[] = [];
      for (let i = 0; i < routes.length; i += BATCH) {
        setPhase({ kind: "upload", done: i, total: routes.length });
        const body = new FormData();
        body.append("source", "health");
        for (const r of routes.slice(i, i + BATCH)) body.append("files", new File([r.gpx], r.name, { type: "application/gpx+xml" }));
        const res = await fetch("/api/uploads", { method: "POST", body });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Upload failed.");
        all.push(...json.results);
        setResults([...all]);
      }
      setPhase({ kind: "done" });
    } catch (e) {
      setPhase({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong reading the export." });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const busy = phase.kind === "scan" || phase.kind === "extract" || phase.kind === "upload";
  const saved = results.flatMap((r) => r.saved);
  const dupes = results.reduce((n, r) => n + r.notes.filter((x) => x.includes("already uploaded")).length, 0);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-start gap-3 border-b border-line p-5">
        <HeartPulse size={20} className="mt-0.5 shrink-0 text-bad" aria-hidden />
        <div>
          <h2 className="font-medium">Apple Watch &amp; iPhone</h2>
          <p className="mt-1 text-sm text-ink-soft">Import every ski and snowboard workout from Apple Health. No Strava needed, and top speed comes from your watch&apos;s own GPS speed.</p>
        </div>
      </div>
      <div className="space-y-4 p-5 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-ink-soft marker:text-ink-faint">
          <li>
            On your iPhone open <span className="text-ink">Health</span> → tap your picture → <span className="text-ink">Export All Health Data</span>.
          </li>
          <li>Send the export.zip to this computer (AirDrop, iCloud Drive or Files).</li>
          <li>Choose it below.</li>
        </ol>
        <p className="flex items-center gap-2 text-xs text-ink-faint">
          <Lock size={12} aria-hidden /> The zip is read in your browser. Only ski &amp; snowboard GPS routes are uploaded; heart rate, steps and everything else stay here.
        </p>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
          {phase.kind === "scan"
            ? `Scanning export… ${Math.round(phase.pct * 100)}%`
            : phase.kind === "extract"
              ? `Reading ${found} ski workouts… ${Math.round(phase.pct * 100)}%`
              : phase.kind === "upload"
                ? `Analysing ${phase.done}/${phase.total}…`
                : "Choose export.zip"}
        </button>
        <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} />

        {phase.kind === "error" && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-bad">{phase.message}</p>}
        {phase.kind === "done" && (
          <p className="flex items-center gap-2 text-good">
            <Check size={15} aria-hidden /> {saved.length} new {saved.length === 1 ? "day" : "days"} imported{dupes ? `, ${dupes} already here` : ""}.
          </p>
        )}
        {saved.length > 0 && (
          <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {saved.map((d) => (
              <li key={d.id}>
                <Link href={`/days/${d.id}`} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-raised">
                  <span>
                    {prettyDate(d.localDate)} <span className="text-ink-soft">· {d.resortName ?? "Backcountry"}</span>
                  </span>
                  <span className="num text-vert">+{feet(d.verticalM)} ft</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
