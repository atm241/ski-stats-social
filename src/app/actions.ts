"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";
import { AVATAR_COLORS, AVATAR_EMOJI } from "@/lib/avatars";
import { prisma } from "@/lib/db";

export type LoginState = { error?: string };

/** Dev sign-in: creates the user if the username is new. See lib/auth.ts. */
export async function signIn(_: LoginState, form: FormData): Promise<LoginState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { error: "Usernames are 3–20 letters, numbers or underscores." };

  const avatar = String(form.get("avatar") ?? "");
  const color = String(form.get("color") ?? "");
  const displayName = String(form.get("displayName") ?? "").trim().slice(0, 40) || username;

  const user =
    (await prisma.user.findUnique({ where: { username } })) ??
    (await prisma.user.create({
      data: {
        username,
        displayName,
        avatar: AVATAR_EMOJI.includes(avatar) ? avatar : AVATAR_EMOJI[0],
        color: color in AVATAR_COLORS ? color : "sky",
      },
    }));

  (await cookies()).set(SESSION_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function deleteDay(dayId: string) {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  const day = await prisma.skiDay.findUnique({ where: { id: dayId }, include: { user: true } });
  if (!id || !day || day.userId !== id) return;
  await prisma.skiDay.delete({ where: { id: dayId } });
  redirect(`/u/${day.user.username}`);
}
