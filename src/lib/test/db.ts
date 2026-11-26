import { prisma } from "../db";
import { saveDay } from "../days";
import { parkCityDay } from "./fixtures";

export { parkCityData, parkCityDay } from "./fixtures";

/** Helpers for the database tests (*.db.test.ts). */

/** Empties every table, so each test starts from nothing. */
export async function resetDb() {
  // never let a misconfigured run touch a real database
  if (!new URL(process.env.DATABASE_URL ?? "").pathname.endsWith("_test")) throw new Error("resetDb only runs against a *_test database");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let n = 0;
export function makeUser(username = `skier${++n}`, extra: { email?: string; globalBoard?: boolean } = {}) {
  return prisma.user.create({ data: { username, displayName: username[0].toUpperCase() + username.slice(1), avatar: "", color: "#38bdf8", ...extra } });
}

export async function saveParkCityDay(userId: string, start?: string, seed?: number) {
  const out = await saveDay(userId, parkCityDay(start, seed), "test");
  if (out.status !== "saved") throw new Error("day was not saved");
  return out.day;
}

export const follow = (followerId: string, followingId: string) => prisma.follow.create({ data: { followerId, followingId } });
