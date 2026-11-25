import "server-only";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise, in local development, prints it to the
 * server console so sign-in links and import receipts still work.
 * Returns whether the email actually left the building.
 */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // Local dev only: show the email (it may hold a sign-in link) in the terminal. In production the
    // body never goes to logs, since anyone who can read them could sign in as the recipient.
    if (process.env.NODE_ENV === "production") console.error(`sendEmail: RESEND_API_KEY unset, dropped "${email.subject}"`);
    else console.log(`\n✉️  [email not sent: RESEND_API_KEY unset]\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Gapr <hello@example.com>", to: email.to, subject: email.subject, text: email.text }),
  });
  if (!res.ok) {
    console.error("sendEmail failed", res.status, await res.text());
    return false;
  }
  return true;
}
