import { beforeEach, describe, expect, it } from "vitest";
import { completion, runCatalog } from "./completion";
import { prisma } from "./db";
import { deleteSkiDay, leaderboard, rebuildSeasonTotals, refreshSeasonTotal, saveDay } from "./days";
import { reindexDays, setRunLike, trailBoards } from "./runs";
import { mountainCompletions, trailStats } from "./stats";
import { makeUser, parkCityData, parkCityDay, resetDb, saveParkCityDay } from "./test/db";
import { labelSegments } from "./trails";

beforeEach(resetDb);

describe("saving a day", () => {
  it("indexes its named runs, the trails along each, and its lift rides", async () => {
    const u = await makeUser();
    const day = await saveParkCityDay(u.id);
    const runs = await prisma.run.findMany({ where: { dayId: day.id }, include: { onTrails: true } });
    expect(runs.length).toBeGreaterThan(5);
    expect(runs.every((r) => r.mountain === "park-city" && r.onTrails.length > 0)).toBe(true);
    expect(runs.flatMap((r) => r.onTrails.map((t) => t.trail))).toContain("McConkey's Bowl");
    expect(await prisma.liftRide.count({ where: { dayId: day.id } })).toBeGreaterThan(3);
  });

  it("rejects the same day uploaded twice", async () => {
    const u = await makeUser();
    await saveParkCityDay(u.id);
    expect((await saveDay(u.id, parkCityDay(), "test")).status).toBe("duplicate");
  });

  it("reindexing keeps likes", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const day = await saveParkCityDay(a.id);
    const run = await prisma.run.findFirstOrThrow({ where: { dayId: day.id } });
    await setRunLike(b.id, run.id, true);
    await reindexDays("park-city");
    const after = await prisma.run.findUniqueOrThrow({ where: { id: run.id } });
    expect(after.likeCount).toBe(1);
    expect(await prisma.runLike.count({ where: { runId: run.id } })).toBe(1);
  });
});

describe("stats from the run index", () => {
  it("match labelling the track directly", async () => {
    const u = await makeUser();
    const processed = parkCityDay();
    await saveDay(u.id, processed, "test");
    const labels = labelSegments(processed.track, processed.stats.segments, parkCityData());
    const runs = processed.stats.segments.flatMap((s, i) => (s.kind === "run" && labels[i] ? [labels[i]!] : []));
    const lifts = processed.stats.segments.filter((s, i) => s.kind === "lift" && labels[i]).length;

    const stats = await trailStats({ userId: u.id, seasonKey: processed.seasonKey });
    expect(stats.mappedDays).toBe(1);
    expect(stats.trails.reduce((a, t) => a + t.runs, 0)).toBe(runs.length);
    expect(stats.lifts.reduce((a, l) => a + l.rides, 0)).toBe(lifts);

    const [pc] = await mountainCompletions(u.id);
    expect(pc.slug).toBe("park-city");
    expect(pc.skied).toBe(completion(runCatalog(parkCityData()), runs.flatMap((l) => l.names)).skied);
  });

  it("leave flagged days out", async () => {
    const u = await makeUser();
    const day = await saveParkCityDay(u.id);
    await prisma.$transaction([
      prisma.skiDay.update({ where: { id: day.id }, data: { flagged: true } }),
      prisma.run.updateMany({ where: { dayId: day.id }, data: { flagged: true } }),
      prisma.runTrail.updateMany({ where: { userId: u.id }, data: { flagged: true } }),
      prisma.liftRide.updateMany({ where: { dayId: day.id }, data: { flagged: true } }),
    ]);
    expect((await trailStats({ userId: u.id, seasonKey: day.seasonKey })).trails).toEqual([]);
    expect(await mountainCompletions(u.id)).toEqual([]);
  });
});

describe("run likes", () => {
  it("count once per skier, can be taken back, and never on your own run", async () => {
    const [owner, fan] = [await makeUser(), await makeUser()];
    const day = await saveParkCityDay(owner.id);
    const run = await prisma.run.findFirstOrThrow({ where: { dayId: day.id } });
    expect(await setRunLike(owner.id, run.id, true)).toBeNull();
    expect(await setRunLike(fan.id, run.id, true)).toEqual({ liked: true, likeCount: 1 });
    expect(await setRunLike(fan.id, run.id, true)).toEqual({ liked: true, likeCount: 1 });
    expect(await setRunLike(fan.id, run.id, false)).toEqual({ liked: false, likeCount: 0 });
  });
});

