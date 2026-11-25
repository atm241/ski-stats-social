import { NextResponse } from "next/server";
import { userFromRequest } from "@/lib/auth";
import { ingestFile, type IngestResult } from "@/lib/ingest";
import { rateLimit } from "@/lib/rateLimit";

const MAX_FILES = 50;
/** Whole request, checked before anything is read into memory (each file is also capped at 30 MB). */
const MAX_REQUEST_BYTES = 100 * 1024 * 1024;

export type UploadFileResult = IngestResult;

/**
 * GPX upload. Browser: multipart "files" with the session cookie. Sync app: same body with
 * "Authorization: Bearer pp_…" and source=health.
 */
export async function POST(req: Request) {
  const { user, via } = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: via === "token" ? "That token was revoked or is invalid." : "Sign in first." }, { status: 401 });

  const size = Number(req.headers.get("content-length") ?? 0);
  if (size > MAX_REQUEST_BYTES) return NextResponse.json({ error: "That upload is too big. Send at most 100 MB at a time." }, { status: 413 });
  if (!rateLimit(`upload:${user.id}`, 60, 10 * 60_000)) return NextResponse.json({ error: "Too many uploads at once. Try again in a few minutes." }, { status: 429 });

  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files received." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at a time.` }, { status: 400 });
  const source = form.get("source") === "health" ? "health" : "web";

  const results: IngestResult[] = [];
  for (const file of files) results.push(await ingestFile(user.id, file.name, Buffer.from(await file.arrayBuffer()), source));
  return NextResponse.json({ results });
}
