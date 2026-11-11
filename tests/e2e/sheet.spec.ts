import { expect, test } from "./fixtures";
import { copy } from "../../src/lib/copy";
import type { WorkspaceDoc } from "../../src/workspace/types";

const TITLE = "Ôn tập học kì 1";
const COUNT = 3;
const doc = (n: number): WorkspaceDoc => ({
  version: 1, phase: "solve", title: `Phương trình số ${n}`, sources: [],
  blocks: [
    { type: "problem", id: "p", md: `Giải phương trình số ${n}.` },
    { type: "steps", id: "s", problem_id: "p", input: "math" },
  ],
});

// A stateful stand-in for the backend: one sheet of three problems, one guest.
for (const width of [1280, 360]) {
  test(`a student names themself, lands on the first problem and moves between problems at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 780 });
    let named = false;
    let current: number | null = null;
    const opened = new Set<number>();
    const names: unknown[] = [];
    await page.context().route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const open = path.match(/^\/api\/sheets\/sh1\/items\/(\d+)\/open$/);
      const resume = path.match(/^\/api\/sessions\/s(\d+)\/resume$/);
      if (path === "/api/sheets/sh1" && request.method() === "GET") return route.fulfill({ json: {
        id: "sh1", title: TITLE, named, count: COUNT, done: 0,
        items: Array.from({ length: COUNT }, (_, i) => ({
          position: i + 1, label: `Bài ${i + 1}`, first_line: `Giải phương trình số ${i + 1}.`, state: opened.has(i + 1) ? "started" : "new",
        })),
      } });
      if (path === "/api/sheets/sh1/name") {
        names.push(request.postDataJSON());
        named = true;
        return route.fulfill({ status: 204 });
      }
      if (open) {
        if (!named) return route.fulfill({ status: 409, json: { error: { code: "name_required", message: "name first" } } });
        const position = Number(open[1]);
        const existed = opened.has(position);
        opened.add(position);
        return route.fulfill({ status: existed ? 200 : 201, json: { session_id: `s${position}` } });
      }
      if (resume) {
        current = Number(resume[1]);
        return route.fulfill({ status: 204 });
      }
      if (path === "/api/sessions/current") {
        if (current === null) return route.fulfill({ status: 204 });
        return route.fulfill({ json: {
          session_id: `s${current}`, messages: [], html: null, active_workspace_id: `w${current}`,
          tabs: [{ workspace_id: `w${current}`, phase: "solve", doc: doc(current), state: null }],
          sheet: { id: "sh1", title: TITLE, position: current, count: COUNT },
        } });
      }
      if (/^\/api\/sessions\/s\d+\/turns$/.test(path)) return route.fulfill({ contentType: "text/event-stream", body: 'event: done\ndata: {"turn_id":"t","stop_reason":"end_turn"}\n\n' });
      if (path === "/api/guest") return route.fulfill({ json: { guest_id: "g", created: false } });
      if (path.endsWith("/turn-status")) return route.fulfill({ json: { in_flight: false } });
      if (path === "/api/auth/methods") return route.fulfill({ json: { google: false, email: false } });
      if (path === "/api/me") return route.fulfill({ json: { signed_in: false } });
      if (path === "/api/sessions") return route.fulfill({ json: { sessions: [], next_before: null } });
      if (path === "/api/events") return route.fulfill({ json: { accepted: 0, rejected: [] } });
      if (/^\/api\/workspaces\/w\d+\/state$/.test(path)) return route.fulfill({ status: 204 });
      return route.fulfill({ status: 404, json: { error: { code: "unmocked", message: path } } });
    });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    // First visit: the name, once.
    await page.goto("/sheet/sh1");
    await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(page.getByText(copy.sheetNameNote)).toBeVisible();
    expect(await fits()).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("1-name.png") });
    await page.getByLabel(copy.sheetNameLabel).fill("  Nguyễn An ");
    await page.getByRole("button", { name: copy.sheetStart }).click();

    // Straight into Solve mode on the first problem.
    await page.waitForURL("/");
    const nav = page.getByRole("navigation", { name: copy.sheetNav });
    await expect(nav.getByRole("button", { name: copy.sheetPosition(1, COUNT) })).toBeVisible();
    await expect(page.getByText("Giải phương trình số 1.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("textbox")).toBeVisible();
    await expect(nav.getByRole("button", { name: copy.sheetPrev })).toBeDisabled();
    expect(names).toEqual([{ name: "Nguyễn An" }]);
    expect(await fits()).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("2-problem.png") });

    // The list shows every problem and where this student is.
    await nav.getByRole("button", { name: copy.sheetPosition(1, COUNT) }).click();
    const rows = nav.getByRole("list").getByRole("button");
    await expect(rows).toHaveCount(COUNT);
    await expect(rows.nth(0)).toContainText(copy.sheetStateStarted);
    await expect(rows.nth(0)).toHaveAttribute("aria-current", "true");
    await expect(rows.nth(1)).toContainText("Giải phương trình số 2.");
    await expect(rows.nth(1)).toContainText(copy.sheetStateNew);
    await expect(nav.getByText(copy.sheetDoneCount(0, COUNT))).toBeVisible();
    expect(await fits()).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("3-list.png") });

    // Pick the second problem from the list, then come back with the arrow.
    await rows.nth(1).click();
    await expect(nav.getByRole("button", { name: copy.sheetPosition(2, COUNT) })).toBeVisible();
    await expect(page.getByText("Giải phương trình số 2.")).toBeVisible();
    await nav.getByRole("button", { name: copy.sheetPrev }).click();
    await expect(nav.getByRole("button", { name: copy.sheetPosition(1, COUNT) })).toBeVisible();
    await nav.getByRole("button", { name: copy.sheetNext }).click();
    await nav.getByRole("button", { name: copy.sheetNext }).click();
    await expect(nav.getByRole("button", { name: copy.sheetPosition(3, COUNT) })).toBeVisible();
    await expect(nav.getByRole("button", { name: copy.sheetNext })).toBeDisabled();

    // Coming back through the link asks for nothing and opens the first unfinished problem.
    await page.goto("/sheet/sh1");
    await page.waitForURL("/");
    await expect(nav.getByRole("button", { name: copy.sheetPosition(1, COUNT) })).toBeVisible();
    expect(names).toHaveLength(1);
  });
}

// A step answered just before tapping "next" must not be lost: the check is still on its way, and the page
// reloads when the switch finishes. The switcher waits for the check, then sends the step, then opens the item.
test("a step answered right before 'next' reaches the server before the switch", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const calls: string[] = [];
  let releaseCheck!: () => void;
  const checkHeld = new Promise<void>((resolve) => { releaseCheck = resolve; });
  let current = 1;
  await page.context().route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const open = path.match(/^\/api\/sheets\/sh1\/items\/(\d+)\/open$/);
    const resume = path.match(/^\/api\/sessions\/s(\d+)\/resume$/);
    if (path === "/api/sessions/s1/check") {
      calls.push("check");
      await checkHeld;
      return route.fulfill({ json: { ok: false, state: "review", done: false, reached: null, message: null } });
    }
    if (/^\/api\/sessions\/s\d+\/turns$/.test(path)) {
      calls.push(`turn:${request.postData()?.includes("line_checked") ? "line_checked" : "other"}`);
      return route.fulfill({ contentType: "text/event-stream", body: 'event: done\ndata: {"turn_id":"t","stop_reason":"end_turn"}\n\n' });
    }
    if (open) {
      calls.push(`open:${open[1]}`);
      return route.fulfill({ status: 201, json: { session_id: `s${open[1]}` } });
    }
    if (resume) {
      current = Number(resume[1]);
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/sessions/current") return route.fulfill({ json: {
      session_id: `s${current}`, messages: [], html: null, active_workspace_id: `w${current}`,
      tabs: [{ workspace_id: `w${current}`, phase: "solve", doc: doc(current), state: null }],
      sheet: { id: "sh1", title: TITLE, position: current, count: COUNT },
    } });
    if (path === "/api/guest") return route.fulfill({ json: { guest_id: "g", created: false } });
    if (path.endsWith("/turn-status")) return route.fulfill({ json: { in_flight: false } });
    if (path === "/api/auth/methods") return route.fulfill({ json: { google: false, email: false } });
    if (path === "/api/me") return route.fulfill({ json: { signed_in: false } });
    if (path === "/api/sessions") return route.fulfill({ json: { sessions: [], next_before: null } });
    if (path === "/api/events") return route.fulfill({ json: { accepted: 0, rejected: [] } });
    if (/^\/api\/workspaces\/w\d+\/state$/.test(path)) return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { error: { code: "unmocked", message: path } } });
  });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: copy.sheetNav });
  await expect(nav.getByRole("button", { name: copy.sheetPosition(1, COUNT) })).toBeVisible();
  const main = page.getByRole("main");
  await main.getByRole("textbox").fill("x = 1");
  await main.getByRole("button", { name: copy.check, exact: true }).click();
  await expect.poll(() => calls).toEqual(["check"]);

  // The check has not come back: the student cannot leave yet.
  await expect(nav.getByRole("button", { name: copy.sheetNext })).toBeDisabled();
  await expect(nav.getByRole("button", { name: copy.sheetPosition(1, COUNT) })).toBeEnabled();
  releaseCheck();
  await expect(nav.getByRole("button", { name: copy.sheetNext })).toBeEnabled();
  await nav.getByRole("button", { name: copy.sheetNext }).click();
  await expect(nav.getByRole("button", { name: copy.sheetPosition(2, COUNT) })).toBeVisible();
  expect(calls).toEqual(["check", "turn:line_checked", "open:2"]);
});
