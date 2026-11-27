/**
 * Where to send someone after signing in (`?next=`). Only a path on this site: anything that could
 * leave it (`//evil.com`, `https://…`, `/\evil.com`) is ignored, so the parameter can't be used to
 * bounce people to another site from a real sign-in link.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  return value;
}
