import { NextResponse } from "next/server";
import { apiDay, apiUser, caller } from "@/lib/api";
import type { ApiFeed } from "@/lib/apiTypes";
import { feedDays } from "@/lib/views";

export async function GET(req: Request) {
  const me = await caller(req);
  const { days } = await feedDays(me, 30);
  const body: ApiFeed = { me: me ? apiUser(me) : null, days: await Promise.all(days.map(apiDay)) };
  return NextResponse.json(body);
}
