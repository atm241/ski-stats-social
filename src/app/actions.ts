"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, currentUser, destroySession } from "@/lib/auth";
import { AVATAR_COLORS, AVATAR_EMOJI } from "@/lib/avatars";
import { prisma } from "@/lib/db";
import { normalizeEmail, redeemLoginLink, requestLoginLink } from "@/lib/magicLink";
import { newUploadToken } from "@/lib/tokens";

export type LinkState = { sentTo?: string; devLink?: string; error?: string };

export async function requestLink(_: LinkState, form: FormData): Promise<LinkState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "That doesn't look like an email address." };
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
