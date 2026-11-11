import { expect, test } from "@playwright/test";
import { copy } from "../../src/lib/copy";

test("a new student saves their profile once", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: copy.profileTitle });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(copy.profileNickname).fill("An");
  await dialog.getByLabel(copy.profileProvince).fill("Hà Nội");
  await dialog.getByLabel(copy.profileGrade).selectOption("8");
  await dialog.getByLabel(copy.profileSchool).fill("Trường A");
  await dialog.getByRole("button", { name: copy.profileStart }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel(copy.inputLabel)).toBeVisible();
  await expect(dialog).toHaveCount(0);
});


test("a new student can skip the profile once", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: copy.profileTitle });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: copy.profileSkip }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel(copy.inputLabel)).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
