"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createApiToken, createSession, currentUser, destroySession, SESSION_COOKIE } from "@/lib/auth";
import { AVATAR_COLORS, AVATAR_EMOJI } from "@/lib/avatars";
import { prisma } from "@/lib/db";
import { deleteSkiDay } from "@/lib/days";
import { normalizeEmail, redeemLoginLink, requestLoginLink } from "@/lib/magicLink";
import { deleteUserAccount } from "@/lib/account";
import { addComment, deleteComment } from "@/lib/comments";
import { becomeFriends, inviterFor } from "@/lib/people";
import { setRunLike } from "@/lib/runs";
import { APP_SCHEME } from "@/lib/brand";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { savePrivacy, setDayVisibility } from "@/lib/privacy";
import { isVisibility } from "@/lib/visibility";
import { safeNext } from "@/lib/nextPath";
import { newUploadToken } from "@/lib/tokens";

export type LinkState = { sentTo?: string; devLink?: string; error?: string };

export async function requestLink(_: LinkState, form: FormData): Promise<LinkState> {
  const email = normalizeEmail(String(form.get("email") ?? ""));
  if (!email) return { error: "That doesn't look like an email address." };
  // per address is limited in requestLoginLink; this stops one sender mailing many addresses
  if (!(await rateLimit(`login-ip:${clientIp(await headers())}`, 10, 15 * 60_000))) return { error: "Too many sign-in emails from here. Try again in a few minutes." };
  const r = await requestLoginLink(email, { next: safeNext(form.get("next")) });
  return r.ok ? { sentTo: email, devLink: r.devLink } : { error: r.error };
}

/** POSTed from the /auth/verify page (not GET, so email link scanners can't burn the token). */
export async function verifyLogin(form: FormData) {
  const result = await redeemLoginLink(String(form.get("token") ?? ""));
  if (!result) redirect("/login?expired=1");
  // From the phone app: hand it a revocable API token through its deep link instead of a browser session.
  if (form.get("app")) redirect(`${APP_SCHEME}://auth?token=${encodeURIComponent(await createApiToken(result.user.id, "Gapr app"))}`);
  await createSession(result.user.id);
  const next = safeNext(form.get("next"));
  if (result.isNew) redirect(`/settings?welcome=1${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  redirect(next ?? "/");
}

/** Local development only: sign in as a seeded demo skier without email. */
export async function devSignIn(username: string, next: string | null) {
  if (process.env.NODE_ENV === "production") return;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return;
  await createSession(user.id);
  redirect(safeNext(next) ?? "/");
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
  await deleteSkiDay(day);
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
  revalidatePath("/people");
}

export type TokenState = { secret?: string; error?: string };

/** Creates a personal API token (for scripts); the secret is returned once to show the user. */
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

export type DeleteAccountState = { error?: string };

/**
 * Permanently deletes the signed-in account: profile, every ski day and track, uploads, follows, sync
 * tokens and sessions (all cascade from the user), plus any unused sign-in links for their email.
 * The user must type their username to confirm.
 */
export async function deleteAccount(_: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (String(form.get("confirm") ?? "").trim().toLowerCase() !== me.username) return { error: `Type ${me.username} to confirm.` };
  await deleteUserAccount(me);
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
  redirect("/login?deleted=1");
}

/** Like or unlike someone's run (not your own). Returns the new state, or null if not allowed. */
export async function setRunLikeAction(runId: string, like: boolean) {
  const me = await currentUser();
  if (!me) return null;
  const r = await setRunLike(me.id, runId, like);
  return r;
}

export type CommentState = { error?: string; ok?: number };

export async function addCommentAction(dayId: string, _: CommentState, form: FormData): Promise<CommentState> {
  const me = await currentUser();
  if (!me) redirect("/login");
  const r = await addComment(me.id, dayId, String(form.get("body") ?? ""));
  if (!r.ok) return { error: r.error };
  revalidatePath(`/days/${dayId}`);
  return { ok: Date.now() }; // a fresh value each time, so the form knows to clear
}

export async function deleteCommentAction(commentId: string, dayId: string) {
  const me = await currentUser();
  if (!me) redirect("/login");
  await deleteComment(me.id, commentId);
  revalidatePath(`/days/${dayId}`);
}

/** Accept someone's invite link: you become friends (each follows the other). */
export async function acceptInvite(code: string) {
  const me = await currentUser();
  if (!me) redirect("/login");
  const inviter = await inviterFor(code);
  if (!inviter) redirect("/people");
  await becomeFriends(me.id, inviter.id);
  revalidatePath("/", "layout");
  redirect(`/u/${inviter.username}`);
}

/** The owner of a day changes who can see it (from the day page). */
export async function setDayVisibilityAction(dayId: string, visibility: string) {
  const me = await currentUser();
  if (!me) redirect("/login");
  if (!isVisibility(visibility) || !(await setDayVisibility(me.id, dayId, visibility))) return;
  revalidatePath(`/days/${dayId}`);
}

export type PrivacyState = { saved?: boolean; error?: string };

/** Settings → Privacy. */
export async function savePrivacyAction(_: PrivacyState, form: FormData): Promise<PrivacyState> {
  const me = await currentUser();
  if (!me) redirect("/login");
  const visibility = form.get("defaultVisibility");
  if (!isVisibility(visibility)) return { error: "Pick who sees your days." };
  await savePrivacy(me.id, { defaultVisibility: visibility, hideTrackEnds: form.get("hideTrackEnds") === "on", applyToPast: form.get("applyToPast") === "on" });
  revalidatePath("/", "layout");
  return { saved: true };
}
