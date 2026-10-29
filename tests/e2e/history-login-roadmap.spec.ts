import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { copy } from "../../src/lib/copy";

// Uses the real mock backend, SSE, persistence and Next rewrite from playwright.config.ts.
const SOLVE = "Tiếp tuyến của y = x³ − 2x";
const LEARN = "Phương trình bậc nhất";
const NEXT = "Học tiếp: Đạo hàm của hàm hợp";
const composer = (page: Page) => page.getByLabel(copy.inputLabel);

async function turnComplete(page: Page) {
  // This control is disabled while the app is busy. Include the closed phone sidebar:
  // its button stays mounted even when the drawer is hidden.
  await expect(page.getByRole("button", { name: copy.newProblem, exact: true, includeHidden: true })).toBeEnabled();
}

async function send(page: Page, text: string) {
  const started = page.waitForResponse(r => r.request().method() === "POST" && /\/turns$/.test(r.url()));
  await composer(page).fill(text);
  await composer(page).press("Enter");
  const response = await started;
  expect(response.status()).toBe(200);
  // SSE response.finished() can hang through the Next rewrite. Wait for the app's
  // completed-turn state instead; callers also assert the resulting content/persisted tabs.
  await turnComplete(page);
}

async function chat(page: Page) {
  await page.getByRole("button", { name: copy.petOpen }).click();
  await expect(page.getByRole("dialog", { name: copy.drawerLabel })).toBeVisible();
}

async function closeChat(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: copy.drawerLabel })).toHaveCount(0);
}

async function current(page: Page) {
  const response = await page.request.get("/api/sessions/current");
  expect(response.status()).toBe(200);
  return response.json();
}

async function threeTabs(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
  await send(page, "__build");
  await expect(page.getByRole("heading", { name: SOLVE, exact: true })).toBeVisible();
  await chat(page);
  await send(page, "__build second solve");
  await send(page, "__learn");
  await closeChat(page);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect.poll(async () => (await current(page)).tabs.map((tab: { phase: string }) => tab.phase))
    .toEqual(["solve", "solve", "learn"]);
}

async function openHistory(page: Page) {
  if (page.viewportSize()!.width < 800) {
    await page.getByRole("button", { name: copy.historyOpen, exact: true }).click();
  } else {
    const expand = page.getByRole("button", { name: copy.sidebarExpand });
    if (await expand.isVisible()) await expand.click();
  }
  // §3.1's date group, distinct from the Entry heading "Hôm nay mình làm bài gì?".
  await expect(page.getByRole("heading", { name: copy.historyToday, exact: true })).toBeVisible();
}

test("two solve tabs and one learn tab keep distinct identities and local work when switching", async ({ page }) => {
  await threeTabs(page);
  const saved = await current(page);
  expect(new Set(saved.tabs.map((tab: { workspace_id: string }) => tab.workspace_id)).size).toBe(3);
  const solves = page.getByRole("tab", { name: SOLVE, exact: true });
  for (const [index, draft] of ["first solve draft", "second solve draft"].entries()) {
    await solves.nth(index).click();
    await expect(solves.nth(index)).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tabpanel").getByLabel(copy.blankLabel(1)).fill(draft);
    await expect.poll(async () => (await current(page)).active_workspace_id).toBe(saved.tabs[index].workspace_id);
  }
  await page.getByRole("tab", { name: LEARN, exact: true }).click();
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "Ý tưởng" })).toBeVisible();
  for (const [index, draft] of ["first solve draft", "second solve draft"].entries()) {
    await solves.nth(index).click();
    await expect(page.getByRole("tabpanel").getByLabel(copy.blankLabel(1))).toHaveValue(draft);
  }
});

test("finishing a solve offers next-topic chips and the lesson chip builds a learn tab", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
  await send(page, "__build");
  // A real student check finishes the problem; no synthetic task_completed or stubbed SSE.
  await page.getByRole("button", { name: copy.otherWay }).click();
  await page.getByLabel(copy.lineLabel(1)).fill("y=10*x-16");
  await page.getByRole("button", { name: copy.check, exact: true }).click();
  await expect(page.getByText(copy.doneLabel, { exact: true })).toBeVisible();
  await chat(page);
  const drawer = page.getByRole("dialog", { name: copy.drawerLabel });
  await expect(drawer.getByRole("button", { name: NEXT, exact: true })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Bài tương tự", exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: NEXT, exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await turnComplete(page);
  await closeChat(page);
  await expect(page.getByRole("tab", { name: LEARN, exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "Ý tưởng" })).toBeVisible();
  await expect.poll(async () => (await current(page)).tabs.map((tab: { phase: string }) => tab.phase))
    .toEqual(["solve", "learn"]);
});

