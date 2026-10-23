"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { UploadFileResult } from "../api/uploads/route";
import { feet, prettyDate } from "@/lib/format";

export function Uploader() {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<UploadFileResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | File[]) {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    const body = new FormData();
    for (const f of files) body.append("files", f);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Upload failed.");
      else setResults((prev) => [...json.results, ...prev]);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition ${
          dragging ? "border-sky bg-sky-soft" : "border-[#c6d6f0] bg-white hover:border-sky hover:bg-sky-soft/50"
        }`}
      >
        <span className="text-5xl" aria-hidden>
          {busy ? "⏳" : "🗻"}
        </span>
        <span className="font-display text-xl font-semibold">{busy ? "Crunching your vert…" : "Drop GPX files here"}</span>
        <span className="text-sm text-ink-soft">or click to choose. Multi-day files are split into days automatically.</span>
      </button>
      <input ref={input} type="file" accept=".gpx,application/gpx+xml" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />

      {error && <p className="rounded-2xl bg-berry-soft px-4 py-3 text-sm font-semibold text-berry">{error}</p>}

      {results.length > 0 && (
        <ul className="space-y-2">
          {results.map((r, i) => (
            <li key={`${r.fileName}-${i}`} className="card p-4">
              <div className="mb-1 truncate text-sm font-bold text-ink-soft">{r.fileName}</div>
              {r.error && <p className="text-sm font-semibold text-berry">{r.error}</p>}
              {r.saved.map((d) => (
                <Link key={d.id} href={`/days/${d.id}`} className="flex items-center justify-between gap-3 rounded-2xl px-2 py-1.5 hover:bg-snow">
                  <span>
                    <span className="font-semibold">{prettyDate(d.localDate)}</span>
                    <span className="text-ink-soft"> · {d.resortName ?? "Backcountry"}</span>
                    {d.flagged && <span className="chip ml-2 bg-sun-soft text-[#a06e00]">needs review</span>}
                  </span>
                  <span className="font-display font-semibold tabular-nums text-sky-deep">+{feet(d.verticalM)} ft</span>
                </Link>
              ))}
              {r.notes.map((n) => (
                <p key={n} className="px-2 text-sm text-ink-soft">
                  {n}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
