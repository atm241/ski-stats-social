import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { processGpx } from "@/lib/analysis/process";
import { saveDay } from "@/lib/days";
import { GpxError } from "@/lib/gpx/parse";

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_FILES = 50;

export interface UploadFileResult {
  fileName: string;
  saved: { id: string; localDate: string; resortName: string | null; verticalM: number; flagged: boolean }[];
  notes: string[];
  error?: string;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const files = (await req.formData()).getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files received." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at a time.` }, { status: 400 });

  const results: UploadFileResult[] = [];
  for (const file of files) {
    const r: UploadFileResult = { fileName: file.name, saved: [], notes: [] };
    results.push(r);
    if (!file.name.toLowerCase().endsWith(".gpx")) {
      r.error = "Only .gpx files are supported right now.";
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      r.error = "File is larger than 30 MB.";
      continue;
    }
    try {
      const { days, skipped } = processGpx(await file.text());
      r.notes.push(...skipped);
      for (const d of days) {
        const outcome = await saveDay(user.id, d, "gpx", file.name);
        if (outcome.status === "duplicate") r.notes.push(`${d.localDate}: already uploaded`);
        else r.saved.push({ id: outcome.day.id, localDate: d.localDate, resortName: d.resort?.name ?? null, verticalM: d.stats.verticalM, flagged: outcome.day.flagged });
      }
    } catch (e) {
      r.error = e instanceof GpxError ? e.message : "Couldn't read this file.";
      if (!(e instanceof GpxError)) console.error(e);
    }
  }
  return NextResponse.json({ results });
}
