import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { copy } from "../../src/lib/copy";

// Runs against the MOCK=true backend (see playwright.config.ts): "__build" builds the tangent solve workspace,
// "__learn" a learn workspace.

function psql(sql: string): string {
  return execFileSync("docker", ["exec", "dfriend-db", "psql", "-U", "dfriend", "-d", "dfriend", "-tAc", sql], {
    encoding: "utf8",
  }).trim();
}

const composer = (page: Page) => page.getByLabel(copy.inputLabel);
const pet = (page: Page) => page.getByRole("button", { name: copy.petOpen });
const drawer = (page: Page) => page.getByRole("dialog", { name: copy.drawerLabel });
const send = async (page: Page, text: string) => {
  await composer(page).fill(text);
  await composer(page).press("Enter");
};
const build = async (page: Page) => {
  await page.goto("/");
  await send(page, "__build");
  await expect(page.getByText("Viết phương trình tiếp tuyến")).toBeVisible();
  // The entry stays under the stage for the unfold (about 1 s); wait it out so only one composer exists.
  await expect(page.locator('[data-unfold="settled"]')).toBeAttached();
};

test("works without opening the chat", async ({ page }) => {
  await build(page);
  await page.getByRole("button", { name: copy.otherWay }).click();
  await page.getByLabel(copy.lineLabel(1)).fill("f'(x)=3x^2-2");
  await page.getByRole("button", { name: copy.check }).click();
  await expect(page.getByText(copy.stateOk, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: copy.hint }).click();
  await expect(page.getByText(copy.hintLevel(1))).toBeAttached();

  // A second phase without the chat: the agent builds it through the API (the same turn the drawer would send), then a
  // reload restores both phases. Nothing here clicks the pet.
  const { session_id } = await (await page.request.get("/api/sessions/current")).json();
  const turn = await page.request.post(`/api/sessions/${session_id}/turns`, {
    data: { message: { role: "user", content: "__learn" } },
  });
  expect(turn.ok()).toBe(true);
  await turn.body(); // the server stores the turn when its stream ends
  await page.reload();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await page.getByRole("tab", { name: copy.phaseLearn }).click();
  await expect(page.getByRole("heading", { name: "Ý tưởng" })).toBeVisible();
  await page.getByRole("tab", { name: copy.phaseSolve }).click();
  await page.getByRole("button", { name: copy.otherWay }).click(); // a reload restores the scaffold
  await expect(page.getByLabel(copy.lineLabel(1))).toBeVisible();
});

test("the pet opens the conversation; Escape closes it and focus returns", async ({ page }) => {
  await build(page);
  await pet(page).click();
  await expect(drawer(page)).toBeVisible();
  // The log keeps everything the bubble replaced.
  await expect(drawer(page).getByText("Mình dựng nhé.")).toBeVisible();
  await expect(drawer(page).getByText("__build")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(pet(page)).toBeFocused();
});

test("closing the bubble shows the unread badge; opening the chat clears it", async ({ page }) => {
  await build(page);
  // The bubble shows the latest thing said ("Xong rồi."), not the announce before it.
  const bubble = page.getByRole("status").filter({ hasText: "Xong rồi." });
  await expect(bubble).toBeVisible();
  await bubble.getByRole("button", { name: copy.bubbleClose }).click();
  await expect(bubble).toHaveCount(0);
  await expect(pet(page)).toHaveAccessibleDescription(copy.petUnread);

  await pet(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(pet(page)).not.toHaveAccessibleDescription(copy.petUnread);
});

test("restore never unfolds", async ({ page }) => {
  await build(page);
  // The turn is stored when its stream ends; reload only after that.
  await expect
    .poll(async () => await (await page.request.get("/api/sessions/current")).text())
    .toContain("Xong rồi.");
  // Watch from before the first paint of the reloaded page, so a one-frame fly card cannot slip by.
  await page.addInitScript(() => {
    const w = window as unknown as { __flew: boolean };
    w.__flew = false;
    const look = () => {
      if (document.querySelector('[data-fly], [data-unfold="flying"]')) w.__flew = true;
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await page.reload();
  await page.getByRole("button", { name: copy.otherWay }).click(); // a reload restores the scaffold
  await expect(page.getByLabel(copy.lineLabel(1))).toBeVisible();
  await page.waitForTimeout(1500); // longer than the unfold (about 1.05 s)
  expect(await page.evaluate(() => (window as unknown as { __flew: boolean }).__flew)).toBe(false);
});

test("a failed first build returns to the entry with the text restored and an alert", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
  await page.route("**/api/sessions/**", (route) => route.abort());
  await send(page, "Giải giúp mình bài này");
  // Next's route announcer is an empty role=alert too, so match the one with words.
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
  await expect(composer(page)).toHaveValue("Giải giúp mình bài này");
});

// Regression: a document-level listener that called setState before React's onChange swallowed the first keystroke
// of controlled inputs. jsdom cannot see that; real key events can.
test("real keystrokes reach the entry composer and the drawer composer", async ({ page }) => {
  await page.goto("/");
  await composer(page).click();
  await page.keyboard.type("abc", { delay: 60 });
  await expect(composer(page)).toHaveValue("abc");

  await send(page, "__build");
  await expect(page.getByText("Viết phương trình tiếp tuyến")).toBeVisible();
  await expect(page.locator('[data-unfold="settled"]')).toBeAttached();
  await pet(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(composer(page)).toBeFocused();
  await page.keyboard.type("abc", { delay: 60 });
  await expect(composer(page)).toHaveValue("abc");
});

test("fill then Enter posts a turn from the entry and from the drawer", async ({ page }) => {
  const turn = (page: Page) =>
    page.waitForRequest((r) => r.method() === "POST" && /\/api\/sessions\/[^/]+\/turns$/.test(new URL(r.url()).pathname));
  await page.goto("/");
  const first = turn(page);
  await send(page, "__build");
  await first;
  await expect(page.getByText("Viết phương trình tiếp tuyến")).toBeVisible();
  await expect(page.locator('[data-unfold="settled"]')).toBeAttached();

  await pet(page).click();
  const second = turn(page);
  await send(page, "__learn");
  await second;
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("opening the chat records chat_opened with unread false", async ({ page, context }) => {
  await build(page);
  const { session_id } = await (await page.request.get("/api/sessions/current")).json();
  await pet(page).click();
  await expect(drawer(page)).toBeVisible();
  const guest = (await context.cookies()).find((c) => c.name === "df_guest")?.value;
  expect(guest).toMatch(/^[0-9a-f-]{36}$/);
  // The client queue flushes every 5 s.
  await expect
    .poll(
      () =>
        psql(
          `SELECT props::text FROM events WHERE guest_id = '${guest}' AND session_id = '${session_id}' AND type = 'chat_opened'`,
        ),
      { timeout: 20_000 },
    )
    .toBe('{"unread": false}');
});
