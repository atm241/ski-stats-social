import { describe, expect, it } from "vitest";
import { completion, runCatalog } from "./completion";
import type { MountainData } from "./mountain/types";

const run = (name: string | null, difficulty: string | null, points: number) => ({ name, difficulty, coords: Array.from({ length: points }, (_, i) => [i, 0] as [number, number]) });
const data = {
  runs: [
    run("Bonanza", "easy", 20),
    run("Bonanza", "intermediate", 4), // a short connector piece with a different rating
    run("Jupiter Bowl", "expert", 10),
    run("Thaynes", "advanced", 10),
    run(null, "easy", 5), // unnamed connectors don't count
    run("Mystery", null, 5),
  ],
} as unknown as MountainData;

describe("mountain completion", () => {
  it("lists each named run once, rated by its longest piece", () => {
    const cat = runCatalog(data);
    expect([...cat.keys()].sort()).toEqual(["Bonanza", "Jupiter Bowl", "Mystery", "Thaynes"]);
    expect(cat.get("Bonanza")).toBe("easy");
    expect(cat.get("Mystery")).toBe("other");
  });

  it("counts runs skied, by difficulty, ignoring names that aren't on this map", () => {
    const c = completion(runCatalog(data), ["Bonanza", "Bonanza", "Jupiter Bowl", "Some Other Resort's Run"]);
    expect(c.total).toBe(4);
    expect(c.skied).toBe(2);
    expect(c.skiedNames).toEqual(["Bonanza", "Jupiter Bowl"]);
    expect(c.byLevel).toEqual([
      { level: "easy", total: 1, skied: 1 },
      { level: "advanced", total: 1, skied: 0 },
      { level: "expert", total: 1, skied: 1 },
      { level: "other", total: 1, skied: 0 },
    ]);
  });
});
