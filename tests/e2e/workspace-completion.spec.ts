import { expect, test } from "@playwright/test";
import { copy } from "../../src/lib/copy";
import type { StudentWork, WorkspaceDoc } from "../../src/workspace/types";

const doc: WorkspaceDoc = {
  version: 1, phase: "solve", title: "Newton: acceleration and force partner", sources: [],
  blocks: [
    { type: "problem", id: "p", md: "Find the acceleration and identify the force partner." },
    { type: "heading", id: "h1", level: 2, text: "1. Acceleration" },
    { type: "steps", id: "part1", problem_id: "p", input: "math" },
    { type: "heading", id: "h2", level: 2, text: "2. Force partner" },
    { type: "steps", id: "part2", problem_id: "p", input: "text" },
  ],
};

for (const width of [1280, 390]) {
  test(`both parts must finish, including after reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let state: StudentWork = {};
    const checked: string[] = [];
    await page.context().route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/sessions/current") return route.fulfill({ json: {
        session_id: "s", messages: [], html: null, active_workspace_id: "w",
        tabs: [{ workspace_id: "w", phase: "solve", doc, state }],
      } });
      if (path === "/api/workspaces/w/state") {
        state = route.request().postDataJSON().state;
        return route.fulfill({ status: 204 });
      }
      if (path === "/api/sessions/s/check") {
        checked.push(route.request().postDataJSON().block_id);
        return route.fulfill({ json: { ok: true, state: "ok", done: true } });
      }
      if (path === "/api/sessions/s/turns") return route.fulfill({ contentType: "text/event-stream", body: 'event: done\ndata: {"turn_id":"t","stop_reason":"end_turn"}\n\n' });
      if (path === "/api/guest") return route.fulfill({ json: { guest_id: "g", created: false } });
      if (path.endsWith("/turn-status")) return route.fulfill({ json: { in_flight: false } });
      if (path === "/api/auth/methods") return route.fulfill({ json: { google: false, email: false } });
      if (path === "/api/me") return route.fulfill({ json: { signed_in: false } });
      if (path === "/api/sessions") return route.fulfill({ json: { sessions: [], next_before: null } });
      if (path === "/api/events") return route.fulfill({ json: { accepted: 0, rejected: [] } });
      return route.fulfill({ status: 404, json: { error: { code: "unmocked", message: path } } });
    });
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByRole("textbox")).toHaveCount(2);
    await main.getByRole("textbox").first().fill("2");
    await main.getByRole("button", { name: copy.check, exact: true }).first().click();
    await expect(main.getByRole("textbox")).toHaveCount(1);
    await expect(page.getByText(copy.doneLabel, { exact: true })).toHaveCount(0);
    await expect.poll(() => state.blocks?.part1?.done).toBe(true);
    expect(state.blocks?.part2?.done).not.toBe(true);
    await page.reload();
    await expect(main.getByRole("textbox")).toHaveCount(1);
    await expect(page.getByText(copy.doneLabel, { exact: true })).toHaveCount(0);
    await main.getByRole("textbox").fill("The cart pushes the person to the left.");
    await main.getByRole("button", { name: copy.check, exact: true }).click();
    await expect(page.getByText(copy.doneLabel, { exact: true })).toBeVisible();
    expect(checked).toEqual(["part1", "part2"]);
    await expect.poll(() => state.blocks?.part2?.done).toBe(true);
    await page.reload();
    await expect(page.getByText(copy.doneLabel, { exact: true })).toBeVisible();
    await expect(main.getByRole("textbox")).toHaveCount(0);
  });
}
