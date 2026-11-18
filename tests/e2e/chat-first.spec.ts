import { expect, test, type Page } from "./fixtures";

import { copy } from "../../src/lib/copy";

// Chat-first UI (documents/chat-mode/spec.md §4), on a phone with the mock backend (MOCK=true):
// plain text gets a text-only reply, "__build" builds the solve workspace, "__opts" asks a question with chips.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const SOLVE = "Ca nô xuôi và ngược dòng";
const composer = (page: Page) => page.getByLabel(copy.inputLabel);
const chat = (page: Page) => page.getByTestId("chat-view");
const send = async (page: Page, text: string) => {
  await composer(page).fill(text);
  await chat(page).locator("textarea").press("Enter");
};
const open = async (page: Page) => {
  await page.goto("/");
  // The dev overlay would intercept taps in `next dev`.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await expect(composer(page)).toBeVisible();
};
// 1x1 PNG: createImageBitmap decodes it, readPhoto turns it into a JPEG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("a first message that gets a text reply stays in the thread", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
  await send(page, "xin chào");
  await expect(chat(page).getByText("xin chào", { exact: true })).toBeVisible();
  await expect(chat(page).getByText(/Mình đọc đề là/).last()).toBeVisible();
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toHaveCount(0);
  await send(page, "tiếp nhé");
  await expect(chat(page).getByText("xin chào", { exact: true })).toBeVisible();
  await expect(chat(page).getByText("tiếp nhé", { exact: true })).toBeVisible();
});

test("a failed first message stays marked failed and Thử lại resends it", async ({ page }) => {
  await open(page);
  await page.route("**/turns", (route) => route.fulfill({ status: 500, json: { error: { code: "boom", message: "boom" } } }));
  await send(page, "xin chào");
  await expect(chat(page).getByText("xin chào", { exact: true })).toBeVisible();
  await expect(chat(page).getByText(copy.errConnect())).toBeVisible();
  await expect(chat(page).getByText(/boom/)).toHaveCount(0); // no raw server text
  await expect(composer(page)).toHaveValue("");
  await page.unroute("**/turns");
  await chat(page).getByRole("button", { name: copy.retry }).click();
  await expect(chat(page).getByText(/Mình đọc đề là/).last()).toBeVisible();
  await expect(chat(page).getByRole("button", { name: copy.retry })).toHaveCount(0);
});

test("a build adds a card, opens the workspace, and ← Chat returns to the thread with the card", async ({ page }) => {
  await open(page);
  await send(page, "__build");
  await expect(page.getByText("Chọn ẩn là gì?")).toBeVisible();
  await expect(chat(page)).toBeHidden();
  await page.getByRole("button", { name: copy.backToChat }).click();
  await expect(chat(page)).toBeVisible();
  await expect(chat(page).getByText(SOLVE)).toBeVisible();
  await chat(page).getByRole("button", { name: copy.workspaceOpen }).click();
  await expect(page.getByText("Chọn ẩn là gì?")).toBeVisible();
});

test("a question asked while in the workspace shows in the ask strip and a chip answers it", async ({ page }) => {
  await open(page);
  await send(page, "__build");
  await expect(page.getByText("Chọn ẩn là gì?")).toBeVisible();
  await page.getByRole("button", { name: copy.backToChat }).click();
  await send(page, "__opts");
  await expect(chat(page).getByText("Vì sao bước này đúng?")).toBeVisible();
  await chat(page).getByRole("button", { name: copy.workspaceOpen }).click();

  const strip = page.locator("[data-ask-strip]");
  await expect(strip.getByText("Vì sao bước này đúng?")).toBeVisible();
  const choice = page.getByRole("button", { name: "Vận tốc ca nô khi nước yên lặng", exact: true });
  await expect(choice).toBeDisabled();
  await strip.getByRole("button", { name: "Vì A", exact: true }).click();
  await expect(strip).toHaveCount(0);
  await expect(choice).toBeEnabled();
});

test("three photos picked at once show in the tray, in the bubble and in the request", async ({ page }) => {
  await open(page);
  const files = [1, 2, 3].map((n) => ({ name: `p${n}.png`, mimeType: "image/png", buffer: PNG }));
  await page.locator("input[type=file]:not([capture])").setInputFiles(files);
  await expect(page.getByRole("button", { name: copy.removePhoto })).toHaveCount(3);

  const request = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith("/turns"));
  await chat(page).locator("textarea").press("Enter");
  const content = (await request).postDataJSON().message.content as { type: string }[];
  expect(content.filter((b) => b.type === "image")).toHaveLength(3);
  await expect(chat(page).locator("img")).toHaveCount(3);
});
