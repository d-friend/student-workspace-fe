import { expect, test, type Page } from "@playwright/test";
import { copy } from "../../src/lib/copy";

async function openAccount(page: Page, signedIn = false) {
  if (page.viewportSize()!.width < 800) {
    await page.getByRole("button", { name: copy.historyOpen, exact: true }).click();
  }
  await page.getByRole("button", { name: signedIn ? copy.authAccount : copy.historyLogin, exact: true }).click();
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`demo sign-in and aligned account actions at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await openAccount(page);
    const dialog = page.getByRole("dialog", { name: copy.authTitle });
    await dialog.getByRole("button", { name: copy.authDemo }).click();
    await dialog.getByLabel(copy.authEmail).fill("demo@email.hello");
    await dialog.getByLabel(copy.authPassword).fill("wrong");
    await dialog.getByRole("button", { name: copy.authVerify, exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(copy.authInvalidCredentials);
    await dialog.getByLabel(copy.authPassword).fill("123456");
    await dialog.getByRole("button", { name: copy.authVerify, exact: true }).click();
    await expect.poll(async () => (await (await page.request.get("/api/me")).json()).signed_in).toBe(true);
    await expect(dialog).toHaveCount(0);
    await openAccount(page, true);
    const account = page.getByRole("dialog", { name: copy.authAccount });
    await expect(account.getByText("demo@email.hello", { exact: true })).toBeVisible();
    const signOut = account.getByRole("button", { name: copy.authLogout });
    const close = account.getByRole("button", { name: copy.drawerClose });
    const a = (await signOut.boundingBox())!;
    const b = (await close.boundingBox())!;
    expect(Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(2);
    await page.screenshot({ path: `/tmp/dfriend-demo-account-${viewport.width}.png` });
    await signOut.click();
    await expect.poll(async () => (await (await page.request.get("/api/me")).json()).signed_in).toBe(false);
  });
}
