import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "./db";

/**
 * Permanently deletes an account: profile, every ski day and track, uploads, follows, API tokens and
 * sessions (all cascade from the user), plus unused sign-in links for their email.
 */
export async function deleteUserAccount(user: Pick<User, "id" | "email">) {
  await prisma.$transaction([...(user.email ? [prisma.loginToken.deleteMany({ where: { email: user.email } })] : []), prisma.user.delete({ where: { id: user.id } })]);
}