for (const width of [1440, 360]) {
  test(`history resumes a past session with its chat and all tabs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await threeTabs(page);
    const past = await current(page);
    await openHistory(page);
    await page.getByRole("button", { name: copy.newProblem, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
    await send(page, "history-current-marker");
    const newer = await current(page);
    expect(newer.session_id).not.toBe(past.session_id);
    await openHistory(page);
    const resumed = page.waitForResponse(r => r.url().endsWith(`/api/sessions/${past.session_id}/resume`));
    await page.getByRole("button", { name: new RegExp(`^${SOLVE}`) }).click();
    expect((await resumed).status()).toBe(204);
    await expect(page.getByRole("tab")).toHaveCount(3);
    await expect(page.getByRole("tab", { name: SOLVE, exact: true })).toHaveCount(2);
    await expect(page.getByRole("tab", { name: LEARN, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect.poll(async () => (await current(page)).tabs.map((tab: { workspace_id: string }) => tab.workspace_id))
      .toEqual(past.tabs.map((tab: { workspace_id: string }) => tab.workspace_id));
    await chat(page);
    const drawer = page.getByRole("dialog", { name: copy.drawerLabel });
    await expect(drawer.getByText("__build", { exact: true })).toBeVisible();
    await expect(drawer.getByText("__build second solve", { exact: true })).toBeVisible();
    await expect(drawer.getByText("__learn", { exact: true })).toBeVisible();
    await expect(drawer.getByText("Mình dựng nhé.", { exact: true })).toHaveCount(3);
    await expect(drawer.getByText("history-current-marker", { exact: true })).toHaveCount(0);
    await send(page, "resumed-chat-marker");
    await expect(drawer.getByText("Mình đọc đề là: resumed-chat-marker", { exact: true })).toBeVisible();
    expect((await current(page)).session_id).toBe(past.session_id);
    // This case checks chat and tab documents; §3.3's saved work is covered separately.
  });
}

async function guest(request: APIRequestContext) {
  const response = await request.post("/api/guest", { data: {} });
  expect(response.status()).toBe(200);
  return (await response.json()).guest_id as string;
}

// No browser OAuth seam exists. Reuse the backend's test-only ownership helper against
// the same local database as the mock server; never call Google or add a production login route.
function attachGuests(first: string, second: string) {
  execFileSync("uv", ["run", "python", "-c", `
import asyncio, sys
from app.config import Settings
from tests.test_sessions import make_app
from tests.test_ownership import attach_guests

async def main():
    app = make_app(Settings(mock=True).database_url)
    try:
        await attach_guests(app, {"cookie": "df_guest=" + sys.argv[1]}, {"cookie": "df_guest=" + sys.argv[2]})
    finally:
        await app.state.engine.dispose()

asyncio.run(main())
`, first, second], {
    cwd: path.resolve(__dirname, "../../../backend"),
    env: { ...process.env, MOCK: "true" },
    stdio: "pipe",
    timeout: 15_000,
  });
}

test("two linked guest cookies share the sessions API; UI logout rotates the guest and clears history", async ({ page, context, browser, baseURL }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
  await send(page, "__build");
  const firstSession = await current(page);
  const first = (await context.cookies()).find(c => c.name === "df_guest")!.value;
  const otherContext = await browser.newContext({ baseURL, locale: "vi-VN" });
  const other = otherContext.request;
  try {
    const second = await guest(other);
    // APIRequestContext.post also waits for the entire SSE body. Create this device's
    // conversation in a browser so it uses the same UI completion signal as send().
    const otherPage = await otherContext.newPage();
    await otherPage.goto("/");
    await expect(otherPage.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
    await send(otherPage, "second-device-marker");
    const { session_id: secondSession } = await current(otherPage);
    const list = async (request: APIRequestContext) => {
      const response = await request.get("/api/sessions");
      expect(response.status()).toBe(200);
      return (await response.json()).sessions.map((row: { id: string }) => row.id).sort();
    };
    expect(await list(page.request)).toEqual([firstSession.session_id]);
    expect(await list(other)).toEqual([secondSession]);
    attachGuests(first, second);
    const expected = [firstSession.session_id, secondSession].sort();
    expect(await list(page.request)).toEqual(expected);
    expect(await list(other)).toEqual(expected);

    await page.reload();
    await openHistory(page);
    await expect(page.getByRole("button", { name: new RegExp(`^${SOLVE}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: /^second-device-marker/ })).toBeVisible();
    await page.getByRole("button", { name: copy.authAccount, exact: true }).click();
    await page.getByRole("button", { name: copy.authLogout, exact: true }).click();
    await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
    await expect.poll(async () => (await context.cookies()).find(c => c.name === "df_guest")?.value).not.toBe(first);
    expect((await context.cookies()).find(c => c.name === "df_guest")?.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(await (await page.request.get("/api/me")).json()).toEqual({ signed_in: false });
    expect(await list(page.request)).toEqual([]);
    await expect(page.getByText(copy.historyEmpty, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${SOLVE}`) })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^second-device-marker/ })).toHaveCount(0);
    // Logging out one device leaves the account and its sessions available to the other.
    expect(await list(other)).toEqual(expected);
  } finally {
    await otherContext.close();
  }
});
