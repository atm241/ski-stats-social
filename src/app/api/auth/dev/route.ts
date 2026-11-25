import { NextResponse } from "next/server";
import { createApiToken } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Local development only: sign the phone app in as a seeded demo skier (like the web's demo buttons). */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { username } = (await req.json().catch(() => ({}))) as { username?: string };
  const user = await prisma.user.findFirst({ where: { username: String(username ?? ""), email: null } });
  if (!user) return NextResponse.json({ error: "No demo skier by that name." }, { status: 404 });
  return NextResponse.json({ token: await createApiToken(user.id, "Gapr app (dev)") });
}
