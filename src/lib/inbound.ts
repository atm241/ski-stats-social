import { UPLOAD_TOKEN_LENGTH } from "./tokens";

/*
 * Email-to-upload. Every account has a secret address, <uploadToken>@INBOUND_DOMAIN.
 * The inbound email provider (Postmark today) POSTs each message to /api/inbound/postmark;
 * we find the account from the recipient address and import any GPX attachments.
 * Kept free of server-only imports so the parsing is unit-testable.
 */

export const inboundDomain = () => (process.env.INBOUND_DOMAIN ?? "upload.localhost").toLowerCase();

export interface InboundEmail {
  recipients: string[];
  from: string;
  subject: string;
  attachments: { name: string; contentType: string; content: Buffer }[];
}

/** The upload token from whichever recipient is on our inbound domain, or null. */
export function tokenFromRecipients(recipients: string[], domain = inboundDomain()): string | null {
  const re = new RegExp(`^[a-z0-9]{${UPLOAD_TOKEN_LENGTH}}$`);
  for (const raw of recipients) {
    const addr = raw.trim().toLowerCase().replace(/^.*<(.+)>$/, "$1");
    const at = addr.lastIndexOf("@");
    if (at < 0 || addr.slice(at + 1) !== domain) continue;
    const local = addr.slice(0, at).split("+")[0];
    if (re.test(local)) return local;
  }
  return null;
}

interface PostmarkAddress {
  Email?: string;
}
export interface PostmarkInbound {
  FromFull?: PostmarkAddress;
  From?: string;
  OriginalRecipient?: string;
  ToFull?: PostmarkAddress[];
  CcFull?: PostmarkAddress[];
  BccFull?: PostmarkAddress[];
  Subject?: string;
  Attachments?: { Name?: string; ContentType?: string; Content?: string }[];
}

/** Maps Postmark's inbound webhook JSON to our provider-neutral shape. */
export function fromPostmark(p: PostmarkInbound): InboundEmail {
  const recipients = [p.OriginalRecipient, ...[...(p.ToFull ?? []), ...(p.CcFull ?? []), ...(p.BccFull ?? [])].map((a) => a.Email)].filter((x): x is string => !!x);
  return {
    recipients,
    from: p.FromFull?.Email ?? p.From ?? "",
    subject: p.Subject ?? "",
    attachments: (p.Attachments ?? []).map((a) => ({
      name: a.Name ?? "attachment",
      contentType: a.ContentType ?? "application/octet-stream",
      content: Buffer.from(a.Content ?? "", "base64"),
    })),
  };
}
