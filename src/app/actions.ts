"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createApiToken, createSession, currentUser, destroySession } from "@/lib/auth";
import { AVATAR_COLORS, AVATAR_EMOJI } from "@/lib/avatars";
import { prisma } from "@/lib/db";
import { normalizeEmail, redeemLoginLink, requestLoginLink } from "@/lib/magicLink";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { newUploadToken } from "@/lib/tokens";

export type LinkState = { sentTo?: string; devLink?: string; error?: string };

export async function requestLink(_: LinkState, form: FormData): Promise<LinkState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "That doesn't look like an email address." };
  // per address is limited in requestLoginLink; this stops one sender mailing many addresses
  if (!rateLimit(`login-ip:${clientIp(await headers())}`, 10, 15 * 60_000)) return { error: "Too many sign-in emails from here. Try again in a few minutes." };
  const r = await requestLoginLink(email);
  return r.ok ? { sentTo: email, devLink: r.devLink } : { error: r.error };
}

/** POSTed from the /auth/verify page (not GET, so email link scanners can't burn the token). */
export async function verifyLogin(form: FormData) {
  const result = await redeemLoginLink(String(form.get("token") ?? ""));
  if (!result) redirect("/login?expired=1");
  await createSession(result.user.id);
  redirect(result.isNew ? "/settings?welcome=1" : "/");
}

/** Local development only: sign in as a seeded demo skier without email. */
export async function devSignIn(username: string) {
  if (process.env.NODE_ENV === "production") return;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return;
  await createSession(user.id);
  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}

export type ProfileState = { error?: string; saved?: boolean };

export async function updateProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const me = await currentUser();
  if (!me) redirect("/login");

  const username = String(form.get("username") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { error: "Usernames are 3–20 letters, numbers or underscores." };
  const taken = await prisma.user.findFirst({ where: { username, NOT: { id: me.id } } });
  if (taken) return { error: "That username is taken." };

  const avatar = String(form.get("avatar") ?? "");
  const color = String(form.get("color") ?? "");
  await prisma.user.update({
    where: { id: me.id },
    data: {
      username,
      displayName: String(form.get("displayName") ?? "").trim().slice(0, 40) || username,
      avatar: AVATAR_EMOJI.includes(avatar) ? avatar : me.avatar,
      color: color in AVATAR_COLORS ? color : me.color,
    },
  });
  revalidatePath("/", "layout");
  return { saved: true };
}

/** Creates the upload address on first use, or replaces it (the old one stops working). */
export async function regenerateUploadAddress() {
  const me = await currentUser();
  if (!me) redirect("/login");
  await prisma.user.update({ where: { id: me.id }, data: { uploadToken: newUploadToken() } });
  revalidatePath("/settings");
}

export async function deleteDay(dayId: string) {
  const me = await currentUser();
  const day = await prisma.skiDay.findUnique({ where: { id: dayId }, include: { user: true } });
  if (!me || !day || day.userId !== me.id) return;
  await prisma.skiDay.delete({ where: { id: dayId } });
  redirect(`/u/${day.user.username}`);
}

/** Follow or unfollow another skier (from their profile). */
export async function setFollow(username: string, follow: boolean) {
  const me = await currentUser();
  if (!me) redirect("/login");
  const them = await prisma.user.findUnique({ where: { username } });
  if (!them || them.id === me.id) return;
  const key = { followerId: me.id, followingId: them.id };
  if (follow) await prisma.follow.upsert({ where: { followerId_followingId: key }, create: key, update: {} });
  else await prisma.follow.deleteMany({ where: key });
  revalidatePath(`/u/${username}`);
  revalidatePath("/");
  revalidatePath("/leaderboard");
}

export type TokenState = { secret?: string; error?: string };

/** Creates an API token for the iPhone sync app; the secret is returned once to show the user. */
export async function createSyncToken(_: TokenState, form: FormData): Promise<TokenState> {
  const me = await currentUser();
  if (!me) redirect("/login");
  const secret = await createApiToken(me.id, String(form.get("name") ?? "iPhone"));
  revalidatePath("/settings");
  return { secret };
}

export async function revokeSyncToken(id: string) {
  const me = await currentUser();
  if (!me) redirect("/login");
  await prisma.apiToken.deleteMany({ where: { id, userId: me.id } });
  revalidatePath("/settings");
}

/** Join or leave the public leaderboard (friends boards always include you). */
export async function setGlobalBoard(join: boolean) {
  const me = await currentUser();
  if (!me) redirect("/login");
  await prisma.user.update({ where: { id: me.id }, data: { globalBoard: join } });
  revalidatePath("/", "layout");
}
