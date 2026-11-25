import { describe, expect, it } from "vitest";
import { clientIp, rateLimit } from "./rateLimit";

describe("rate limit", () => {
  it("allows up to the limit in a window, then blocks until hits age out", () => {
    const t = 1_000_000;
    expect([1, 2, 3].map((i) => rateLimit("k1", 3, 60_000, t + i))).toEqual([true, true, true]);
    expect(rateLimit("k1", 3, 60_000, t + 10)).toBe(false);
    expect(rateLimit("k1", 3, 60_000, t + 60_002)).toBe(true); // the first hit has aged out
  });

  it("keeps keys separate", () => {
    expect(rateLimit("a", 1, 1000, 0)).toBe(true);
    expect(rateLimit("a", 1, 1000, 1)).toBe(false);
    expect(rateLimit("b", 1, 1000, 1)).toBe(true);
  });

  it("reads the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
