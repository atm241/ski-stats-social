import "server-only";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise prints to the server console
 * so sign-in links and import receipts still work in local development.
 * Returns whether the email actually left the building.
 */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n✉️  [email not sent: RESEND_API_KEY unset]\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Pow Pals <hello@example.com>", to: email.to, subject: email.subject, text: email.text }),
  });
  if (!res.ok) {
    console.error("sendEmail failed", res.status, await res.text());
    return false;
  }
  return true;
}
