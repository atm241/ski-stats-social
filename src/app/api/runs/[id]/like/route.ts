import { NextResponse } from "next/server";
import { caller } from "@/lib/api";
import { setRunLike } from "@/lib/runs";

/** Like or unlike someone's run. Body: { "like": true | false } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Sign in to like runs." }, { status: 401 });
  const { id } = await params;
  const { like } = (await req.json().catch(() => ({}))) as { like?: boolean };
  const r = await setRunLike(me.id, id, like !== false);
  return r ? NextResponse.json(r) : NextResponse.json({ error: "You can't like that run." }, { status: 400 });
}
