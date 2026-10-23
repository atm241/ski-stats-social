import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

/*
 * TEMPORARY dev-only sign-in: a cookie holding the user id, no password.
 * Replace with real auth (Auth.js, Clerk, Supabase Auth...) before deploying anywhere public.
 */

export const SESSION_COOKIE = "pp_uid";

export async function currentUser() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
