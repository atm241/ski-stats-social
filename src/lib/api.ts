import "server-only";
import type { User } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import type { ApiDaySummary, ApiUser } from "./apiTypes";
import { userFromRequest } from "./auth";
import type { Day } from "./dayRecord";
import { mountainSlugForResort } from "./mountain/registry";

/** Server helpers for the JSON API the mobile app uses. */

export const apiUser = (u: Pick<User, "username" | "displayName" | "color">): ApiUser => ({ username: u.username, displayName: u.displayName, color: u.color });

export async function apiDay(d: Day & { user: User }): Promise<ApiDaySummary> {
  return {
    id: d.id,
    user: apiUser(d.user),
    localDate: d.localDate,
    resortName: d.resortName,
    kind: d.kind,
    verticalM: d.verticalM,
    uphillM: d.uphillM,
    distanceM: d.distanceM,
    maxSpeedMps: d.maxSpeedMps,
    runCount: d.runCount,
    liftCount: d.liftCount,
    flagged: d.flagged,
    mountain: await mountainSlugForResort(d.resortName),
  };
}

/** The caller (Bearer token from the app, or the browser session), or null. */
export async function caller(req: Request) {
  return (await userFromRequest(req)).user;
}

export const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });
