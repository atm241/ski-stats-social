import { beforeEach, describe, expect, it } from "vitest";
import { deleteUserAccount } from "./account";
import { addComment, deleteComment, MAX_COMMENT_CHARS } from "./comments";
import { prisma } from "./db";
import { becomeFriends, inviteCodeFor, inviterFor, searchPeople, suggestions } from "./people";
import { clientIp, rateLimit } from "./rateLimit";
import { setRunLike } from "./runs";
import { friendIds } from "./social";
import { follow, makeUser, resetDb, saveParkCityDay } from "./test/db";
import { feedDays, loadDay, loadProfile } from "./views";

beforeEach(resetDb);

describe("comments", () => {
  it("are trimmed and length-capped", async () => {
    const [owner, fan] = [await makeUser(), await makeUser()];
    const day = await saveParkCityDay(owner.id);
    expect(await addComment(fan.id, day.id, "   ")).toMatchObject({ ok: false });
    expect(await addComment(fan.id, day.id, "x".repeat(MAX_COMMENT_CHARS + 1))).toMatchObject({ ok: false });
    expect(await addComment(fan.id, day.id, "  sending it  \n\n\n\nnice  ")).toEqual({ ok: true });
    expect((await prisma.comment.findFirstOrThrow()).body).toBe("sending it  \n\nnice");
  });

  it("can be deleted by their author or the day's owner, nobody else", async () => {
    const [owner, author, stranger] = [await makeUser(), await makeUser(), await makeUser()];
    const day = await saveParkCityDay(owner.id);
    await addComment(author.id, day.id, "one");
    await addComment(author.id, day.id, "two");
    const [first, second] = await prisma.comment.findMany({ orderBy: { body: "asc" } });
    expect(await deleteComment(stranger.id, first.id)).toBe(false);
    expect(await deleteComment(author.id, first.id)).toBe(true);
    expect(await deleteComment(owner.id, second.id)).toBe(true);
  });

  it("are rate limited per skier", async () => {
    const [owner, fan] = [await makeUser(), await makeUser()];
    const day = await saveParkCityDay(owner.id);
    for (let i = 0; i < 20; i++) expect(await addComment(fan.id, day.id, `#${i}`)).toEqual({ ok: true });
    expect(await addComment(fan.id, day.id, "one more")).toMatchObject({ ok: false });
  });
});

describe("rate limit", () => {
  it("allows the limit per window, then resets once the window has passed", async () => {
    const t = new Date("2026-01-01T00:00:00Z").getTime();
    const hit = (key: string, ms: number) => rateLimit(key, 2, 60_000, new Date(t + ms));
    expect([await hit("k", 0), await hit("k", 1), await hit("k", 2)]).toEqual([true, true, false]);
    expect(await hit("other", 3)).toBe(true);
    expect(await hit("k", 60_001)).toBe(true);
  });

  it("keys on the first forwarded address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("people", () => {
  it("search is case-insensitive and puts friends first", async () => {
    const [me, friend] = [await makeUser("me"), await makeUser("danaj")];
    await makeUser("dana");
    await becomeFriends(me.id, friend.id);
    const found = await searchPeople("DAN", me);
    expect(found.map((r) => r.username)).toEqual(["danaj", "dana"]);
  });

  it("invites make you friends both ways", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const code = await inviteCodeFor(a.id);
    expect(await inviteCodeFor(a.id)).toBe(code);
    expect((await inviterFor(code))?.id).toBe(a.id);
    await becomeFriends(b.id, a.id);
    expect(await friendIds(a.id)).toEqual([b.id]);
    expect(await friendIds(b.id)).toEqual([a.id]);
  });

  it("suggests people who follow you, but never people you already follow", async () => {
    const [me, fan, followed] = [await makeUser(), await makeUser(), await makeUser()];
    await follow(fan.id, me.id);
    await follow(followed.id, me.id);
    await follow(me.id, followed.id);
    expect((await suggestions(me)).map((s) => [s.user.id, s.reason])).toEqual([[fan.id, "Follows you"]]);
  });
});

