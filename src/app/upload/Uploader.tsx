"use client";

import { Loader2, UploadCloud } from "lucide-react";
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
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center transition-colors ${
          dragging ? "border-accent bg-accent-dim" : "border-line-strong bg-surface hover:border-accent/60 hover:bg-raised"
        }`}
      >
        {busy ? <Loader2 size={28} className="animate-spin text-accent" aria-hidden /> : <UploadCloud size={28} className="text-accent" aria-hidden />}
        <span className="text-lg font-medium">{busy ? "Analysing your tracks…" : "Drop GPX files here"}</span>
        <span className="text-sm text-ink-soft">or click to choose. Multi-day files are split into days automatically.</span>
      </button>
      <input ref={input} type="file" accept=".gpx,application/gpx+xml" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />

      {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}

      {results.length > 0 && (
        <ul className="card divide-y divide-line overflow-hidden">
          {results.map((r, i) => (
            <li key={`${r.fileName}-${i}`} className="p-4">
              <div className="mb-1 truncate text-xs text-ink-faint">{r.fileName}</div>
              {r.error && <p className="text-sm text-bad">{r.error}</p>}
              {r.saved.map((d) => (
                <Link key={d.id} href={`/days/${d.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-raised">
                  <span>
                    <span className="font-medium">{prettyDate(d.localDate)}</span>
                    <span className="text-ink-soft"> · {d.resortName ?? "Backcountry"}</span>
                    {d.flagged && <span className="ml-2 text-xs text-warn">needs review</span>}
                  </span>
                  <span className="num font-semibold text-vert">+{feet(d.verticalM)} ft</span>
                </Link>
              ))}
              {r.notes.map((n) => (
                <p key={n} className="text-sm text-ink-soft">
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
