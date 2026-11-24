import { expect, test, type Page } from "./fixtures";
import { copy } from "../../src/lib/copy";

// Runs against the mock backend (MOCK=true), with no browser mocks for the projects API. Any photo reads as one page on Ôm's law, filed
// under Vật lí: a chapter (Điện học), a lesson (Định luật Ôm, linked to the global topic) and a concept under it.
const PHOTO = "tests/fixtures/photo.jpg";
const STATUS = /Xong: \+\d+ khái niệm mới, \d+ cập nhật/;
// The browser re-encodes photos before they go up, so the mock's __lowconf marker is sent straight to the API.
const MARKED = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("__lowconf")]).toString("base64");

type Project = { id: string; name: string; map: { id: string; parent_id: string | null; role: string; name: string; summary: string; block_ids: string[]; node_id: string | null; mastery: unknown; mastery_node_id: unknown; ordinal: number }[]; packs: { id: string; project_id: string | null }[] };

async function uploadFromHome(page: Page) {
  await page.goto("/");
  await expect(page.getByText(copy.homeUploadHint)).toBeVisible();
  await page.getByLabel(copy.packUploadHint).setInputFiles(PHOTO);
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("status")).toHaveText(STATUS, { timeout: 20_000 });
  await sheet.getByRole("link", { name: copy.packOpenProject }).click();
  await page.waitForURL(/\/projects\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop()!;
}

// The app creates its guest in the background, so a test that talks to the API straight away asks for one first (a second ask returns the same).
async function guest(page: Page) {
  await page.goto("/");
  await page.getByText(copy.homeUploadHint).waitFor();
  expect((await page.request.post("/api/guest", { data: {} })).status()).toBe(200);
}

async function projects(page: Page): Promise<{ id: string; name: string; sessions: number; packs: number; map_nodes: number }[]> {
  const res = await page.request.get("/api/projects");
  expect(res.status()).toBe(200);
  return (await res.json()).projects;
}

test("a photo of notes from home becomes a subject project with a map; the notes read back, and Học thêm starts a session filed in it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => { try { window.localStorage.setItem("df-sidebar", "open"); } catch { /* storage blocked */ } });
  const id = await uploadFromHome(page);
  await expect(page.getByRole("heading", { name: "Vật lí", level: 1 })).toBeVisible();

  // The overview counts the photo; the map is one tap away, as its own page.
  await expect(page.getByText(copy.projectCountPhotos(1))).toBeVisible();
  await page.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }).click();
  await expect(page.getByRole("heading", { name: copy.projectMapRow, level: 1 })).toBeVisible();

  // The map: chapter > lesson > concept, hollow because nothing has been studied yet.
  const tree = page.getByRole("tree", { name: "Vật lí" });
  for (const name of ["Điện học", "Định luật Ôm", "Tính cường độ dòng điện"]) await expect(tree.getByRole("treeitem", { name })).toBeVisible();
  expect((await tree.getByRole("treeitem", { name: "Định luật Ôm" }).getAttribute("aria-level"))).toBe("3");

  await tree.getByRole("treeitem", { name: "Định luật Ôm" }).click();
  const notes = page.getByRole("region", { name: copy.packFromNotes });
  await expect(notes.locator(".katex").first()).toBeVisible(); // the summary's I = U/R
  await notes.getByRole("button", { name: copy.packViewSource }).click();

  // Nguồn: the photo beside what was read from it, KaTeX included, scrolled to the node's first passage.
  await expect(page.getByRole("heading", { name: copy.projectNotesRow, level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: copy.packPhotoAlt(1) })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Định luật Ôm", level: 3 })).toBeVisible();
  await expect(page.getByText("[Hình: mạch điện gồm nguồn")).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(page.locator("[data-highlight]")).toBeVisible();

  await page.getByRole("button", { name: copy.projectBack("Vật lí") }).click(); // back to the overview, past the map and the notes
  await expect(page.getByRole("heading", { name: "Vật lí", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }).click();
  await page.getByRole("tree", { name: "Vật lí" }).getByRole("treeitem", { name: "Định luật Ôm" }).click();
  await page.getByRole("region", { name: copy.packFromNotes }).getByRole("button", { name: copy.packLearnMore }).click();
  await page.waitForURL("/");
  await expect(page.getByText("Mình muốn hiểu kĩ hơn: Định luật Ôm. Vở của mình ghi: «Định luật Ôm")).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).search).toBe(""); // the handoff is consumed

  // The session was created inside the project, so the project lists it and the sidebar says whose it is.
  await expect.poll(async () => (await (await page.request.get(`/api/sessions?project_id=${id}`)).json()).sessions.length).toBe(1);
  await expect(page.getByRole("navigation", { name: copy.projectsLabel }).getByRole("link", { name: /Vật lí/ })).toBeVisible();
  await page.goto(`/projects/${id}`);
  await expect(page.getByRole("heading", { name: copy.projectRecent, level: 2 })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: /Mình muốn hiểu kĩ hơn/ })).toBeVisible();
});

