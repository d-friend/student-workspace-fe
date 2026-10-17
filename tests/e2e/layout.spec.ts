import { expect, test, type Page } from "@playwright/test";

import { copy } from "../../src/lib/copy";
import type { Block, WorkspaceDoc } from "../../src/workspace/types";

// Layout checks on a restored session, with the API mocked in the browser so no backend is needed.

const LONG = "Pneumonoultramicroscopicsilicovolcanoconiosis0123456789"; // one unbroken 55+ character word
const filler = (n: number): Block[] =>
  Array.from({ length: n }, (_, i) => ({ type: "text", id: `t${i}`, md: `Đoạn ${i}. Nội dung đủ dài để tài liệu cuộn được trên màn hình thấp.` }));

const learn: WorkspaceDoc = {
  version: 1,
  phase: "learn",
  title: `Lý thuyết ${LONG}`,
  sources: [],
  blocks: [
    { type: "heading", id: "h1", text: LONG, level: 2 },
    { type: "text", id: "tx", md: `Từ dài: ${LONG}` },
    { type: "callout", id: "c1", tone: "idea", md: LONG },
    { type: "example", id: "e1", title: LONG, problem_md: LONG, steps: [LONG] },
    { type: "quiz", id: "q1", question_md: LONG, answer: "choice", options: [LONG, "B"], explanation_md: "E" },
    ...filler(30).map((b) => ({ ...b, id: `l${b.id}` })),
  ],
};
const solve: WorkspaceDoc = {
  version: 1,
  phase: "solve",
  title: "Bài giải",
  sources: [],
  blocks: [{ type: "problem", id: "p1", md: `Đề: ${LONG}` }, ...filler(30), { type: "steps", id: "s1", problem_id: "p1", input: "math" }],
};

async function restore(page: Page) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/sessions/current") {
      return route.fulfill({
        json: {
          session_id: "s1",
          messages: [],
          html: null,
          phase: "solve",
          workspaces: { learn: { workspace_id: "L1", doc: learn }, solve: { workspace_id: "S1", doc: solve } },
        },
      });
    }
    if (path === "/api/guest") return route.fulfill({ json: { guest_id: "g", created: false } });
    if (path === "/api/events") return route.fulfill({ json: { accepted: 0, rejected: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "unmocked", message: path } } });
  });
  await page.goto("/");
  await expect(page.getByRole("tab", { name: copy.phaseSolve })).toBeVisible();
}

// The one element the doc scrolls in: the deepest overflow:auto box under main that holds the doc.
const scroller = (page: Page) =>
  page.locator("main").evaluateHandle((m) => [...m.querySelectorAll("div")].find((d) => getComputedStyle(d).overflowY === "auto")!);

test("a long unbroken word does not widen the doc at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await restore(page);
  for (const tab of [copy.phaseSolve, copy.phaseLearn]) {
    await page.getByRole("tab", { name: tab }).click();
    const s = await scroller(page);
    expect(await s.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});
