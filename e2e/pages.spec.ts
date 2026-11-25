import { expect, test } from "@playwright/test";
import { watchErrors } from "./helpers";

const PAGES: [string, RegExp][] = [
  ["/", /Recent days/i],
  ["/leaderboard", /leaderboard/i],
  ["/mountains", /mountains/i],
  ["/mountains/park-city", /Park City/],
  ["/mountains/park-city/runs/McConkey's%20Bowl", /McConkey's Bowl/],
  ["/u/dana", /Dana/],
];

for (const [path, heading] of PAGES) {
  test(`${path} renders without errors`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1, h2, h3").filter({ hasText: heading }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("a day page shows named runs and the 3D replay loads", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/u/dana");
  await page.locator('a[href^="/days/"]').first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Comments")).toBeVisible();
  await page.getByRole("link", { name: /replay/i }).first().click();
  await expect(page.locator("[data-replay] canvas")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("unknown pages get the 404", async ({ page }) => {
  const res = await page.goto("/u/nobody-at-all");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Off the map")).toBeVisible();
});
