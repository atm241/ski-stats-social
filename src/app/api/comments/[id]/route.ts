import { NextResponse } from "next/server";
import { caller } from "@/lib/api";
import { deleteComment } from "@/lib/comments";

/** Delete a comment (yours, or any on your own day). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id } = await params;
  return (await deleteComment(me.id, id)) ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
