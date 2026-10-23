import { NextResponse } from "next/server";
import { fromPostmark, type PostmarkInbound } from "@/lib/inbound";
import { handleInboundEmail } from "@/lib/inboundHandler";
import { safeEqual } from "@/lib/tokens";

/**
 * Postmark inbound webhook. Configure the webhook URL in Postmark as
 *   https://<user>:<INBOUND_WEBHOOK_SECRET>@<your-domain>/api/inbound/postmark
 * (Postmark sends those credentials as HTTP Basic auth).
 */
export async function POST(req: Request) {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Inbound email is not configured." }, { status: 503 });

  const auth = req.headers.get("authorization") ?? "";
  const password = auth.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString().split(":").slice(1).join(":") : "";
  if (!safeEqual(password, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: PostmarkInbound;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // Always 200 for well-formed mail (even unknown addresses) so Postmark doesn't retry it.
  const outcome = await handleInboundEmail(fromPostmark(payload));
  return NextResponse.json({ outcome });
}
