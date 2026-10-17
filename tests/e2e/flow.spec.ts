import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { copy } from "../../src/lib/copy";

// The backend runs with MOCK=true (see playwright.config.ts): replies come from backend/app/agent/mock.py,
// where "__build" builds the tangent solve workspace and "__learn" builds a learn workspace.

function psql(sql: string): string {
  return execFileSync("docker", ["exec", "dfriend-db", "psql", "-U", "dfriend", "-d", "dfriend", "-tAc", sql], {
    encoding: "utf8",
  }).trim();
}

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

// Typed content that must never reach the turns or events tables: a line the checker rejects, and a quiz answer.
const LINE = "qzx9917";
const ANSWER = "7654321";

test("a student gesture starts a turn, new problem, photo, tracking rows without content", async ({ page, context }) => {
  await page.goto("/");
  await send(page, "__build");
  await expect(page.getByText("Viết phương trình tiếp tuyến")).toBeVisible();

  // A rejected line is a student gesture the master must see: it answers on its own.
  await page.getByLabel(copy.lineLabel(1)).fill(LINE);
  await page.getByRole("button", { name: copy.check }).click();
  await expect(page.getByText(copy.stateReview, { exact: true })).toBeVisible();
  await expect(page.getByText(/I saw this from the workspace/)).toBeVisible();

  // A quiz answer in the learn phase.
  await send(page, "__learn");
  await page.getByRole("tab", { name: copy.phaseLearn }).click();
  await page.getByLabel(copy.answer).fill(ANSWER);
  const checked = page.waitForResponse((r) => r.url().includes("/check"));
  await page.getByRole("button", { name: copy.answer }).click();
  await checked;

  // The server stores a turn when its stream ends: wait for it before leaving the session.
  await expect
    .poll(async () => JSON.stringify(await (await page.request.get("/api/sessions/current")).json()))
    .toContain("Phương trình bậc nhất");

  // "Bài mới" brings back the empty state.
  await page.getByRole("button", { name: copy.newProblem }).click();
  await expect(page.getByRole("heading", { name: copy.emptyTitle })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(0);

  // Photo flow: PhotoCheck, send, the restatement with its chips.
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "../fixtures/photo.jpg"));
  await expect(page.getByRole("heading", { name: copy.photoTitle })).toBeVisible();
  await page.getByRole("button", { name: copy.sendPhoto }).click();
  await expect(page.getByText(/Mình đọc đề là/)).toBeVisible();
  await expect(page.getByRole("button", { name: copy.restateYes })).toBeVisible();

  // Tracking: let the 5 s queue flush, then the database has this guest's rows.
  await page.waitForTimeout(6000);
  const guest = (await context.cookies()).find((c) => c.name === "df_guest")?.value;
  expect(guest).toMatch(/^[0-9a-f-]{36}$/);
  const count = (table: string) => Number(psql(`SELECT count(*) FROM ${table} WHERE guest_id = '${guest}'`));
  expect(count("turns")).toBeGreaterThanOrEqual(3);
  expect(count("sessions")).toBeGreaterThanOrEqual(2);
  expect(count("events")).toBeGreaterThanOrEqual(5);
  expect(psql(`SELECT count(*) FROM events WHERE guest_id = '${guest}' AND source = 'workspace'`)).not.toBe("0");
  expect(psql(`SELECT string_agg(DISTINCT type, ',') FROM events WHERE guest_id = '${guest}' AND source = 'app'`)).toContain("app_opened");

  // No content: neither the typed line nor the quiz answer is anywhere in this guest's rows.
  const dump = psql(
    `SELECT row_to_json(t)::text FROM turns t WHERE guest_id = '${guest}' UNION ALL ` +
      `SELECT row_to_json(e)::text FROM events e WHERE guest_id = '${guest}'`,
  );
  expect(dump).not.toContain(LINE);
  expect(dump).not.toContain(ANSWER);
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