test("the API answers the contract the page is built on", async ({ page }) => {
  const id = await uploadFromHome(page);
  const list = await projects(page);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ id, name: "Vật lí", sessions: 0, packs: 1, map_nodes: 3 });
  expect(Object.keys(list[0]).sort()).toEqual(["id", "last_active_at", "map_nodes", "name", "packs", "sessions", "subject_node_id"]);

  const project: Project = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(Object.keys(project).sort()).toEqual(["id", "map", "name", "packs", "subject_node_id"]);
  expect(project.map).toHaveLength(3);
  expect(Object.keys(project.map[0]).sort()).toEqual(["block_ids", "id", "mastery", "mastery_node_id", "name", "node_id", "ordinal", "parent_id", "role", "summary"]);
  expect(project.map.map(n => n.role)).toEqual(["chapter", "lesson", "concept"]);
  const lesson = project.map.find(n => n.role === "lesson")!;
  expect(lesson.node_id).not.toBeNull(); // the lesson links to the global topic
  expect(project.map.find(n => n.role === "concept")!.node_id).toBeNull(); // a concept only links by match
  expect(project.packs[0].project_id).toBe(id);

  const reader = await (await page.request.get(`/api/projects/${id}/reader`)).json();
  expect(reader.pages).toHaveLength(1);
  expect(Object.keys(reader.pages[0]).sort()).toEqual(["blocks", "created_at", "file_id", "ordinal", "pack_id"]);
  expect(reader.pages[0].blocks.length).toBeGreaterThan(3);

  const node = await (await page.request.get(`/api/map-nodes/${lesson.id}`)).json();
  expect(Object.keys(node).sort()).toEqual(["blocks", "node", "pack_ids", "project_id"]);
  expect(node.project_id).toBe(id);
  expect(node.pack_ids).toEqual([project.packs[0].id]);
  expect(node.blocks.map((b: { id: string }) => b.id)).toEqual(expect.arrayContaining(lesson.block_ids));

  const pack = await (await page.request.get(`/api/packs/${project.packs[0].id}`)).json();
  expect(pack.nodes).toHaveLength(3);
  expect(Object.keys(pack.nodes[0]).sort()).toEqual(["created", "id", "name", "role"]);
});

