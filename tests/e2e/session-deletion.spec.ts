import { expect, test, type Page } from "@playwright/test";
import { copy } from "../../src/lib/copy";

async function history(page: Page) {
  if (page.viewportSize()!.width < 800) {
    await page.getByRole("button", { name: copy.historyOpen, exact: true }).click();
  } else {
    const expand = page.getByRole("button", { name: copy.sidebarExpand });
    if (await expand.isVisible()) await expand.click();
  }
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}px history`, () => {
    test.use({ hasTouch: viewport.width < 800 });
    test(`student can cancel and confirm deleting the current session at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.getByLabel(copy.inputLabel).fill("__build");
      await page.getByLabel(copy.inputLabel).press("Enter");
      await expect(page.getByRole("heading", { name: "Tiếp tuyến của y = x³ − 2x", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: copy.newProblem, exact: true, includeHidden: true })).toBeEnabled();
      const current = await (await page.request.get("/api/sessions/current")).json();
      await history(page);
      const remove = page.getByRole("button", { name: copy.historyDelete, exact: true });
      await expect(remove).toBeEnabled();
      if (viewport.width >= 800) {
        await page.mouse.move(1000, 100);
        await expect(remove).toHaveCSS("opacity", "0");
        const session = page.getByRole("button", { name: /^Tiếp tuyến/, exact: false });
        await session.hover();
        await expect(remove).toHaveCSS("opacity", "1");
        await page.mouse.move(1000, 100);
        await expect(remove).toHaveCSS("opacity", "0");
        await session.focus();
        await expect(remove).toHaveCSS("opacity", "1");
      } else {
        await expect(remove).toHaveCSS("opacity", "0");
        const session = page.getByRole("button", { name: /^Tiếp tuyến/ });
        const box = (await session.boundingBox())!;
        const touch = await page.context().newCDPSession(page);
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart", touchPoints: [{ x: box.x + 30, y: box.y + box.height / 2 }],
        });
        await expect(remove).toHaveCSS("opacity", "1");
        await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect(session).toBeVisible();
        await expect(remove).toHaveCSS("opacity", "1");
        await touch.detach();
      }
      page.once("dialog", dialog => dialog.dismiss());
      await remove.click();
      expect((await page.request.get(`/api/sessions/${current.session_id}`)).status()).toBe(200);
      await page.screenshot({ path: `/tmp/dfriend-session-delete-${viewport.width}.png` });
      page.once("dialog", dialog => dialog.accept());
      await remove.click();
      await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
      expect((await page.request.get(`/api/sessions/${current.session_id}`)).status()).toBe(404);
      await history(page);
      await expect(page.getByText(copy.historyEmpty, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
    });
  });
}
