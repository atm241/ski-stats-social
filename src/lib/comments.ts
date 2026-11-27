import "server-only";
import { prisma } from "./db";
import { canSeeDay } from "./privacy";
import { rateLimit } from "./rateLimit";

export const MAX_COMMENT_CHARS = 500;

export function dayComments(dayId: string) {
  return prisma.comment.findMany({ where: { dayId }, include: { user: true }, orderBy: { createdAt: "asc" }, take: 200 });
}

export type CommentResult = { ok: true } | { ok: false; error: string };

/** Any signed-in skier can comment on a day; trimmed, length-capped and rate-limited. */
export async function addComment(userId: string, dayId: string, raw: string): Promise<CommentResult> {
  const body = raw.trim().replace(/\n{3,}/g, "\n\n");
  if (!body) return { ok: false, error: "Write something first." };
  if (body.length > MAX_COMMENT_CHARS) return { ok: false, error: `Keep it under ${MAX_COMMENT_CHARS} characters.` };
  if (!(await rateLimit(`comment:${userId}`, 20, 10 * 60_000))) return { ok: false, error: "That's a lot of comments. Try again in a few minutes." };
  const day = await prisma.skiDay.findUnique({ where: { id: dayId }, select: { userId: true, visibility: true } });
  if (!day || !(await canSeeDay(day, { id: userId }))) return { ok: false, error: "That day is gone." };
  await prisma.comment.create({ data: { dayId, userId, body } });
  return { ok: true };
}

/** The comment's author can delete it, and so can the owner of the day it's on. */
export async function deleteComment(userId: string, commentId: string) {
  const c = await prisma.comment.findUnique({ where: { id: commentId }, include: { day: { select: { userId: true } } } });
  if (!c || (c.userId !== userId && c.day.userId !== userId)) return false;
  await prisma.comment.delete({ where: { id: commentId } });
  return true;
}
