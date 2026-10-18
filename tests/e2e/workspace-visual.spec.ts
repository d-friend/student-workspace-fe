import { expect, test, type Page } from "@playwright/test";

import { copy } from "../../src/lib/copy";
import { fixtures } from "../../src/workspace/fixtures";

// Needs the web server built with NEXT_PUBLIC_FIXTURES=1 (playwright.config.ts).
const names = Object.keys(fixtures).map((k) => k.replace(/\.json$/, ""));
const sizes = [
  { w: 360, h: 740 },
  { w: 900, h: 800 },
];
const schemes = ["light", "dark"] as const;

async function open(page: Page, name: string, query = "") {
  await page.goto(`/dev/fixtures?f=${name}${query}`);
  await expect(page.locator("main h1")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  if (name === "graph" || name === "geometry") await expect(page.locator('main [class*="board"] svg').first()).toBeVisible();
}

for (const name of names) {
  for (const { w, h } of sizes) {
    for (const scheme of schemes) {
      test(`${name} ${w} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await open(page, name);
        const main = page.locator("main");
        expect(await main.evaluate((m) => m.scrollWidth <= m.clientWidth)).toBe(true);
        if (name === "custom") {
          const frame = page.frameLocator(`iframe[title="${copy.workspaceTitle}"]`);
          await expect(frame.locator("p")).toBeVisible();
          // The face must actually load inside the frame (needs the CORS header on /vendor/fonts).
          expect(await frame.locator("body").evaluate(async () => (await document.fonts.load('16px "Be Vietnam Pro"')).length > 0)).toBe(true);
          expect(await frame.locator("body").evaluate(() => document.fonts.check('16px "Be Vietnam Pro"'))).toBe(true);
        }
        // Show the whole document: lift the fixed-height shell so a full-page shot captures it.
        await page.addStyleTag({
          content: "aside[aria-label]{display:none!important}main{overflow:visible!important;flex:none!important}main>div>div{overflow:visible!important}div:has(>main){height:auto!important}",
        });
        await expect(page).toHaveScreenshot(`${name}-${w}-${scheme}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });
    }
  }
}

test("Be Vietnam Pro fonts are served with CORS for iframes", async ({ page }) => {
  const res = await page.request.get("/vendor/fonts/BeVietnamPro-latin-400.woff2", { headers: { origin: "null" } });
  expect(res.status()).toBe(200);
  expect(res.headers()["access-control-allow-origin"]).toBe("*");
});
