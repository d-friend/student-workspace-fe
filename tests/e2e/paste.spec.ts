import { expect, test } from "./fixtures";

import { copy } from "../../src/lib/copy";

// The API is mocked in the browser, so no backend is needed.

test("pasted images fill the tray and open a preview; pasted text is left alone", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/sessions/current") return route.fulfill({ status: 204 });
    if (path === "/api/guest") return route.fulfill({ json: { guest_id: "g", created: false } });
    if (path === "/api/events") return route.fulfill({ json: { accepted: 0, rejected: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "unmocked", message: path } } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();

  const paste = (kind: "text" | "image") =>
    page.evaluate(async (k) => {
      const data = new DataTransfer();
      if (k === "text") data.setData("text/plain", "hello");
      else {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 8;
        const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), "image/png"));
        data.items.add(new File([blob], "screenshot.png", { type: "image/png" }));
        data.items.add(new File([blob], "detail.png", { type: "image/png" }));
      }
      const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    }, kind);

  expect(await paste("text")).toBe(false);
  await expect(page.getByRole("button", { name: copy.removePhoto })).toHaveCount(0);
  expect(await paste("image")).toBe(true);
  await expect(page.getByRole("button", { name: copy.removePhoto })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
  await page.getByRole("button", { name: copy.photoChip }).first().click();
  const preview = page.getByRole("dialog", { name: copy.photoChip });
  await expect(preview.getByRole("img", { name: copy.photoChip })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
});
