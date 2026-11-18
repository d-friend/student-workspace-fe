import { bypassProfile, expect, test, type Page } from "./fixtures";

import { copy } from "../../src/lib/copy";

// History/login/roadmap spec §4.1: tabs show their workspace titles.
const SOLVE = "Ca nô xuôi và ngược dòng";
const LEARN = "Phương trình bậc nhất";

// Runs against the MOCK=true backend (see playwright.config.ts): "__build" builds the patrol-boat solve workspace,
// "__learn" a learn workspace.

const composer = (page: Page) => page.getByLabel(copy.inputLabel);
const send = async (page: Page, text: string) => {
  await composer(page).fill(text);
  await composer(page).press("Enter");
};
const build = async (page: Page) => {
  await page.goto("/");
  await send(page, "__build");
  await expect(page.getByText("Chọn ẩn là gì?")).toBeVisible();
};

test("works without opening the chat", async ({ page }) => {
  await build(page);
  await page.getByRole("button", { name: "Vận tốc ca nô khi nước yên lặng", exact: true }).click();
  await expect(page.getByLabel(copy.stateOk, { exact: true })).toBeVisible();
  await expect(page.getByText("Gọi vận tốc ca nô khi nước yên lặng là", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: copy.hint }).click();
  await expect(page.getByText(copy.hintLevel(1))).toBeAttached();

  // A second phase without the chat: the agent builds it through the API (the same turn the drawer would send), then a
  // reload restores both phases.
  // §3.3: the checked line is now persisted, so wait for that save before reloading.
  await expect.poll(async () => {
    const saved = await (await page.request.get("/api/sessions/current")).json();
    return saved.tabs.find((tab: { phase: string }) => tab.phase === "solve")?.state?.blocks?.s1?.entries;
  }).toEqual([expect.objectContaining({ text: "Gọi vận tốc ca nô khi nước yên lặng là $v$ km/h, $v>2$.", state: "ok" })]);
  const { session_id } = await (await page.request.get("/api/sessions/current")).json();
  const turn = await page.request.post(`/api/sessions/${session_id}/turns`, {
    data: { message: { role: "user", content: "__learn" } },
  });
  expect(turn.ok()).toBe(true);
  await turn.body(); // the server stores the turn when its stream ends
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("tab", { name: LEARN, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ý tưởng" })).toBeVisible();
  await page.getByRole("tab", { name: SOLVE, exact: true }).click();
  await expect(page.getByLabel(copy.stateOk, { exact: true })).toBeVisible();
  await expect(page.getByText("Vì sao vận tốc xuôi dòng là", { exact: false })).toBeVisible();
});

// On a phone the chat and the workspace are two views: D-Friend speaking while the student is in the workspace (here the
// build's own reply) leaves an unread dot on ← Chat, and going back clears it and records chat_opened with unread true.
test("an unread dot on ← Chat clears when the student goes back to the thread", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "vi-VN" });
  const page = await context.newPage();
  await bypassProfile(page);
  await build(page);
  const dot = page.getByRole("img", { name: copy.petUnread });
  await expect(dot).toBeVisible();

  const opened = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/events") && (r.postData() ?? "").includes("chat_opened"),
    { timeout: 20_000 }, // the client queue flushes every 5 s
  );
  await page.getByRole("button", { name: copy.backToChat }).click();
  await expect(page.getByTestId("chat-view").getByText("Xong rồi.")).toBeVisible();
  await page.getByTestId("chat-view").getByRole("button", { name: copy.workspaceOpen }).click();
  await expect(dot).toHaveCount(0);
  const event = (JSON.parse((await opened).postData()!).events as { type: string; props: object }[]).find((e) => e.type === "chat_opened");
  expect(event?.props).toEqual({ unread: true });
  await context.close();
});

// Regression: a document-level listener that called setState before React's onChange swallowed the first keystroke
// of controlled inputs. jsdom cannot see that; real key events can.
test("real keystrokes reach the chat composer before and after a build", async ({ page }) => {
  await page.goto("/");
  await composer(page).click();
  await page.keyboard.type("abc", { delay: 60 });
  await expect(composer(page)).toHaveValue("abc");

  await send(page, "__build");
  await expect(page.getByText("Chọn ẩn là gì?")).toBeVisible();
  await composer(page).click();
  await page.keyboard.type("abc", { delay: 60 });
  await expect(composer(page)).toHaveValue("abc");
});

test("fill then Enter posts a turn before and after a build", async ({ page }) => {
  const turn = (page: Page) =>
    page.waitForRequest((r) => r.method() === "POST" && /\/api\/sessions\/[^/]+\/turns$/.test(new URL(r.url()).pathname));
  await page.goto("/");
  const first = turn(page);
  await send(page, "__build");
  await first;
  await expect(page.getByText("Chọn ẩn là gì?")).toBeVisible();
  // The composer drops a message sent while the build turn is still ending.
  await expect(page.getByRole("button", { name: copy.send, exact: true })).toBeEnabled();

  const second = turn(page);
  await send(page, "__learn");
  await second;
  await expect(page.getByRole("tab")).toHaveCount(2);
});
