import { NextResponse } from "next/server";
import { normalizeEmail, requestLoginLink } from "@/lib/magicLink";
import { clientIp, rateLimit } from "@/lib/rateLimit";

/** The phone app asks for a sign-in email. The link in it ends by opening the app with a token. */
export async function POST(req: Request) {
  if (!(await rateLimit(`login-ip:${clientIp(req.headers)}`, 10, 15 * 60_000))) return NextResponse.json({ error: "Too many sign-in emails from here. Try again in a few minutes." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(String(body.email ?? ""));
  if (!email) return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  const r = await requestLoginLink(email, { app: true });
  return r.ok ? NextResponse.json({ sentTo: email, devLink: r.devLink }) : NextResponse.json({ error: r.error }, { status: 429 });
}
