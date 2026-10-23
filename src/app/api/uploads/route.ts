import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ingestFile, type IngestResult } from "@/lib/ingest";

const MAX_FILES = 50;

export type UploadFileResult = IngestResult;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const files = (await req.formData()).getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "No files received." }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Upload at most ${MAX_FILES} files at a time.` }, { status: 400 });

  const results: IngestResult[] = [];
  for (const file of files) results.push(await ingestFile(user.id, file.name, Buffer.from(await file.arrayBuffer()), "web"));
  return NextResponse.json({ results });
}
