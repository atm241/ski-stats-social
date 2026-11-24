import { NextResponse } from "next/server";
import { userFromRequest } from "@/lib/auth";

/** Lets the sync app check its token and show who it's connected as. */
export async function GET(req: Request) {
  const { user } = await userFromRequest(req);
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ username: user.username, displayName: user.displayName });
}
