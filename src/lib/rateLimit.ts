import "server-only";
import { prisma } from "./db";

/**
 * Fixed-window rate limiter in Postgres, so the limit holds across every server instance. One
 * atomic upsert per hit: the window starts at the first hit and resets once it's `windowMs` old.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, now = new Date()): Promise<boolean> {
  const expired = new Date(now.getTime() - windowMs);
  const [row] = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count") VALUES (${key}, ${now}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowStart" <= ${expired} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."windowStart" <= ${expired} THEN ${now} ELSE "RateLimit"."windowStart" END
    RETURNING "count"`;
  // now and then, drop counters nobody has hit in a day
  if (Math.random() < 0.01) await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86_400_000) } } });
  return row.count <= limit;
}

/** Best-effort client IP behind a proxy (Vercel, Fly, nginx all set x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}
