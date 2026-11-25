import { NextResponse } from "next/server";
import { caller } from "@/lib/api";
import { prisma } from "@/lib/db";

/** Follow or unfollow someone. Body: { "username": "dana", "follow": true | false } */
export async function POST(req: Request) {
  const me = await caller(req);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { username, follow } = (await req.json().catch(() => ({}))) as { username?: string; follow?: boolean };
  const them = await prisma.user.findUnique({ where: { username: String(username ?? "") } });
  if (!them || them.id === me.id) return NextResponse.json({ error: "No such skier." }, { status: 404 });
  const key = { followerId: me.id, followingId: them.id };
  if (follow !== false) await prisma.follow.upsert({ where: { followerId_followingId: key }, create: key, update: {} });
  else await prisma.follow.deleteMany({ where: key });
  return NextResponse.json({ following: follow !== false });
}
