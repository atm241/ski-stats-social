import { expect, test } from "@playwright/test";
import { apiToken, signIn } from "./helpers";

/** Opens one of Dana's mapped days (one with likeable runs). */
async function openDanasDay(page: import("@playwright/test").Page) {
  await page.goto("/u/dana");
  await page.locator('a[href^="/days/"]').first().click();
  await expect(page).toHaveURL(/\/days\/[^/]+$/);
  await expect(page.getByText("Comments")).toBeVisible();
}

test("comment on a friend's day, then delete it", async ({ page }) => {
  await signIn(page, "Priya");
  await openDanasDay(page);
  const body = `e2e ${Date.now()}`;
  await page.getByPlaceholder("Say something about this day…").fill(body);
  await page.getByRole("button", { name: "Comment" }).click();
  const comment = page.locator("li", { hasText: body });
  await expect(comment).toBeVisible();
  await comment.getByRole("button", { name: "Delete" }).click();
  await expect(comment).toHaveCount(0);
});

test("like a run and take it back", async ({ page }) => {
  await signIn(page, "Priya");
  await openDanasDay(page);
  const hearts = page.locator("button[aria-pressed]");
  const states = await hearts.evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")));
  const heart = hearts.nth(states.indexOf("false"));
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "true");
  await heart.click();
  await expect(heart).toHaveAttribute("aria-pressed", "false");
});

test("a friends-only day is hidden from people signed out", async ({ page, browser }) => {
  await signIn(page, "Dana");
  await openDanasDay(page);
  const url = page.url();
  const control = page.getByRole("group", { name: "Who sees this day" });
  await control.getByRole("button", { name: "Friends" }).click();
  await expect(control.getByRole("button", { name: "Friends" })).toHaveAttribute("aria-pressed", "true");
  const visitor = await (await browser.newContext()).newPage();
  expect((await visitor.goto(url))?.status()).toBe(404);
  await control.getByRole("button", { name: "Everyone" }).click();
  await expect(control.getByRole("button", { name: "Everyone" })).toHaveAttribute("aria-pressed", "true");
  expect((await visitor.goto(url))?.status()).toBe(200);
});

test("an invite link makes two skiers friends", async ({ browser }) => {
  const maya = await (await browser.newContext()).newPage();
  await signIn(maya, "Maya");
  await maya.goto("/people");
  const link = (await maya.locator("code").first().textContent())!.trim();
  expect(link).toMatch(/\/invite\//);

  // Kai isn't signed in: the invite sends him through sign-in and straight back
  const kai = await (await browser.newContext()).newPage();
  await kai.goto(link);
  await kai.getByRole("link", { name: /Sign in to add/ }).click();
  await kai.locator("form button", { hasText: "Kai" }).first().click();
  await expect(kai).toHaveURL(/\/invite\//);
  const accept = kai.getByRole("button", { name: /as a friend/ });
  if (await accept.count()) {
    await accept.click();
    await expect(kai).toHaveURL(/\/u\/maya/);
    await kai.goto(link);
  }
  await expect(kai.getByText("You're already friends")).toBeVisible();
});

test("the phone app's API: feed, a day with run likes, and the trail board", async ({ request }) => {
  const headers = { authorization: `Bearer ${await apiToken(request, "priya")}` };
  const feed = await (await request.get("/api/feed", { headers })).json();
  expect(feed.me.username).toBe("priya");
  const day = feed.days.find((d: { mountain: string | null }) => d.mountain);
  const detail = await (await request.get(`/api/days/${day.id}`, { headers })).json();
  expect(detail.timeline.length).toBeGreaterThan(0);
  const run = detail.timeline.find((t: { run?: { trail: string } }) => t.run)?.run;
  expect(run).toBeTruthy();
  const board = await request.get(`/api/mountains/${day.mountain}/trails/${encodeURIComponent(run.trail)}`, { headers });
  expect(board.ok()).toBe(true);
  expect((await request.get("/api/me")).status()).toBe(401);
  await request.post("/api/auth/sign-out", { headers });
  expect((await request.get("/api/me", { headers })).status()).toBe(401); // the token is revoked
});
