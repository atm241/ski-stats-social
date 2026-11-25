import { NextResponse } from "next/server";
import { apiUser, caller } from "@/lib/api";
import type { ApiPeople } from "@/lib/apiTypes";
import { appUrl } from "@/lib/magicLink";
import { inviteCodeFor, searchPeople, suggestions } from "@/lib/people";
import { followingIds, friendIds } from "@/lib/social";

/** ?q=… search, plus people you may know and your invite link (when signed in). */
export async function GET(req: Request) {
  const me = await caller(req);
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const [results, suggested, following, friends] = await Promise.all([
    searchPeople(q, me),
    me ? suggestions(me) : Promise.resolve([]),
    me ? followingIds(me.id) : Promise.resolve([]),
    me ? friendIds(me.id) : Promise.resolve([]),
  ]);
  const body: ApiPeople = {
    results: results.map((u) => ({ ...apiUser(u), following: following.includes(u.id), friend: friends.includes(u.id) })),
    suggestions: suggested.map((s) => ({ ...apiUser(s.user), following: false, reason: s.reason })),
    inviteUrl: me ? `${appUrl()}/invite/${await inviteCodeFor(me.id)}` : null,
  };
  return NextResponse.json(body);
}
