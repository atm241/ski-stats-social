import "server-only";
import type { User } from "@/generated/prisma/client";
import { prisma } from "./db";

/**
 * Permanently deletes an account: profile, every ski day and track, uploads, follows, likes, comments,
 * API tokens and sessions (all cascade from the user), plus unused sign-in links for their email.
 * Like counts on other people's runs are taken down first, since the likes vanish with the user.
 */
export async function deleteUserAccount(user: Pick<User, "id" | "email">) {
  await prisma.$transaction(async (tx) => {
    const liked = await tx.runLike.findMany({ where: { userId: user.id }, select: { runId: true } });
    if (liked.length) await tx.run.updateMany({ where: { id: { in: liked.map((l) => l.runId) } }, data: { likeCount: { decrement: 1 } } });
    if (user.email) await tx.loginToken.deleteMany({ where: { email: user.email } });
    await tx.user.delete({ where: { id: user.id } });
  });
}
