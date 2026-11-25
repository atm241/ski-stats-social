import { NextResponse } from "next/server";
import { apiDay, apiUser, caller } from "@/lib/api";
import type { ApiFeed } from "@/lib/apiTypes";
import { prisma } from "@/lib/db";
import { followingIds } from "@/lib/social";

/** Recent days from you and the people you follow (everyone's, if you follow nobody yet). */
export async function GET(req: Request) {
  const me = await caller(req);
  const following = me ? await followingIds(me.id) : [];
  const users = me && following.length ? [me.id, ...following] : null;
  const days = await prisma.skiDay.findMany({
    where: users ? { userId: { in: users } } : undefined,
    orderBy: [{ localDate: "desc" }, { startedAt: "desc" }],
    take: 30,
    include: { user: true },
  });
  const body: ApiFeed = { me: me ? apiUser(me) : null, days: await Promise.all(days.map(apiDay)) };
  return NextResponse.json(body);
}
