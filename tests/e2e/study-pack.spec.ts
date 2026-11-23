import { expect, test } from "./fixtures";

// Runs against the mock backend (MOCK=true): any photo reads as one page on Ôm's law, filed under Vật lí.
const PHOTO = "tests/fixtures/photo.jpg";

test("a photo of notes becomes concepts in the tree, the notes can be read back, and Học thêm starts a lesson from them", async ({ page }) => {
  await page.goto("/progress");
  await page.getByText("Chưa có bài nào ở đây").waitFor();
  await page.getByLabel("Chụp hoặc chọn ảnh vở, sách (tối đa 10 ảnh)").setInputFiles(PHOTO);

  const sheet = page.getByRole("dialog");
  // Concepts are a shared vocabulary: on a database that already saw this page, the same two are "updated", not "new".
  await expect(sheet.getByRole("status")).toHaveText(/Xong: \+\d+ khái niệm mới, \d+ cập nhật/, { timeout: 20_000 });
  await sheet.getByRole("link", { name: "Xem vở" }).click();

  await expect(page.getByRole("heading", { name: "Vật lí", level: 1 })).toBeVisible();
  await expect(page.getByRole("img", { name: "Ảnh trang vở số 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Định luật Ôm", level: 3 })).toBeVisible();
  await expect(page.getByText("[Hình: mạch điện gồm nguồn")).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();

  await page.getByRole("link", { name: "Về Tiến bộ" }).click();
  await expect(page.getByRole("link", { name: /Vật lí.*2 ảnh|Vật lí.*1 ảnh/ })).toBeVisible();
  await page.getByRole("treeitem", { name: "Định luật Ôm" }).click();
  await expect(page.getByText("Vở ghi", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Xem nguồn" }).click();
  await expect(page.locator("[data-highlight]")).toBeVisible(); // the block the summary came from

  await page.getByRole("link", { name: "Về Tiến bộ" }).click();
  await page.getByRole("treeitem", { name: "Định luật Ôm" }).click();
  await page.getByRole("button", { name: "Học thêm" }).click();
  await page.waitForURL("/");
  await expect(page.getByText("Mình muốn hiểu kĩ hơn: Định luật Ôm. Vở của mình ghi: «Định luật Ôm")).toBeVisible({ timeout: 15_000 });
  expect(new URL(page.url()).search).toBe(""); // the handoff is consumed
});

test("a pack whose subject the model is unsure of waits for the student's choice", async ({ page }) => {
  await page.goto("/progress");
  await page.getByText("Chưa có bài nào ở đây").waitFor();
  // The photo is re-encoded by the browser before it goes up, so the mock's __lowconf marker is sent straight to the API.
  const marked = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("__lowconf")]).toString("base64");
  const created = await page.request.post("/api/packs", { data: { photos: [{ media_type: "image/jpeg", data: marked }] } });
  expect(created.status()).toBe(202);
  const { id } = await created.json();

  await page.goto(`/packs/${id}`);
  await expect(page.getByText("Vở này thuộc môn nào?")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Vật lí" }).click();
  await expect(page.getByRole("heading", { name: "Vật lí", level: 1 })).toBeVisible();
  await expect(page.getByText("Xong", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Định luật Ôm").first()).toBeVisible();

  await page.getByRole("button", { name: "Đổi môn" }).click();
  await page.getByRole("button", { name: "Toán" }).click();
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
});