test("a pack whose subject the model is unsure of waits for the student's choice, and Đổi môn moves it to the other subject's project", async ({ page }) => {
  await guest(page);
  const created = await page.request.post("/api/packs", { data: { photos: [{ media_type: "image/jpeg", data: MARKED }] } });
  expect(created.status()).toBe(202);
  const { id } = await created.json();

  await page.goto(`/packs/${id}`);
  await expect(page.getByText("Vở này thuộc môn nào?")).toBeVisible({ timeout: 15_000 });
  expect(await projects(page)).toEqual([]); // no subject yet, so no project
  await page.getByRole("button", { name: "Vật lí" }).click();
  await expect(page.getByRole("heading", { name: "Vật lí", level: 1 })).toBeVisible();
  await expect(page.getByText("Xong", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect((await projects(page)).map(p => p.name)).toEqual(["Vật lí"]);
  await expect(page.getByRole("link", { name: copy.packBackProject })).toBeVisible();

  await page.getByRole("button", { name: "Đổi môn" }).click();
  await page.getByRole("button", { name: "Toán" }).click();
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  await expect.poll(async () => (await projects(page)).map(p => `${p.name}:${p.packs}`).sort()).toEqual(["Toán:1"]); // the emptied Vật lí project is dropped
});

test("Cập nhật vở inside a project never asks for a subject, even for a page the model is unsure of", async ({ page }) => {
  const id = await uploadFromHome(page);
  await page.getByLabel(copy.packUploadHint).setInputFiles(PHOTO);
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("status")).toHaveText(/Xong: \+0 khái niệm mới, \d+ cập nhật/, { timeout: 20_000 }); // the same page again: all updates
  await expect(sheet.getByText(copy.packAskSubject)).toHaveCount(0);
  await sheet.getByRole("button", { name: copy.packClose }).click();

  const res = await page.request.post("/api/packs", { data: { photos: [{ media_type: "image/jpeg", data: MARKED }], project_id: id } });
  expect(res.status()).toBe(202);
  const pack = await res.json();
  expect(pack.project_id).toBe(id);
  await expect.poll(async () => (await (await page.request.get(`/api/packs/${pack.id}`)).json()).status, { timeout: 20_000 }).toMatch(/ready|partial/);
  const project: Project = await (await page.request.get(`/api/projects/${id}`)).json();
  expect(project.packs).toHaveLength(3);
  expect(project.name).toBe("Vật lí"); // an unsure page does not move or rename the project
});

test("text and a photo typed on the subject page reach the chat as one message in a session filed in the subject", async ({ page }) => {
  const id = await uploadFromHome(page);
  await expect(page.getByRole("heading", { name: "Vật lí", level: 1 })).toBeVisible();
  await page.locator("input[type=file]:not([capture])").first().setInputFiles(PHOTO); // the composer's + : a problem photo, not notes
  await expect(page.getByRole("img", { name: copy.photoChip })).toHaveCount(1);
  await page.getByRole("textbox").fill("Giúp mình bài trong ảnh");
  const created = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/sessions");
  const turn = page.waitForRequest(r => r.method() === "POST" && /\/api\/sessions\/[^/]+\/turns$/.test(new URL(r.url()).pathname));
  await page.getByRole("button", { name: copy.send, exact: true }).click();
  expect((await created).postDataJSON()).toMatchObject({ project_id: id, started_via: "photo" });
  const content = (await turn).postDataJSON().message.content as { type: string; text?: string }[];
  expect(content.filter(b => b.type === "image")).toHaveLength(1);
  expect(content.find(b => b.type === "text")?.text).toContain("Giúp mình bài trong ảnh");
  await page.waitForURL(url => url.pathname === "/" && url.search === "");
  await expect(page.getByText("Giúp mình bài trong ảnh").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("img", { name: copy.photoChip }).first()).toBeVisible(); // the photo is in the bubble
  expect(await page.evaluate(() => sessionStorage.getItem("dfriend.handoff.photos"))).toBeNull(); // consumed once
  await expect.poll(async () => (await (await page.request.get(`/api/sessions?project_id=${id}`)).json()).sessions.length).toBe(1);
});

test("a new session started inside a project is filed there, and one student cannot read or touch another's project", async ({ page, browser, baseURL }) => {
  const id = await uploadFromHome(page);
  const created = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/api/sessions");
  await page.getByRole("textbox").fill("Cho hai điện trở nối tiếp, tính điện trở tương đương");
  await page.getByRole("button", { name: copy.send, exact: true }).click(); // from the subject page's composer
  expect((await created).postDataJSON()).toMatchObject({ project_id: id });
  await page.waitForURL(url => url.pathname === "/" && url.search === ""); // home consumed the handoff
  await expect(page.getByText("Cho hai điện trở nối tiếp, tính điện trở tương đương").first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await (await page.request.get(`/api/sessions?project_id=${id}`)).json()).sessions.length).toBe(1);
  const [{ id: sessionId, project_id }] = (await (await page.request.get(`/api/sessions?project_id=${id}`)).json()).sessions;
  expect(project_id).toBe(id);
  expect((await projects(page))[0].sessions).toBe(1);

  // Another student: a fresh guest.
  const other = await browser.newContext({ baseURL });
  try {
    const stranger = await other.newPage();
    expect((await stranger.request.post("/api/guest", { data: {} })).status()).toBe(200);
    expect((await stranger.request.get(`/api/projects/${id}`)).status()).toBe(404);
    expect((await stranger.request.get(`/api/projects/${id}/reader`)).status()).toBe(404);
    const project: Project = await (await page.request.get(`/api/projects/${id}`)).json();
    expect((await stranger.request.get(`/api/map-nodes/${project.map[0].id}`)).status()).toBe(404);
    expect((await stranger.request.post("/api/packs", { data: { photos: [{ media_type: "image/jpeg", data: MARKED }], project_id: id } })).status()).toBe(404);
    expect((await stranger.request.post("/api/sessions", { data: { started_via: "typed", project_id: id } })).status()).toBe(404);
    expect((await stranger.request.patch(`/api/sessions/${sessionId}`, { data: { project_id: null } })).status()).toBe(404);
    // Listing by someone else's project id is just the stranger's own sessions, filtered: empty, nothing of the owner's.
    const theirs = await stranger.request.get(`/api/sessions?project_id=${id}`);
    expect([theirs.status(), (await theirs.json()).sessions]).toEqual([200, []]);
    expect(await projects(stranger)).toEqual([]);
  } finally {
    await other.close();
  }

  // The owner can move a session out of the project and back.
  expect((await page.request.patch(`/api/sessions/${sessionId}`, { data: { project_id: null } })).status()).toBe(200);
  expect((await (await page.request.get(`/api/sessions?project_id=${id}`)).json()).sessions).toHaveLength(0);
  expect((await page.request.patch(`/api/sessions/${sessionId}`, { data: { project_id: id } })).status()).toBe(200);
  expect((await (await page.request.get(`/api/sessions?project_id=${id}`)).json()).sessions).toHaveLength(1);
});
