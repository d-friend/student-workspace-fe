import { expect, test } from "./fixtures";
import { copy } from "../../src/lib/copy";
import { projectsFixture, sessionsFixture } from "../../src/app/dev/fixtures/projects/projectsFixture";

// The sidebar's Môn học section. The projects API is not on the mock backend yet, so these two calls are answered in the browser from the dev fixture.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: projectsFixture } }));
  await page.route("**/api/sessions?*", route => route.fulfill({ json: { sessions: sessionsFixture, next_before: null } }));
  await page.addInitScript(() => { try { window.localStorage.setItem("df-sidebar", "open"); } catch { /* storage blocked */ } });
});

test("desktop: subjects sit above the recent chats, and a chat shows its subject", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: copy.projectsLabel });
  await expect(nav.getByRole("heading", { name: copy.projectsTitle })).toBeVisible();
  // Most recently active first.
  await expect(nav.getByRole("link")).toHaveText([/^Vật lí/, /^Toán/]);
  await expect(nav.getByRole("link", { name: /Toán/ })).toHaveAttribute("href", /^\/projects\/11111111-/);

  const history = page.getByRole("button", { name: /Hai vòi nước/ });
  await expect(history).toContainText("Toán");
  await expect(page.getByRole("button", { name: /Tại sao bầu trời/ })).not.toContainText("Toán"); // unfiled
  // Subjects sit above the chats (the group heading depends on the clock, so compare with the first chat itself).
  const [subjects, chat] = await Promise.all([nav.boundingBox(), history.boundingBox()]);
  expect(subjects!.y + subjects!.height).toBeLessThanOrEqual(chat!.y);
});

test("phone: the drawer lists the subjects and tapping one closes it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: copy.historyOpen }).click();
  const nav = page.getByRole("navigation", { name: copy.projectsLabel });
  await expect(nav.getByRole("link", { name: /Vật lí/ })).toBeVisible();
  // Tap target of at least 44px.
  expect((await nav.getByRole("link").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.route("**/projects/**", route => route.fulfill({ contentType: "text/html", body: "<html><body>project page</body></html>" }));
  await nav.getByRole("link", { name: /Toán/ }).click();
  await expect(page).toHaveURL(/\/projects\/11111111-/);
});

test("fixture page: past five subjects the list folds behind a button", async ({ page }) => {
  await page.unroute("**/api/projects");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dev/fixtures/projects?n=8");
  const nav = page.getByRole("navigation", { name: copy.projectsLabel });
  await expect(nav.getByRole("link")).toHaveCount(5);
  await nav.getByRole("button", { name: copy.projectsMore }).click();
  await expect(nav.getByRole("link")).toHaveCount(8);
  await nav.getByRole("button", { name: copy.projectsLess }).click();
  await expect(nav.getByRole("link")).toHaveCount(5);
});
