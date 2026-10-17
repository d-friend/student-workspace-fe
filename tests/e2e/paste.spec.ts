import { expect, test } from "@playwright/test";

import { copy } from "../../src/lib/copy";

// The API is mocked in the browser, so no backend is needed.

test("a pasted image becomes the photo; pasted text is left alone", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/sessions/current") return route.fulfill({ status: 204 });
    if (path === "/api/guest") return route.fulfill({ json: { guest_id: "g", created: false } });
    if (path === "/api/events") return route.fulfill({ json: { accepted: 0, rejected: [] } });
    return route.fulfill({ status: 404, json: { error: { code: "unmocked", message: path } } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.emptyTitle })).toBeVisible();

  const paste = (kind: "text" | "image") =>
    page.evaluate(async (k) => {
      const data = new DataTransfer();
      if (k === "text") data.setData("text/plain", "hello");
      else {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 8;
        const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), "image/png"));
        data.items.add(new File([blob], "screenshot.png", { type: "image/png" }));
      }
      const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    }, kind);

  expect(await paste("text")).toBe(false);
  await expect(page.getByRole("heading", { name: copy.photoTitle })).toHaveCount(0);
  expect(await paste("image")).toBe(true);
  await expect(page.getByRole("heading", { name: copy.photoTitle })).toBeVisible();
});
