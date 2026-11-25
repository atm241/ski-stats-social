/**
 * Sliding-window rate limiter kept in memory. Enough for one server process; when the app runs on
 * several instances, move the buckets to Redis/Upstash so the limit is shared.
 */
const buckets = new Map<string, number[]>();
const MAX_KEYS = 50_000;

/** Records a hit for `key` and says whether it's within `limit` hits per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  const allowed = hits.length < limit;
  if (allowed) hits.push(now);
  buckets.delete(key); // re-insert so the Map's order is least-recently-used first
  buckets.set(key, hits);
  if (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value!);
  return allowed;
}

/** Best-effort client IP behind a proxy (Vercel, Fly, nginx all set x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}
