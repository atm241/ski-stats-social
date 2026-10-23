import "server-only";
import { AVATAR_COLORS, AVATAR_EMOJI } from "./avatars";
import { APP_NAME } from "./brand";
import { prisma } from "./db";
import { sendEmail } from "./email";
import { hashToken, newToken, newUploadToken } from "./tokens";

const LINK_TTL_MS = 15 * 60 * 1000;
const MAX_LINKS_PER_WINDOW = 5;

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

export type LinkRequest = { ok: true; devLink?: string } | { ok: false; error: string };

export async function requestLoginLink(email: string): Promise<LinkRequest> {
  const recent = await prisma.loginToken.count({ where: { email, createdAt: { gt: new Date(Date.now() - LINK_TTL_MS) } } });
  if (recent >= MAX_LINKS_PER_WINDOW) return { ok: false, error: "Too many sign-in emails. Try again in a few minutes." };

  const token = newToken();
  await prisma.loginToken.create({ data: { email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_TTL_MS) } });
  const link = `${appUrl()}/auth/verify?token=${token}`;
  const delivered = await sendEmail({
    to: email,
    subject: `Your ${APP_NAME} sign-in link`,
    text: `Tap to sign in to ${APP_NAME}:\n\n${link}\n\nThe link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`,
  });
  // Without an email provider in dev, hand the link back so the page can show it.
  return { ok: true, devLink: !delivered && process.env.NODE_ENV !== "production" ? link : undefined };
}

/** Consumes a link token. Returns the user (created on first sign-in) or null if invalid/expired/used. */
export async function redeemLoginLink(token: string) {
  const row = await prisma.loginToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  // Conditional update so two concurrent redemptions can't both succeed.
  const { count } = await prisma.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count !== 1) return null;

  const existing = await prisma.user.findUnique({ where: { email: row.email } });
  if (existing) return { user: existing, isNew: false };

  const base = row.email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16).padEnd(3, "0");
  let username = base;
  for (let n = 2; await prisma.user.findUnique({ where: { username } }); n++) username = `${base}${n}`;
  const colors = Object.keys(AVATAR_COLORS);
  const user = await prisma.user.create({
    data: {
      email: row.email,
      uploadToken: newUploadToken(),
      username,
      displayName: base,
      avatar: AVATAR_EMOJI[Math.floor(Math.random() * AVATAR_EMOJI.length)],
      color: colors[Math.floor(Math.random() * colors.length)],
    },
  });
  return { user, isNew: true };
}
