import { describe, expect, it } from "vitest";
import { safeNext } from "./nextPath";

describe("post-sign-in redirect", () => {
  it("allows paths on this site", () => {
    expect(safeNext("/invite/abc123")).toBe("/invite/abc123");
    expect(safeNext("/days/x?tab=runs")).toBe("/days/x?tab=runs");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "evil.com", "", null, 42, "/x".repeat(150)]) expect(safeNext(bad), String(bad)).toBeNull();
    expect(safeNext("/a\nb")).toBeNull();
  });
});
