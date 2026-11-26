import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { hashToken, newToken } from "./tokens";

export const SESSION_COOKIE = "pp_session";
const SESSION_DAYS = 30;

/** The signed-in user, or null. Memoized per request. */
export const currentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Call only from a Server Action or Route Handler (cookies are read-only during render). */
export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

/** API tokens look like "pp_<43 chars>" so they're recognisable if pasted somewhere they shouldn't be. */
export const API_TOKEN_PREFIX = "pp_";

/** Creates a personal API token (phone app sign-in, or scripts); returns the secret once (only its hash is stored). */
export async function createApiToken(userId: string, name: string) {
  const secret = API_TOKEN_PREFIX + newToken();
  await prisma.apiToken.create({ data: { userId, name: name.slice(0, 60) || "iPhone", tokenHash: hashToken(secret) } });
  return secret;
}

/** The user behind a request: a "Bearer pp_…" API token (phone app, scripts) or, failing that, the session cookie. */
export async function userFromRequest(req: Request): Promise<{ user: Awaited<ReturnType<typeof currentUser>>; via: "token" | "session" }> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith(`Bearer ${API_TOKEN_PREFIX}`)) {
    const row = await prisma.apiToken.findUnique({ where: { tokenHash: hashToken(auth.slice(7).trim()) }, include: { user: true } });
    if (!row) return { user: null, via: "token" };
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    return { user: row.user, via: "token" };
  }
  return { user: await currentUser(), via: "session" };
}
