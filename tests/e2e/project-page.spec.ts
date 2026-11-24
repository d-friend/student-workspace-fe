import { expect, test, type Page } from "./fixtures";
import { copy } from "../../src/lib/copy";
import { MATH, mapNodeView, projectsFixture, projectViews, readers, sessionsFixture } from "../../src/app/dev/fixtures/projects/projectsFixture";

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
  await page.route("**/api/map-nodes/*", route => {
    const view = mapNodeView(route.request().url().split("/").pop()!);
    return view ? route.fulfill({ json: view }) : route.fulfill({ status: 404, json: { error: { code: "not_found", message: "no" } } });
  });
  await page.route("**/api/packs/*/files/*", route => route.fulfill({ body: PNG, contentType: "image/png" }));
}

test.beforeEach(async ({ page }) => {
  await mockProjects(page);
  await page.addInitScript(() => { try { window.localStorage.setItem("df-sidebar", "open"); } catch { /* storage blocked */ } });
});

test("desktop: the overview has the composer and Gần đây beside the notes and map rows; the map and the notes are pages of their own", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}`);
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveAttribute("placeholder", copy.projectPlaceholder("Toán"));
  await expect(page.getByRole("button", { name: /Hai vòi nước/ }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: /Vật rơi từ độ cao/ })).toHaveCount(1); // only in the sidebar: it belongs to Vật lí
  // The title starts where the content does, not a doc column further in.
  const [title, card] = await Promise.all([page.getByRole("heading", { name: "Toán", level: 1 }).boundingBox(), page.getByRole("region", { name: copy.projectPlaceholder("Toán") }).boundingBox()]);
  expect(Math.abs(title!.x - card!.x)).toBeLessThanOrEqual(1);
  // Two columns: the side rows sit to the right of the composer.
  const [composer, side] = await Promise.all([page.getByRole("textbox").boundingBox(), page.getByRole("button", { name: new RegExp(copy.projectNotesRow) }).boundingBox()]);
  expect(side!.x).toBeGreaterThan(composer!.x + composer!.width);

  await page.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }).click();
  await expect(page).toHaveURL(/tab=map/);
  await expect(page.getByRole("heading", { name: copy.projectMapRow, level: 1 })).toBeVisible();
  const tree = page.getByRole("tree", { name: "Toán" });
  await expect(tree.getByRole("treeitem", { name: "Công thức nghiệm" })).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: "Hệ thức Viète" })).toBeVisible();
  await tree.getByRole("treeitem", { name: "Hệ thức Viète" }).click();
  await expect(tree.getByRole("treeitem", { name: "Hệ thức Viète" })).toHaveAttribute("aria-selected", "true");
  // The map fills the page: taller than a phone's map, not a thin strip.
  expect((await tree.boundingBox())!.height).toBeGreaterThan(500);

  await page.getByRole("button", { name: copy.projectBack("Toán") }).click();
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  await expect(page).not.toHaveURL(/tab=/);
  await page.getByRole("button", { name: new RegExp(copy.projectNotesRow) }).click();
  await expect(page.getByRole("img", { name: copy.packPhotoAlt(1) })).toBeVisible();
  await expect(page.getByRole("img", { name: copy.packPhotoAlt(3) })).toBeAttached();
  await expect(page.getByRole("heading", { name: "Phương trình bậc hai", level: 3 })).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
});

test("phone: the composer comes first, then the notes and map rows, then Gần đây, all inside 390px; the map is an outline and the reader stacks photo over text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${MATH}`);
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  const y = async (loc: ReturnType<Page["locator"]>) => (await loc.boundingBox())!.y;
  const [composer, notes, map, recent] = await Promise.all([
    y(page.getByRole("textbox")), y(page.getByRole("button", { name: new RegExp(copy.projectNotesRow) })), y(page.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) })), y(page.getByRole("heading", { name: copy.projectRecent, level: 2 })),
  ]);
  expect(composer).toBeLessThan(notes);
  expect(notes).toBeLessThan(map);
  expect(map).toBeLessThan(recent); // upload and the map are not under the history
  for (const loc of [page.getByRole("button", { name: copy.send, exact: true }), page.getByRole("button", { name: new RegExp(copy.projectNotesRow) }), page.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }), page.getByRole("button", { name: copy.projectAddLabel })]) {
    const box = (await loc.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }).click();
  await expect(page.getByRole("tree")).toHaveCount(0); // below 640px the map is an outline
  await expect(page.getByRole("navigation", { name: copy.projectOutlineLabel }).getByRole("button", { name: "Công thức nghiệm", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: copy.projectBack("Toán") }).click();
  await page.getByRole("button", { name: new RegExp(copy.projectNotesRow) }).click();
  const photo = page.getByRole("img", { name: copy.packPhotoAlt(1) });
  const text = page.getByRole("heading", { name: "Phương trình bậc hai", level: 3 });
  await expect(text).toBeVisible();
  expect((await photo.boundingBox())!.y).toBeLessThan((await text.boundingBox())!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test.describe("phone, touch: the back gesture returns from the map and the notes to the overview", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("history back (the swipe) goes map > overview and notes > overview, one step each", async ({ page }) => {
    await page.goto(`/projects/${MATH}`);
    await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }).tap();
    await expect(page.getByRole("heading", { name: copy.projectMapRow, level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
    await expect(page).not.toHaveURL(/tab=/);
    await page.getByRole("button", { name: new RegExp(copy.projectNotesRow) }).tap();
    await expect(page.getByRole("heading", { name: copy.projectNotesRow, level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("heading", { name: copy.projectNotesRow, level: 1 })).toBeVisible();
  });
});

test("a reload keeps the page, and ?block= scrolls the notes to that passage and marks it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}?tab=sources&block=b8`);
  await expect(page.getByRole("heading", { name: copy.projectNotesRow, level: 1 })).toBeVisible();
  const passage = page.locator("#block-b8");
  await expect(passage).toHaveAttribute("data-highlight", "true");
  await expect(passage).toBeInViewport();
});

test("a project that is not there says so", async ({ page }) => {
  await page.route("**/api/projects/*", route => route.fulfill({ status: 404, json: { error: { code: "not_found", message: "no" } } }));
  await page.goto("/projects/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText(copy.projectNotFound)).toBeVisible();
});

test("Gửi starts a session on home filed under the project, with the text typed on the subject page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}`);
  const navigation = page.waitForRequest(r => r.isNavigationRequest() && r.url().includes(`/?project=${MATH}`));
  await page.getByRole("textbox").fill("Giải phương trình x^2 - 5x + 6 = 0");
  await page.keyboard.press("Enter");
  const url = new URL((await navigation).url());
  expect([url.searchParams.get("project"), url.searchParams.get("q")]).toEqual([MATH, "Giải phương trình x^2 - 5x + 6 = 0"]);
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

test("desktop: a map node opens its notes beside the map, Xem nguồn jumps to the passage, and the panel closes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}?tab=map`);
  const tree = page.getByRole("tree", { name: "Toán" });
  await tree.getByRole("treeitem", { name: "Hệ thức Viète" }).click();
  const notes = page.getByRole("region", { name: copy.packFromNotes });
  await expect(notes.getByText("Hệ thức Viète")).toBeVisible();
  await expect(notes.locator(".katex").first()).toBeVisible();
  // Beside the map, not under it.
  const [mapBox, noteBox] = await Promise.all([tree.boundingBox(), notes.boundingBox()]);
  expect(noteBox!.x).toBeGreaterThanOrEqual(mapBox!.x + mapBox!.width - 1);

  await notes.getByRole("button", { name: copy.packViewSource }).click();
  await expect(page.getByRole("heading", { name: copy.projectNotesRow, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/tab=sources&block=b5/);
  await expect(page.locator("#block-b5")).toHaveAttribute("data-highlight", "true");
  await expect(page.locator("#block-b5")).toBeInViewport();

  await page.getByRole("button", { name: copy.projectBack("Toán") }).click(); // to the overview, past both pages
  await page.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }).click();
  await page.getByRole("tree", { name: "Toán" }).getByRole("treeitem", { name: "Hàm số" }).click(); // a chapter with no notes
  await expect(page.getByText(copy.projectNodeEmpty)).toBeVisible();
  await page.getByRole("button", { name: copy.treeClear }).click();
  await expect(page.getByRole("region", { name: copy.packFromNotes })).toHaveCount(0);
});

test("phone: the node's notes open under its row in the outline and fit the width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${MATH}?tab=map`);
  const row = page.getByRole("navigation", { name: copy.projectOutlineLabel }).getByRole("button", { name: "Công thức nghiệm", exact: true });
  await row.click();
  const notes = page.getByRole("region", { name: copy.packFromNotes });
  await expect(notes).toBeVisible();
  const [rowBox, noteBox] = await Promise.all([row.boundingBox(), notes.boundingBox()]);
  expect(noteBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height - 1);
  expect(noteBox!.x + noteBox!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const button of await notes.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("phone: scrolled content goes under an opaque band, not behind the menu, feedback and theme buttons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${MATH}?tab=sources`);
  await expect(page.getByRole("img", { name: copy.packPhotoAlt(1) })).toBeVisible();
  const scrolled = await page.evaluate(() => { const main = document.querySelector("main")!; main.scrollTop = 200; return main.scrollTop; });
  expect(scrolled).toBeGreaterThan(100);
  // Left of the buttons, in the strip they sit in: nothing from the page can show there.
  const at = await page.evaluate(() => document.elementFromPoint(195, 30)?.closest("[data-screen]") !== null);
  expect(at).toBe(false);
});

test("Học thêm on a map node opens home with the node's name and the project", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}?tab=map`);
  await page.getByRole("tree", { name: "Toán" }).getByRole("treeitem", { name: "Hệ thức Viète" }).click();
  const navigation = page.waitForRequest(r => r.isNavigationRequest() && r.url().includes("via=pack_learn_more") && r.url().includes(`project=${MATH}`));
  await page.getByRole("region", { name: copy.packFromNotes }).getByRole("button", { name: copy.packLearnMore }).click();
  expect(new URL((await navigation).url()).searchParams.get("q")).toContain("Mình muốn hiểu kĩ hơn: Hệ thức Viète.");
});
