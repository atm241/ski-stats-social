import "server-only";
import { processGpx } from "./analysis/process";
import { prisma } from "./db";
import { saveDay } from "./days";
import { feet } from "./format";
import { GpxError } from "./gpx/parse";

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export interface IngestResult {
  fileName: string;
  saved: { id: string; localDate: string; resortName: string | null; verticalM: number; flagged: boolean }[];
  notes: string[];
  error?: string;
}

export const isGpxName = (name: string) => name.toLowerCase().endsWith(".gpx");

/**
 * The single path every file takes into the app (web upload, email, later the phone app):
 * analyze, save new days, and log the outcome in Upload so the user can see what happened.
 */
export async function ingestFile(userId: string, fileName: string, bytes: Buffer, source: "web" | "email"): Promise<IngestResult> {
  const r: IngestResult = { fileName, saved: [], notes: [] };
  if (!isGpxName(fileName)) r.error = "Only .gpx files are supported right now.";
  else if (bytes.length > MAX_FILE_BYTES) r.error = "File is larger than 30 MB.";
  else {
    try {
      const { days, skipped } = processGpx(bytes.toString("utf8"));
      r.notes.push(...skipped);
      for (const d of days) {
        const outcome = await saveDay(userId, d, source === "web" ? "gpx" : "email", fileName);
        if (outcome.status === "duplicate") r.notes.push(`${d.localDate}: already uploaded`);
        else r.saved.push({ id: outcome.day.id, localDate: d.localDate, resortName: d.resort?.name ?? null, verticalM: d.stats.verticalM, flagged: outcome.day.flagged });
      }
      if (days.length === 0 && skipped.length === 0) r.notes.push("No ski days found in this file.");
    } catch (e) {
      r.error = e instanceof GpxError ? e.message : "Couldn't read this file.";
      if (!(e instanceof GpxError)) console.error(e);
    }
  }

  await prisma.upload.create({
    data: {
      userId,
      source,
      fileName: fileName.slice(0, 200),
      status: r.error ? "error" : r.saved.length ? "imported" : r.notes.some((n) => n.endsWith("already uploaded")) ? "duplicate" : "skipped",
      message: summarize(r),
      dayIds: JSON.stringify(r.saved.map((d) => d.id)),
    },
  });
  return r;
}

export function summarize(r: IngestResult): string {
  if (r.error) return r.error;
  const parts = r.saved.map((d) => `${d.localDate} ${d.resortName ?? "Backcountry"} · +${feet(d.verticalM)} ft${d.flagged ? " (needs review)" : ""}`);
  return [...parts, ...r.notes].join("; ") || "Nothing imported.";
}
