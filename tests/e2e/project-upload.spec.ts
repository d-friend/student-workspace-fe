import { expect, test, type Page } from "./fixtures";
import { copy } from "../../src/lib/copy";
import type { Pack } from "../../src/lib/api";
import { MATH, projectsFixture, projectViews, readers } from "../../src/app/dev/fixtures/projects/projectsFixture";

// Uploading notes: from home (the subject may need asking) and inside a project (it never does). The whole pack lifecycle is answered
// in the browser, so this checks what the page sends and shows, not the backend pipeline.
const PHOTO = "tests/fixtures/photo.jpg";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const pack = (over: Partial<Pack>): Pack => ({
  id: "p9", status: "merging", error: null, subject: null, guesses: null, project_id: null,
  created_at: "2026-11-24T10:00:00Z", updated_at: "2026-11-24T10:00:00Z", photos: 1, concepts: 0,
  files: [{ id: "f1", ordinal: 0, status: "ok", media_type: "image/jpeg" }], blocks: [], nodes: [], ...over,
});
const toan = { id: "math", name: "Toán", by: "student" as const, confidence: null };
const ready = pack({ status: "ready", subject: toan, project_id: MATH, concepts: 2,
  nodes: [{ id: "n1", name: "Hệ thức Viète", role: "concept", created: true }, { id: "n2", name: "Biệt thức Δ", role: "concept", created: false }] });

async function mockProjects(page: Page) {
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: projectsFixture } }));
  await page.route("**/api/projects/*", route => route.fulfill({ json: projectViews[route.request().url().split("/").pop()!] }));
  await page.route("**/api/projects/*/reader", route => route.fulfill({ json: { pages: readers[route.request().url().split("/").slice(-2)[0]] } }));
  await page.route("**/api/packs/*/files/*", route => route.fulfill({ body: PNG, contentType: "image/png" }));
}

test.beforeEach(async ({ page }) => {
  await mockProjects(page);
  await page.addInitScript(() => { try { window.localStorage.setItem("df-sidebar", "open"); } catch { /* storage blocked */ } });
});

test("home: a photo of notes asks for the subject when unsure, then the sheet ends on the new project", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let created: { photos: unknown[]; project_id?: string } | null = null;
  await page.route("**/api/packs", route => {
    if (route.request().method() !== "POST") return route.fallback();
    created = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: pack({ status: "needs_subject", guesses: ["Toán", "Vật lí"] }) });
  });
  await page.route("**/api/packs/p9", route => route.request().method() === "PATCH"
    ? route.fulfill({ json: ready }) : route.fulfill({ json: pack({ status: "needs_subject", guesses: ["Toán", "Vật lí"] }) }));
  await page.goto("/");
  await expect(page.getByText(copy.homeUploadHint)).toBeVisible();
  await page.getByLabel(copy.packUploadHint).setInputFiles(PHOTO);

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(copy.packAskSubject)).toBeVisible();
  expect(created!.project_id).toBeUndefined(); // from home the subject is not known
  await sheet.getByRole("button", { name: "Toán" }).click();
  await expect(sheet.getByRole("status")).toHaveText(copy.packDone(1, 1));
  await sheet.getByRole("link", { name: copy.packOpenProject }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${MATH}$`));
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
});

test("project: Cập nhật vở uploads into the project, never asks for a subject, and the page refreshes when it is done", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let created: { project_id?: string } | null = null;
  let projectLoads = 0;
  await page.route("**/api/projects/*", route => { projectLoads++; return route.fulfill({ json: projectViews[route.request().url().split("/").pop()!] }); });
  let polls = 0;
  await page.route("**/api/packs", route => {
    if (route.request().method() !== "POST") return route.fallback();
    created = route.request().postDataJSON();
    return route.fulfill({ status: 202, json: pack({ status: "extracting", project_id: MATH, files: [{ id: "f1", ordinal: 0, status: "pending", media_type: "image/jpeg" }] }) });
  });
  await page.route("**/api/packs/p9", route => route.fulfill({ json: ++polls < 2 ? pack({ status: "merging", project_id: MATH, subject: toan }) : ready }));
  await page.goto(`/projects/${MATH}`);
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  const before = projectLoads;
  await page.getByLabel(copy.packUploadHint).setInputFiles(PHOTO);

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText(copy.packMerging)).toBeVisible();
  await expect(sheet.getByRole("status")).toHaveText(copy.packDone(1, 1), { timeout: 10_000 });
  expect(created!.project_id).toBe(MATH);
  await expect(sheet.getByText(copy.packAskSubject)).toHaveCount(0);
  await expect(sheet.getByRole("link")).toHaveCount(0); // already in the subject: nothing to open
  await expect.poll(() => projectLoads).toBeGreaterThan(before); // the map and pack list were fetched again
  await sheet.getByRole("button", { name: copy.packClose }).click();
  await expect(sheet).toHaveCount(0);
});

test("phone: Thêm fits and stays reachable in the notes row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/projects/${MATH}`);
  const button = page.getByRole("button", { name: copy.projectAddLabel });
  await expect(button).toBeVisible();
  const box = (await button.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("the progress page no longer uploads notes or counts packs", async ({ page }) => {
  await page.route("**/api/tree", route => route.fulfill({ json: { nodes: [], workspaces: [] } }));
  await page.goto("/progress");
  await expect(page.getByText(copy.progressEmpty)).toBeVisible();
  await expect(page.getByLabel(copy.packUploadHint)).toHaveCount(0);
  await expect(page.getByText(copy.packListTitle)).toHaveCount(0);
});
