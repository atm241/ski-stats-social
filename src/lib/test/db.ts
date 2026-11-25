import { readFileSync } from "node:fs";
import { processGpx } from "../analysis/process";
import { prisma } from "../db";
import { saveDay } from "../days";
import type { MountainData } from "../mountain/types";
import { toGpx } from "../sample/generate";
import { plannedDay } from "../sample/plannedDay";
import { PLANS } from "../sample/plans";

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

const plan = PLANS["park-city-jupiter-to-canyons"];
let parkCity: MountainData | undefined;
export const parkCityData = () => (parkCity ??= JSON.parse(readFileSync(`public/mountains/${plan.mountain}.json`, "utf8")) as MountainData);

/** A realistic Park City day (named runs incl. McConkey's Bowl), processed like a real upload. */
export function parkCityDay(start = "2026-03-13T16:00:00Z", seed = 5) {
  return processGpx(toGpx(plannedDay(parkCityData(), { start: new Date(start), seed, plan: plan.plan, endAt: plan.endAt }).points)).days[0];
}

export async function saveParkCityDay(userId: string, start?: string, seed?: number) {
  const out = await saveDay(userId, parkCityDay(start, seed), "test");
  if (out.status !== "saved") throw new Error("day was not saved");
  return out.day;
}

export const follow = (followerId: string, followingId: string) => prisma.follow.create({ data: { followerId, followingId } });
