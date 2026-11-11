import { test as base, expect, type Page } from "@playwright/test";
export type { Page, APIRequestContext } from "@playwright/test";

// Keep existing flows focused on their own behavior while preserving the real sign-in state.
export async function bypassProfile(page: Page) {
  await page.route("**/api/me", async (route) => {
    try {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ json: { signed_in: false, profile_needed: false } });
      const body = await response.json();
      return route.fulfill({ response, json: { ...body, profile_needed: false } });
    } catch {
      return route.fulfill({ json: { signed_in: false, profile_needed: false } });
    }
  });
}
export const test = base.extend({
  page: async ({ page }, provide) => {
    await bypassProfile(page);
    await provide(page);
  },
});
export { expect };
