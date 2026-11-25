import { NextResponse } from "next/server";
import { caller } from "@/lib/api";
import { addComment } from "@/lib/comments";

/** Comment on a day from the app. Body: { "body": "…" } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });
  const { id } = await params;
  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  const r = await addComment(me.id, id, String(body ?? ""));
  return r.ok ? NextResponse.json({ ok: true }, { status: 201 }) : NextResponse.json({ error: r.error }, { status: 400 });
}
