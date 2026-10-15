import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { copy } from "../../src/lib/copy";

// The backend runs with MOCK=true (see playwright.config.ts), so replies are the canned ones from
// backend/app/agent/mock.py: any text gets the demo workspace, a photo gets the restatement and the demo.

const frame = (page: Page) => page.frameLocator(`iframe[title="${copy.workspaceTitle}"]`);
const composer = (page: Page) => page.getByLabel(copy.inputLabel);

function psql(sql: string): string {
  return execFileSync("docker", ["exec", "dfriend-db", "psql", "-U", "dfriend", "-d", "dfriend", "-tAc", sql], {
    encoding: "utf8",
  }).trim();
}

test("a full session: type, stream, workspace event, reload, new problem, photo", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.emptyTitle })).toBeVisible();

  // Type a problem: the reply streams and the workspace appears.
  await composer(page).fill("Tìm m để hàm số đồng biến");
  await composer(page).press("Enter");
  await expect(page.getByText("Try the workspace on the right.")).toBeVisible();
  await expect(frame(page).getByRole("button", { name: "Submit" })).toBeVisible();

  // A student click inside the frame starts a workspace turn.
  await frame(page).locator("#n").fill("4");
  await frame(page).getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/I saw this from the workspace/)).toBeVisible();

  // Reload restores the bubbles and the workspace.
  await page.reload();
  await expect(page.getByText("Tìm m để hàm số đồng biến")).toBeVisible();
  await expect(page.getByText(/I saw this from the workspace/)).toBeVisible();
  await expect(frame(page).getByRole("button", { name: "Submit" })).toBeVisible();

  // "Bài mới" brings back the empty state.
  await page.getByRole("button", { name: copy.newProblem }).click();
  await expect(page.getByRole("heading", { name: copy.emptyTitle })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);

  // Photo flow: PhotoCheck, send, the restatement with its chips.
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "../fixtures/photo.jpg"));
  await expect(page.getByRole("heading", { name: copy.photoTitle })).toBeVisible();
  await page.getByRole("button", { name: copy.sendPhoto }).click();
  await expect(page.getByText("Mình đọc đề là: (ảnh mẫu).")).toBeVisible();
  await expect(page.getByRole("button", { name: copy.restateYes })).toBeVisible();
  await expect(frame(page).getByRole("button", { name: "Submit" })).toBeVisible();

  // Tracking: let the 5 s queue flush, then the database has this guest's rows.
  await page.waitForTimeout(6000);
  const guest = (await context.cookies()).find((c) => c.name === "df_guest")?.value;
  expect(guest).toMatch(/^[0-9a-f-]{36}$/);
  const count = (table: string) => Number(psql(`SELECT count(*) FROM ${table} WHERE guest_id = '${guest}'`));
  expect(count("turns")).toBeGreaterThanOrEqual(3);
  expect(Number(psql(`SELECT count(*) FROM guests WHERE id = '${guest}'`))).toBe(1);
  expect(count("sessions")).toBeGreaterThanOrEqual(2);
  expect(count("events")).toBeGreaterThanOrEqual(5);
  expect(psql(`SELECT count(*) FROM events WHERE guest_id = '${guest}' AND source = 'workspace'`)).not.toBe("0");
  expect(psql(`SELECT string_agg(DISTINCT type, ',') FROM events WHERE guest_id = '${guest}' AND source = 'app'`)).toContain(
    "app_opened",
  );
  // No content: none of the typed text is anywhere in this guest's rows.
  const dump = psql(
    `SELECT row_to_json(t)::text FROM turns t WHERE guest_id = '${guest}' UNION ALL ` +
      `SELECT row_to_json(e)::text FROM events e WHERE guest_id = '${guest}'`,
  );
  expect(dump).not.toContain("Tìm m");
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
    body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }),
  });
  expect(res.status).toBe(200);
  const stamps: number[] = [];
  const reader = res.body!.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
    stamps.push(Date.now());
  }
  // The mock sends ~70 chunks over ~2 s. A buffering proxy would deliver them in one or two reads.
  expect(stamps.length).toBeGreaterThan(10);
  expect(stamps.at(-1)! - stamps[0]).toBeGreaterThan(500);
});
