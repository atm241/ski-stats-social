import { type APIRequestContext, expect, type Page } from "@playwright/test";

/** Signs the page in as a seeded demo skier via the dev-only buttons on /login. */
export async function signIn(page: Page, displayName: string) {
  await page.goto("/login");
  await page.locator("form button", { hasText: displayName }).first().click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** An API token for a demo skier, as the phone app gets in development. */
export async function apiToken(request: APIRequestContext, username: string) {
  const res = await request.post("/api/auth/dev", { data: { username } });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { token: string }).token;
}

/** Collects uncaught errors and console errors so a test can assert the page stayed clean. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("Download the React DevTools") && errors.push(m.text()));
  return errors;
}
