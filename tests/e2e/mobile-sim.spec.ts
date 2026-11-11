import { expect, test, type Page } from "@playwright/test";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const scrollTop = (page: Page) => page.evaluate(() => document.querySelector("[data-pet-column]")!.parentElement!.scrollTop);

// A real touch swipe through the browser's input pipeline, so touch-action decides who gets it.
async function swipeUp(page: Page, x: number, y: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 20 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(400);
}

// Scroll by hand until the board's top is at y=200: scrollIntoViewIfNeeded never settles while the iframe resizes.
async function park(page: Page, selector: string) {
  const box = await page.frameLocator("iframe").locator(selector).boundingBox();
  expect(box).not.toBeNull();
  await page.evaluate((dy) => { document.querySelector("[data-pet-column]")!.parentElement!.scrollTop += dy; }, box!.y - 200);
  await page.waitForTimeout(200);
}

async function centre(page: Page, selector: string) {
  const box = await page.frameLocator("iframe").locator(selector).boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + Math.min(box!.height / 2, 90) };
}

test("boards with nothing JSXGraph can drag give the touch back to the page, draggable ones keep it", async ({ page }) => {
  await page.goto("/dev/fixtures?f=mobile-sim");
  const frame = page.frameLocator("iframe");
  const fixed = frame.locator("#fixed-board");
  await expect(fixed).toHaveCSS("touch-action", "pan-y pinch-zoom");
  await expect(frame.locator("#drag-board")).toHaveCSS("touch-action", "none");
  await expect(frame.locator("#slider-board")).toHaveCSS("touch-action", "none");
  // A sim that sets touch-action:none inline (as simulator-written HTML does) still gets overridden by the kit.
  await expect(frame.locator("#custom-board")).toHaveCSS("touch-action", "pan-y pinch-zoom");
  await frame.locator("#add-point").click();
  await expect(fixed).toHaveCSS("touch-action", "none");
});

test("a swipe that starts on a fixed board scrolls the page; on a draggable board it does not", async ({ page }) => {
  await page.goto("/dev/fixtures?f=mobile-sim");
  const frame = page.frameLocator("iframe");
  await expect(frame.locator("#fixed-board")).toHaveCSS("touch-action", "pan-y pinch-zoom");
  await park(page, "#fixed-board");
  const at = await centre(page, "#fixed-board");
  const before = await scrollTop(page);
  await swipeUp(page, at.x, at.y);
  expect(await scrollTop(page)).toBeGreaterThan(before);

  // The simulator-style board (inline touch-action:none, its own pointer drag) now scrolls the page too; its board drag is
  // the accepted loss on touch, which is why sims must also give every control a slider or button.
  await park(page, "#custom-board");
  const custom = await centre(page, "#custom-board");
  const beforeCustom = await scrollTop(page);
  await swipeUp(page, custom.x, custom.y);
  expect(await scrollTop(page)).toBeGreaterThan(beforeCustom);

  await park(page, "#drag-board");
  const drag = await centre(page, "#drag-board");
  const beforeDrag = await scrollTop(page);
  await swipeUp(page, drag.x, drag.y);
  expect(await scrollTop(page)).toBe(beforeDrag);
});

test("display math scrolls inside its own box", async ({ page }) => {
  await page.goto("/dev/fixtures?f=mobile-sim");
  const formula = page.locator("main .katex-display").first();
  await expect(formula).toHaveCSS("overflow-x", "auto");
  await expect.poll(() => formula.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator("main").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});
