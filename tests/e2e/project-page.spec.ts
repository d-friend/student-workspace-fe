import { expect, test, type Page } from "./fixtures";
import { copy } from "../../src/lib/copy";
import { MATH, projectsFixture, projectViews, readers, sessionsFixture } from "../../src/app/dev/fixtures/projects/projectsFixture";

// The project page. The projects API is not on the mock backend yet, so its calls are answered in the browser from the dev fixture.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

async function mockProjects(page: Page) {
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: projectsFixture } }));
  await page.route("**/api/projects/*", route => route.fulfill({ json: projectViews[route.request().url().split("/").pop()!] }));
  await page.route("**/api/projects/*/reader", route => route.fulfill({ json: { pages: readers[route.request().url().split("/").slice(-2)[0]] } }));
  await page.route("**/api/sessions?*", route => {
    const project = new URL(route.request().url()).searchParams.get("project_id");
    const sessions = sessionsFixture.filter(s => !project || s.project_id === project);
    return route.fulfill({ json: { sessions, next_before: null } });
  });
  await page.route("**/api/packs/*/files/*", route => route.fulfill({ body: PNG, contentType: "image/png" }));
}

test.beforeEach(async ({ page }) => {
  await mockProjects(page);
  await page.addInitScript(() => { try { window.localStorage.setItem("df-sidebar", "open"); } catch { /* storage blocked */ } });
});

test("desktop: the three tabs show the map, the sessions and the notes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}`);
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Bản đồ" })).toHaveAttribute("aria-selected", "true");

  const tree = page.getByRole("tree", { name: "Toán" });
  await expect(tree.getByRole("treeitem", { name: "Công thức nghiệm" })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: "Hệ thức Viète" })).toBeVisible();
  await tree.getByRole("treeitem", { name: "Hệ thức Viète" }).click();
  await expect(tree.getByRole("treeitem", { name: "Hệ thức Viète" })).toHaveAttribute("aria-selected", "true");
  // The map fills the panel: taller than a phone's map, not a thin strip.
  expect((await tree.boundingBox())!.height).toBeGreaterThan(500);

  await page.getByRole("tab", { name: "Phiên học" }).click();
  await expect(page).toHaveURL(/tab=sessions/);
  await expect(page.getByRole("button", { name: /Hai vòi nước/ }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: /Vật rơi từ độ cao/ })).toHaveCount(1); // only in the sidebar: it belongs to Vật lí

  await page.getByRole("tab", { name: "Nguồn" }).click();
  await expect(page.getByRole("img", { name: copy.packPhotoAlt(1) })).toBeVisible();
  await expect(page.getByRole("img", { name: copy.packPhotoAlt(3) })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Phương trình bậc hai", level: 3 })).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
});

test("phone: tabs fit the width, the map is usable and the reader stacks photo over text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${MATH}`);
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  const tabs = await page.getByRole("tab").evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, h: r.height }; }));
  expect(tabs).toHaveLength(3);
  for (const t of tabs) { expect(t.x).toBeGreaterThanOrEqual(0); expect(t.right).toBeLessThanOrEqual(390); expect(t.h).toBeGreaterThanOrEqual(44); }
  await expect(page.getByRole("treeitem", { name: "Công thức nghiệm" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole("tab", { name: "Nguồn" }).click();
  const photo = page.getByRole("img", { name: copy.packPhotoAlt(1) });
  const text = page.getByRole("heading", { name: "Phương trình bậc hai", level: 3 });
  await expect(text).toBeVisible();
  expect((await photo.boundingBox())!.y).toBeLessThan((await text.boundingBox())!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("a reload keeps the tab, and ?block= scrolls the notes to that passage and marks it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}?tab=sources&block=b8`);
  await expect(page.getByRole("tab", { name: "Nguồn" })).toHaveAttribute("aria-selected", "true");
  const passage = page.locator("#block-b8");
  await expect(passage).toHaveAttribute("data-highlight", "true");
  await expect(passage).toBeInViewport();
});

test("a project that is not there says so", async ({ page }) => {
  await page.route("**/api/projects/*", route => route.fulfill({ status: 404, json: { error: { code: "not_found", message: "no" } } }));
  await page.goto("/projects/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText(copy.projectNotFound)).toBeVisible();
});

test("a new session starts on home filed under the project", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}?tab=sessions`);
  const navigation = page.waitForRequest(r => r.isNavigationRequest() && r.url().includes(`/?project=${MATH}`));
  await page.getByRole("button", { name: copy.projectNewSession }).click();
  await navigation;
  await page.waitForURL(url => url.pathname === "/" && url.search === ""); // home consumed the handoff
  const created = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/sessions");
  await page.getByLabel(copy.inputLabel).fill("Giải phương trình x^2 - 5x + 6 = 0");
  await page.keyboard.press("Enter");
  expect((await created).postDataJSON()).toMatchObject({ project_id: MATH });
});

test("Học thêm on a passage opens home with the message and the project", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}?tab=sources`);
  const navigation = page.waitForRequest(r => r.isNavigationRequest() && r.url().includes("via=pack_learn_more") && r.url().includes(`project=${MATH}`));
  await page.locator("#block-b5").click();
  await page.getByRole("button", { name: copy.packLearnMore }).click();
  const url = new URL((await navigation).url());
  expect(url.searchParams.get("q")).toContain("Viète");
});