describe("day view", () => {
  it("shows friends who skied the same runs, not strangers", async () => {
    const [me, friend, stranger] = [await makeUser(), await makeUser(), await makeUser()];
    const day = await saveParkCityDay(me.id);
    await saveParkCityDay(friend.id);
    await saveParkCityDay(stranger.id);
    await becomeFriends(me.id, friend.id);
    const view = (await loadDay(day.id, me))!;
    expect(view.companions.map((c) => c.user.id)).toEqual([friend.id]);
    expect(view.companions[0].runs).toBeGreaterThan(3);
  });

  it("says who can like, comment and delete", async () => {
    const [owner, fan] = [await makeUser(), await makeUser()];
    const day = await saveParkCityDay(owner.id);
    await addComment(fan.id, day.id, "nice");
    const signedOut = (await loadDay(day.id, null))!;
    expect(signedOut.canComment).toBe(false);
    expect([...signedOut.runs.values()].some((r) => r.canLike)).toBe(false);
    const asFan = (await loadDay(day.id, fan))!;
    expect([...asFan.runs.values()].every((r) => r.canLike)).toBe(true);
    expect(asFan.comments[0].canDelete).toBe(true);
    const asOwner = (await loadDay(day.id, owner))!;
    expect([...asOwner.runs.values()].some((r) => r.canLike)).toBe(false);
    expect(asOwner.comments[0].canDelete).toBe(true);
  });
});

describe("profile and feed", () => {
  it("count unflagged days and pick the requested season", async () => {
    const u = await makeUser("pat");
    await saveParkCityDay(u.id, "2026-03-13T16:00:00Z");
    const flagged = await saveParkCityDay(u.id, "2026-03-14T16:00:00Z", 9);
    await prisma.skiDay.update({ where: { id: flagged.id }, data: { flagged: true } });
    const p = (await loadProfile("pat", null, "nope"))!;
    expect(p.days).toHaveLength(2);
    expect(p.totals.days).toBe(1);
    expect(p.completions[0].slug).toBe("park-city");
    expect(await loadProfile("nobody", null)).toBeNull();
  });

  it("feed is you and who you follow, or everyone when you follow nobody", async () => {
    const [me, followed, other] = [await makeUser(), await makeUser(), await makeUser()];
    await saveParkCityDay(followed.id);
    await saveParkCityDay(other.id);
    expect((await feedDays(me, 10)).everyone).toBe(true);
    await follow(me.id, followed.id);
    const feed = await feedDays(me, 10);
    expect(feed.days.map((d) => d.userId)).toEqual([followed.id]);
    expect("track" in feed.days[0]).toBe(false); // tracks stay out of list queries
  });
});

describe("account deletion", () => {
  it("removes everything of theirs and takes their likes off other people's runs", async () => {
    const [gone, other] = [await makeUser("gone", { email: "gone@example.com" }), await makeUser()];
    const mine = await saveParkCityDay(gone.id);
    const theirs = await saveParkCityDay(other.id);
    const run = await prisma.run.findFirstOrThrow({ where: { dayId: theirs.id } });
    await setRunLike(gone.id, run.id, true);
    await addComment(gone.id, theirs.id, "bye");
    await addComment(other.id, mine.id, "see ya");
    await becomeFriends(gone.id, other.id);
    await prisma.loginToken.create({ data: { email: "gone@example.com", tokenHash: "h", expiresAt: new Date(Date.now() + 60_000) } });

    await deleteUserAccount(gone);

    expect(await prisma.skiDay.count({ where: { userId: gone.id } })).toBe(0);
    expect(await prisma.run.count({ where: { userId: gone.id } })).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
    expect(await prisma.follow.count()).toBe(0);
    expect(await prisma.loginToken.count()).toBe(0);
    expect((await prisma.run.findUniqueOrThrow({ where: { id: run.id } })).likeCount).toBe(0);
    expect(await prisma.skiDay.count({ where: { userId: other.id } })).toBe(1);
  });
});
