import { beforeEach, describe, expect, it } from "vitest";
import { addComment } from "./comments";
import { prisma } from "./db";
import { becomeFriends } from "./people";
import { canSeeDay, savePrivacy, setDayVisibility } from "./privacy";
import { setRunLike, trailBoards } from "./runs";
import { follow, makeUser, resetDb, saveParkCityDay } from "./test/db";
import { feedDays, loadDay, loadProfile } from "./views";

beforeEach(resetDb);

async function cast() {
  const [owner, friend, follower, stranger] = [await makeUser("owner"), await makeUser("friend"), await makeUser("follower"), await makeUser("stranger")];
  await becomeFriends(owner.id, friend.id);
  await follow(follower.id, owner.id); // follows, but isn't followed back: not a friend
  const day = await saveParkCityDay(owner.id);
  return { owner, friend, follower, stranger, day };
}

describe("who sees a day", () => {
  it("public: everyone; friends: owner and friends; private: only the owner", async () => {
    const { owner, friend, follower, stranger, day } = await cast();
    const sees = async (visibility: string) => Promise.all([null, owner, friend, follower, stranger].map((u) => canSeeDay({ userId: day.userId, visibility }, u)));
    expect(await sees("public")).toEqual([true, true, true, true, true]);
    expect(await sees("friends")).toEqual([false, true, true, false, false]);
    expect(await sees("private")).toEqual([false, true, false, false, false]);
  });

  it("a day you can't see doesn't load, and only its owner can change it", async () => {
    const { owner, friend, stranger, day } = await cast();
    expect(await setDayVisibility(stranger.id, day.id, "private")).toBe(false);
    expect(await setDayVisibility(owner.id, day.id, "friends")).toBe(true);
    expect(await loadDay(day.id, stranger)).toBeNull();
    expect(await loadDay(day.id, null)).toBeNull();
    expect(await loadDay(day.id, friend)).not.toBeNull();
  });

  it("new accounts share days with friends only until they choose otherwise", async () => {
    const u = await prisma.user.create({ data: { username: "fresh", displayName: "Fresh", avatar: "", color: "#38bdf8" } });
    expect(u.defaultVisibility).toBe("friends");
    expect((await saveParkCityDay(u.id)).visibility).toBe("friends");
  });

  it("new days start at the owner's default, which can be applied to past days", async () => {
    const u = await makeUser("pat");
    await savePrivacy(u.id, { defaultVisibility: "friends", hideTrackEnds: true, applyToPast: false });
    const first = await saveParkCityDay(u.id, "2026-03-13T16:00:00Z");
    expect(first.visibility).toBe("friends");
    await savePrivacy(u.id, { defaultVisibility: "private", hideTrackEnds: true, applyToPast: true });
    expect((await prisma.skiDay.findUniqueOrThrow({ where: { id: first.id } })).visibility).toBe("private");
  });
});

describe("track ends", () => {
  it("are hidden from others but not the owner, unless the owner turns it off", async () => {
    const { owner, friend, day } = await cast();
    const full = (await loadDay(day.id, owner))!.track.pts.length;
    expect((await loadDay(day.id, friend))!.track.pts.length).toBeLessThan(full);
    await prisma.user.update({ where: { id: owner.id }, data: { hideTrackEnds: false } });
    expect((await loadDay(day.id, friend))!.track.pts.length).toBe(full);
  });
});

describe("lists, boards and interactions respect visibility", () => {
  it("feeds skip friends-only days of people who aren't friends", async () => {
    const { owner, follower, friend, day } = await cast();
    await setDayVisibility(owner.id, day.id, "friends");
    expect((await feedDays(follower, 10)).days).toEqual([]);
    expect((await feedDays(friend, 10)).days.map((d) => d.id)).toEqual([day.id]);
  });

  it("profiles list only visible days but count private ones in totals", async () => {
    const { owner, stranger, day } = await cast();
    await setDayVisibility(owner.id, day.id, "private");
    const seen = (await loadProfile("owner", stranger))!;
    expect(seen.days).toEqual([]);
    expect(seen.totals.days).toBe(1);
    expect((await loadProfile("owner", owner))!.days).toHaveLength(1);
  });

  it("you can't comment on or like runs of a day you can't see", async () => {
    const { owner, friend, stranger, day } = await cast();
    await setDayVisibility(owner.id, day.id, "friends");
    const run = await prisma.run.findFirstOrThrow({ where: { dayId: day.id } });
    expect(await addComment(stranger.id, day.id, "hi")).toMatchObject({ ok: false });
    expect(await setRunLike(stranger.id, run.id, true)).toBeNull();
    expect(await addComment(friend.id, day.id, "hi")).toEqual({ ok: true });
    expect(await setRunLike(friend.id, run.id, true)).toMatchObject({ liked: true });
  });

  it("trail boards rank public days only", async () => {
    const { owner, day } = await cast();
    expect((await trailBoards("park-city", "McConkey's Bowl")).fastest).toHaveLength(1);
    await setDayVisibility(owner.id, day.id, "friends");
    expect((await trailBoards("park-city", "McConkey's Bowl")).fastest).toHaveLength(0);
  });

  it("a friend's private day never shows up as 'skied with'", async () => {
    const { owner, friend, day } = await cast();
    const theirs = await saveParkCityDay(friend.id);
    expect((await loadDay(day.id, owner))!.companions).toHaveLength(1);
    await setDayVisibility(friend.id, theirs.id, "private");
    expect((await loadDay(day.id, owner))!.companions).toHaveLength(0);
  });
});
