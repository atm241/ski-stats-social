import { NextResponse } from "next/server";
import { API_TOKEN_PREFIX } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";

/** The phone app signing out: revokes the API token it was using, so it drops off Settings too. */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith(`Bearer ${API_TOKEN_PREFIX}`)) await prisma.apiToken.deleteMany({ where: { tokenHash: hashToken(auth.slice(7).trim()) } });
  return NextResponse.json({ signedOut: true });
}
