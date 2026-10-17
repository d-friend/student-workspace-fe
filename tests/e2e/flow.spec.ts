import { expect, test, type Page } from "@playwright/test";

import { copy } from "../../src/lib/copy";

// The backend runs with MOCK=true (see playwright.config.ts): replies come from backend/app/agent/mock.py,
// where "__build" builds the tangent solve workspace and "__learn" builds a learn workspace.

const composer = (page: Page) => page.getByLabel(copy.inputLabel);
const send = async (page: Page, text: string) => {
  await composer(page).fill(text);
  await composer(page).press("Enter");
};

test("build, check a line, add a learn phase, switch keeping input, reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.emptyTitle })).toBeVisible();

  await send(page, "__build");
  await expect(page.getByText("Mình dựng nhé.")).toBeVisible();
  await expect(page.getByText("Viết phương trình tiếp tuyến")).toBeVisible();
  const line = page.getByLabel(copy.lineLabel(1));
  await line.fill("f'(x)=3x^2-2");
  await page.getByRole("button", { name: copy.check }).click();
  await expect(page.getByText(copy.stateOk, { exact: true })).toBeVisible();

  // Type the next line without sending it, then add the learn phase.
  await page.getByLabel(copy.lineLabel(2)).fill("f'(2)=1");
  await send(page, "__learn");
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("tab", { name: copy.phaseLearn }).click();
  await expect(page.getByRole("heading", { name: "Ý tưởng" })).toBeVisible();
  await page.getByRole("tab", { name: copy.phaseSolve }).click();
  await expect(page.getByLabel(copy.lineLabel(2))).toHaveValue("f'(2)=1");

  // The server stores a turn when its stream ends: wait for it, or the reload races the turn.
  await expect
    .poll(async () => JSON.stringify(await (await page.request.get("/api/sessions/current")).json()))
    .toContain("Phương trình bậc nhất");
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab", { name: copy.phaseLearn })).toBeVisible();
  await expect(page.getByRole("tab", { name: copy.phaseSolve })).toBeVisible();
});

test("text arrives in chunks through the Next rewrite, not all at the end", async ({ baseURL }) => {
  const json = { "content-type": "application/json" };
  const guest = await fetch(`${baseURL}/api/guest`, { method: "POST", headers: json, body: "{}" });
  const cookie = (guest.headers.get("set-cookie") ?? "").split(";")[0];
  const session = await fetch(`${baseURL}/api/sessions`, {
    method: "POST",
    headers: { ...json, cookie },
    body: JSON.stringify({ started_via: "typed" }),
  });
  const { session_id } = await session.json();

  const res = await fetch(`${baseURL}/api/sessions/${session_id}/turns`, {
    method: "POST",
    headers: { ...json, cookie },
    body: JSON.stringify({ message: { role: "user", content: "__build" } }),
  });
  expect(res.status).toBe(200);
  const stamps: number[] = [];
  const reader = res.body!.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
    stamps.push(Date.now());
  }
  // A __build turn streams the announce, the workspace events and the closing text with mock delays in
  // between. A buffering proxy would deliver them in one or two reads.
  expect(stamps.length).toBeGreaterThanOrEqual(3);
  expect(stamps.at(-1)! - stamps[0]).toBeGreaterThan(20);
});
