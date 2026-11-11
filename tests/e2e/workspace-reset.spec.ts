import { expect, test, type Page } from "@playwright/test";
import { copy } from "../../src/lib/copy";
import type { StudentWork, WorkspaceDoc } from "../../src/workspace/types";

const filler = Array.from({ length: 30 }, (_, i) => `Đoạn ${i + 1}: ${"một dòng đề bài khá dài ".repeat(8)}`).join("\n\n");
const doc: WorkspaceDoc = {
  version: 1, phase: "solve", title: "Bài làm lại", sources: [],
  blocks: [
    { type: "problem", id: "p", md: filler },
    { type: "steps", id: "s", problem_id: "p", input: "math", scaffold: [
      { kind: "choice", prompt: "Bước 1", options: ["Đáp án A1", "Đáp án B1"] },
      { kind: "choice", prompt: "Bước 2", options: ["Đáp án A2", "Đáp án B2"] },
    ] },
  ],
};

async function mockApi(page: Page, state: { current: StudentWork }) {
  await page.context().route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/sessions/current") return route.fulfill({ json: {
      session_id: "s", messages: [], html: null, active_workspace_id: "w",
      tabs: [{ workspace_id: "w", phase: "solve", doc, state: state.current }],
    } });
    if (path === "/api/workspaces/w/state") { state.current = route.request().postDataJSON().state; return route.fulfill({ status: 204 }); }
    if (path === "/api/sessions/s/check") return route.fulfill({ json: { ok: true, state: "ok", done: false } });
    if (path === "/api/sessions/s/turns") return route.fulfill({ contentType: "text/event-stream", body: 'event: done\ndata: {"turn_id":"t","stop_reason":"end_turn"}\n\n' });
    if (path === "/api/guest") return route.fulfill({ json: { guest_id: "g", created: false } });
    if (path.endsWith("/turn-status")) return route.fulfill({ json: { in_flight: false } });
    if (path === "/api/auth/methods") return route.fulfill({ json: { google: false, email: false } });
    if (path === "/api/me") return route.fulfill({ json: { signed_in: false } });
    if (path === "/api/sessions") return route.fulfill({ json: { sessions: [], next_before: null } });
    if (path === "/api/events") return route.fulfill({ json: { accepted: 0, rejected: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "unmocked", message: path } } });
  });
}

test("Làm lại: not-allowed cursor when untouched, and the desk keeps filling the screen after a reset", async ({ page }) => {
  await page.setViewportSize({ width: 1288, height: 677 });
  await mockApi(page, { current: {} });
  await page.goto("/");
  const main = page.getByRole("main");
  const reset = main.getByRole("button", { name: copy.workspaceReset, exact: true }).first();
  await expect(reset).toBeDisabled();
  expect(await reset.evaluate((el) => getComputedStyle(el).cursor)).toBe("not-allowed");

  const geometry = () => page.evaluate(() => {
    const work = document.querySelector("main")!;
    const scroll = document.querySelector("[data-pet-column]")!.parentElement!;
    const w = work.getBoundingClientRect(), s = scroll.getBoundingClientRect();
    return { workScrollTop: work.scrollTop, scrollTop: scroll.scrollTop, gap: Math.round(w.bottom - s.bottom), workHeight: Math.round(w.height), scrollHeight: Math.round(s.height) };
  });
  await page.evaluate(() => { const s = document.querySelector("[data-pet-column]")!.parentElement!; s.scrollTo(0, s.scrollHeight); });
  await main.getByRole("button", { name: "Đáp án B1" }).click();
  await expect(reset).toBeEnabled();
  await reset.click();
  await main.getByRole("group").getByRole("button", { name: copy.workspaceReset, exact: true }).click();
  await main.getByRole("button", { name: "Đáp án A1" }).click();
  // The outer <main> must never scroll: a sr-only span used to sit outside the inner scroller and gave it a scroll range,
  // so any focus()/scrollIntoView could slide the whole desk up and leave empty --bg underneath.
  await page.evaluate(() => { document.querySelector("main")!.scrollTop = 217; });
  const g = await geometry();
  expect(g.workScrollTop).toBe(0);
  expect(g.gap).toBe(0);
  expect(g.scrollHeight).toBe(g.workHeight);
});
