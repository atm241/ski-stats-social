/**
 * Simulates Postmark delivering an email with a GPX attachment to the local inbound webhook.
 *   npx tsx --env-file=.env scripts/send-test-email.ts <upload-address> [file.gpx]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const [to, file = "samples/vail-resort-day.gpx"] = process.argv.slice(2);
if (!to) throw new Error("usage: send-test-email.ts <upload-address> [file.gpx]");

const payload = {
  FromFull: { Email: "skier@example.com" },
  OriginalRecipient: to,
  ToFull: [{ Email: to }],
  Subject: "Ski day",
  Attachments: [{ Name: basename(file), ContentType: "application/gpx+xml", Content: readFileSync(file).toString("base64") }],
};
async function main() {
  const auth = Buffer.from(`inbound:${process.env.INBOUND_WEBHOOK_SECRET}`).toString("base64");
  const res = await fetch(`${process.env.APP_URL ?? "http://localhost:3000"}/api/inbound/postmark`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify(payload),
  });
  console.log(res.status, await res.text());
}

main();
