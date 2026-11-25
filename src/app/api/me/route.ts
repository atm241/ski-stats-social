import { NextResponse } from "next/server";
import { deleteUserAccount } from "@/lib/account";
import { userFromRequest } from "@/lib/auth";

/** Lets the sync app check its token and show who it's connected as. */
export async function GET(req: Request) {
  const { user } = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ username: user.username, displayName: user.displayName });
}

/** Delete your account from the phone app. Body: { "confirm": "<your username>" }. */
export async function DELETE(req: Request) {
  const { user } = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (String(confirm ?? "").trim().toLowerCase() !== user.username) return NextResponse.json({ error: `Type ${user.username} to confirm.` }, { status: 400 });
  await deleteUserAccount(user);
  return NextResponse.json({ deleted: true });
}
