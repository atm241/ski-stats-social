import "server-only";
import { APP_NAME } from "./brand";
import { prisma } from "./db";
import { sendEmail } from "./email";
import { type InboundEmail, tokenFromRecipients } from "./inbound";
import { ingestFile, isGpxName, summarize } from "./ingest";
import { appUrl } from "./magicLink";

const MAX_ATTACHMENTS = 20;

export type InboundOutcome = "no-account" | "no-attachments" | "processed";

/**
 * Imports GPX attachments for the account the address belongs to. The receipt always goes to
 * the account's own email, never the sender, so spoofed or spam mail can't bounce elsewhere.
 */
export async function handleInboundEmail(email: InboundEmail): Promise<InboundOutcome> {
  const token = tokenFromRecipients(email.recipients);
  const user = token ? await prisma.user.findUnique({ where: { uploadToken: token } }) : null;
  if (!user) return "no-account";

  const files = email.attachments.filter((a) => isGpxName(a.name) || /gpx/i.test(a.contentType)).slice(0, MAX_ATTACHMENTS);
  if (files.length === 0) {
    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: `${APP_NAME}: no GPX file found`,
        text: `We got your email "${email.subject}" but it had no .gpx attachment. In Slopes: open a day → ••• → Export As → GPX → Mail.`,
      });
    }
    return "no-attachments";
  }

  const lines: string[] = [];
  for (const f of files) {
    const name = isGpxName(f.name) ? f.name : `${f.name}.gpx`;
    const r = await ingestFile(user.id, name, f.content, "email");
    lines.push(`• ${name}: ${summarize(r)}`);
  }
  if (user.email) {
    await sendEmail({
      to: user.email,
      subject: `${APP_NAME}: import results`,
      text: `${lines.join("\n")}\n\nSee everything at ${appUrl()}/settings`,
    });
  }
  return "processed";
}
