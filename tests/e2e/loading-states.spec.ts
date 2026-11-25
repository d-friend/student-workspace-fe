import { expect, test, type Page } from "./fixtures";
import { copy } from "../../src/lib/copy";
import { MATH, projectsFixture, projectViews, sessionsFixture } from "../../src/app/dev/fixtures/projects/projectsFixture";

// What a student sees while a page waits on the network: a skeleton the size of the content (after a short delay, never for a fast load),
// and nothing moves when the content arrives. The projects API is answered in the browser from the dev fixture, with a delay.
async function mockProjects(page: Page, delayMs: number) {
  const wait = () => new Promise(resolve => setTimeout(resolve, delayMs));
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: projectsFixture } }));
  await page.route("**/api/projects/*", async route => { await wait(); await route.fulfill({ json: projectViews[route.request().url().split("/").pop()!] }); });
  await page.route("**/api/sessions?*", route => route.fulfill({ json: { sessions: sessionsFixture, next_before: null } }));
  await page.addInitScript(() => { try { window.localStorage.setItem("df-sidebar", "open"); } catch { /* storage blocked */ } });
}

for (const [name, width, height] of [["phone", 390, 844], ["desktop", 1280, 800]] as const) {
  test(`${name}: a slow subject page shows a skeleton, and the content lands without moving anything`, async ({ page }) => {
    await mockProjects(page, 1500);
    await page.setViewportSize({ width, height });
    await page.goto(`/projects/${MATH}`);

    const skeleton = page.getByRole("status", { name: copy.loadingProject });
    await expect(skeleton).toBeVisible();
    const recent = page.getByRole("heading", { name: copy.projectRecent });
    const before = await recent.boundingBox();

    await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
    await expect(skeleton).toHaveCount(0); // held at least 300 ms, then gone
    const after = await recent.boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
  });
}

test("a fast subject page never flashes a skeleton", async ({ page }) => {
  await mockProjects(page, 0);
  await page.addInitScript(() => {
    (window as unknown as { sawSkeleton: boolean }).sawSkeleton = false;
    new MutationObserver(() => {
      if (document.querySelector('[role="status"][aria-busy="true"]:not([data-wait])')) (window as unknown as { sawSkeleton: boolean }).sawSkeleton = true;
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.goto(`/projects/${MATH}`);
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { sawSkeleton: boolean }).sawSkeleton)).toBe(false);
});

test("reduced motion: the skeleton is still, not shimmering", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockProjects(page, 1500);
  await page.goto(`/projects/${MATH}`);
  const bone = page.getByRole("status", { name: copy.loadingProject }).locator("span").first();
  await expect(bone).toBeVisible();
  expect(await bone.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
});
