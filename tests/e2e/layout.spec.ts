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
          // History/login/roadmap spec §4.2: restore tabs by workspace id.
          active_workspace_id: "S1",
          tabs: [
            { workspace_id: "L1", phase: "learn", doc: learn },
            { workspace_id: "S1", phase: "solve", doc: solve },
          ],
        },
      });
    }
    if (path === "/api/guest") return route.fulfill({ json: { guest_id: "g", created: false } });
    if (path === "/api/events") return route.fulfill({ json: { accepted: 0, rejected: [] } });
    if (path === "/api/sessions/s1/active") return route.fulfill({ status: 204 });
    return route.fulfill({ status: 404, json: { error: { code: "unmocked", message: path } } });
  });
  await page.goto("/");
  await expect(page.getByRole("tab", { name: solve.title, exact: true })).toBeVisible();
}

// The one element the doc scrolls in: the deepest overflow:auto box under main that holds the doc.
const scroller = (page: Page) =>
  page.locator("main").evaluateHandle((m) => [...m.querySelectorAll("div")].find((d) => getComputedStyle(d).overflowY === "auto")!);

test("a long unbroken word does not widen the doc at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await restore(page);
  for (const tab of [solve.title, learn.title]) {
    await page.getByRole("tab", { name: tab }).click();
    const s = await scroller(page);
    expect(await s.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
});

test("the doc is centered in the workspace", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await restore(page);
  const s = await scroller(page);
  const [left, right] = await s.evaluate((el) => {
    const doc = el.firstElementChild!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return [doc.left - box.left, box.right - doc.right];
  });
  expect(left).toBeGreaterThan(0);
  expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
});

test("each phase keeps its own scroll position", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 500 });
  await restore(page);
  const s = await scroller(page);
  const scrollTo = (y: number) => s.evaluate((el, top) => { el.scrollTop = top; return el.scrollTop; }, y);
  const top = () => s.evaluate((el) => el.scrollTop);

  expect(await scrollTo(300)).toBe(300);
  await page.getByRole("tab", { name: learn.title, exact: true }).click();
  expect(await top()).toBe(0);
  expect(await scrollTo(120)).toBe(120);
  await page.getByRole("tab", { name: solve.title, exact: true }).click();
  await expect.poll(top).toBe(300);
  await page.getByRole("tab", { name: learn.title, exact: true }).click();
  await expect.poll(top).toBe(120);
});

for (const width of [1440, 1024, 360]) {
  test(`the pet does not cover the focused Steps input or Kiểm tra at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 740 : 800 });
    await restore(page);
    const input = page.getByLabel(copy.lineLabel(1));
    await input.focus(); // scrolls the field into view, at the bottom of the doc
    const pet = await page.getByRole("button", { name: copy.petOpen }).boundingBox();
    expect(pet).not.toBeNull();
    for (const target of [input, page.getByRole("button", { name: copy.check })]) {
      await expect(target).toBeInViewport();
      const box = (await target.boundingBox())!;
      const apart =
        pet!.x + pet!.width <= box.x || box.x + box.width <= pet!.x || pet!.y + pet!.height <= box.y || box.y + box.height <= pet!.y;
      expect(apart).toBe(true);
    }
  });
}