describe("trail boards", () => {
  it("rank each skier once by their best speed on the trail, and skip flagged days", async () => {
    const [a, b, c] = [await makeUser("ann"), await makeUser("ben"), await makeUser("cat")];
    await saveParkCityDay(a.id, "2026-03-13T16:00:00Z", 5);
    await saveParkCityDay(a.id, "2026-03-14T16:00:00Z", 9);
    await saveParkCityDay(b.id, "2026-03-13T16:00:00Z", 7);
    const flagged = await saveParkCityDay(c.id, "2026-03-13T16:00:00Z", 11);
    await prisma.runTrail.updateMany({ where: { run: { dayId: flagged.id } }, data: { flagged: true } });

    const { fastest, totalRuns } = await trailBoards("park-city", "McConkey's Bowl");
    expect(fastest.map((r) => r.user.username).sort()).toEqual(["ann", "ben"]);
    expect(fastest[0].maxSpeedMps).toBeGreaterThanOrEqual(fastest[1].maxSpeedMps);
    expect(totalRuns).toBeGreaterThanOrEqual(4);
  });
});

describe("season leaderboard", () => {
  it("public shows only opted-in skiers; a friends list shows whoever is in it", async () => {
    const [pub, priv] = [await makeUser("pub", { globalBoard: true }), await makeUser("priv")];
    const day = await saveParkCityDay(pub.id);
    await saveParkCityDay(priv.id);
    expect((await leaderboard(day.seasonKey, "vertical", "public")).rows.map((r) => r.user.username)).toEqual(["pub"]);
    expect((await leaderboard(day.seasonKey, "vertical", [pub.id, priv.id])).rows.map((r) => r.rank)).toEqual([1, 1]); // same day, a tie
  });

  it("ranks the top rows, counts everyone, and finds your rank below the cut", async () => {
    const users = [];
    for (const [i, name] of ["a", "b", "c", "d"].entries()) {
      const u = await makeUser(name, { globalBoard: true });
      users.push(u);
      for (let k = 0; k <= i; k++) await saveParkCityDay(u.id, `2026-03-${String(10 + k).padStart(2, "0")}T16:00:00Z`, 5 + k);
    }
    const season = (await prisma.skiDay.findFirstOrThrow()).seasonKey;
    const board = await leaderboard(season, "days", "public", { limit: 2, me: users[0].id });
    expect(board.rows.map((r) => [r.user.username, r.days, r.rank])).toEqual([["d", 4, 1], ["c", 3, 2]]);
    expect(board.total).toBe(4);
    expect(board.mine).toMatchObject({ rank: 4, days: 1 });
  });

  it("stays current as days are deleted or flagged", async () => {
    const u = await makeUser("pat", { globalBoard: true });
    const first = await saveParkCityDay(u.id, "2026-03-13T16:00:00Z", 5);
    const second = await saveParkCityDay(u.id, "2026-03-14T16:00:00Z", 9);
    const board = () => leaderboard(first.seasonKey, "days", "public", { me: u.id });
    expect((await board()).mine?.days).toBe(2);
    await deleteSkiDay(second);
    expect((await board()).mine?.days).toBe(1);
    await prisma.skiDay.update({ where: { id: first.id }, data: { flagged: true } });
    await refreshSeasonTotal(u.id, first.seasonKey);
    expect((await board()).mine).toBeNull();
    expect(await prisma.seasonTotal.count()).toBe(0);
  });

  it("rebuilding gives the same totals as keeping them up to date", async () => {
    const u = await makeUser();
    const day = await saveParkCityDay(u.id);
    const before = await prisma.seasonTotal.findUniqueOrThrow({ where: { userId_seasonKey: { userId: u.id, seasonKey: day.seasonKey } } });
    expect(await rebuildSeasonTotals()).toBe(1);
    const after = await prisma.seasonTotal.findUniqueOrThrow({ where: { userId_seasonKey: { userId: u.id, seasonKey: day.seasonKey } } });
    expect({ ...after, updatedAt: null }).toEqual({ ...before, updatedAt: null });
  });
});
