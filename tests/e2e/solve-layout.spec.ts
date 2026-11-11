import { expect, test, type Page } from "./fixtures";

import { copy } from "../../src/lib/copy";

const viewports = [{ width: 375, height: 812 }, { width: 1280, height: 800 }];
const fixtures = ["solve-patrol-boat", "solve-patrol-boat-v4"];

// Definition of done: no text clips or overflows, and nothing scrolls sideways. The scroller and the page must not scroll
// horizontally; text-bearing elements must not clip their content. Layout containers are skipped on purpose: the mobile
// action bar is full-bleed and the bubble's close button hangs in its row's padding, so their parents' scrollWidth is larger
// without any text being hidden. KaTeX internals (1px strut spans) and visually hidden text (clientWidth <= 1) are skipped too.
const TEXT_TAGS = new Set(["BUTTON", "P", "H1", "H2", "H3", "LI", "LABEL", "A", "SPAN"]);
async function horizontalOverflow(page: Page) {
  return page.evaluate((textTags) => {
    const scroller = document.querySelector("[data-pet-column]")?.parentElement;
    if (!scroller) return ["workspace scroller missing"];
    const out: string[] = [];
    if (scroller.scrollWidth > scroller.clientWidth + 1) out.push(`scroller (${scroller.scrollWidth}/${scroller.clientWidth})`);
    const page = document.documentElement;
    if (page.scrollWidth > page.clientWidth + 1) out.push(`page (${page.scrollWidth}/${page.clientWidth})`);
    for (const el of scroller.querySelectorAll("*")) {
      if (el.closest(".katex") || el.clientWidth <= 1 || !textTags.includes(el.tagName)) continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} (${el.scrollWidth}/${el.clientWidth})`);
    }
    return out;
  }, [...TEXT_TAGS]);
}

type Box = { x: number; y: number; width: number; height: number };
function intersects(a: Box, b: Box) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

for (const viewport of viewports) {
  for (const fixture of fixtures) {
    test(`${fixture} fits at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/dev/fixtures?f=${fixture}`);
      const group = page.locator('[data-pet-anchor] [role="group"]');
      const options = group.getByRole("button");
      await expect(options.first()).toBeVisible();
      await expect.poll(() => horizontalOverflow(page)).toEqual([]);
      const container = await group.boundingBox();
      expect(container).not.toBeNull();
      for (const option of await options.all()) {
        await expect(option).toBeVisible();
        const box = await option.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(-1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
        expect(box!.x).toBeGreaterThanOrEqual(container!.x - 1);
        expect(box!.x + box!.width).toBeLessThanOrEqual(container!.x + container!.width + 1);
      }
      if (viewport.width === 375) {
        // A sticky bar always covers content that has not scrolled up yet; what matters is that nothing stays trapped behind
        // it, so scroll to the end of the doc (the doc's bottom padding is the bar's height) and check every option is clear.
        await page.evaluate(() => {
          const scroller = document.querySelector("[data-pet-column]")?.parentElement;
          scroller?.scrollTo(0, scroller.scrollHeight);
        });
        const bar = await page.locator("[data-action-bar]").boundingBox();
        expect(bar).not.toBeNull();
        for (const option of await options.all()) {
          const box = await option.boundingBox();
          expect(box).not.toBeNull();
          expect(intersects(bar!, box!)).toBe(false);
        }
      }
    });
  }

  test(`live solve finishes with PATCH and chips below the banner at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByLabel(copy.inputLabel).fill("__build");
    await page.getByLabel(copy.inputLabel).press("Enter");
    for (const option of ["Vận tốc ca nô khi nước yên lặng", "Dòng nước cùng chiều chuyển động", "Tổng thời gian hai lượt là 4 giờ"]) {
      await page.getByRole("button", { name: option, exact: true }).click();
    }
    await page.getByLabel(copy.blankLabel(4)).fill("12");
    await page.getByRole("button", { name: copy.check, exact: true }).click();
    const doc = page.locator('section[data-phase="solve"]');
    const banner = doc.getByRole("status").filter({ hasText: copy.doneLabel });
    await expect(banner).toBeVisible();
    const done = doc.locator("[data-pet-done]");
    const spoken = done.locator("[data-pet-spoken-slot]");
    const next = spoken.getByRole("button", { name: /^Học tiếp:/ });
    const similar = spoken.getByRole("button", { name: "Bài tương tự", exact: true });
    await expect(next).toBeVisible();
    await expect(similar).toBeVisible();
    await done.scrollIntoViewIfNeeded();
    const bannerBox = await banner.boundingBox();
    const columnBox = await page.locator("[data-pet-column]").boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(columnBox).not.toBeNull();
    for (const chip of [next, similar, spoken.getByRole("button", { name: copy.writeOwn, exact: true })]) {
      await expect(chip).toBeVisible();
      const box = await chip.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(bannerBox!.y + bannerBox!.height);
      expect(box!.x).toBeGreaterThanOrEqual(columnBox!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(columnBox!.x + columnBox!.width);
    }
    const pet = done.locator("[data-pet-slot]").getByRole("button", { name: copy.petOpen });
    await expect(pet).toBeVisible();
    const petBox = await pet.boundingBox();
    expect(petBox).not.toBeNull();
    expect(intersects(petBox!, bannerBox!)).toBe(false);
    const accepted = doc.locator("li").filter({ has: page.getByLabel(copy.stateOk, { exact: true }) });
    await expect(accepted).toHaveCount(4);
    for (const line of await accepted.all()) {
      const box = await line.boundingBox();
      expect(box).not.toBeNull();
      expect(intersects(petBox!, box!)).toBe(false);
    }
    await expect(page.locator('[data-place="inline"]')).toHaveCount(1);
    await expect(page.locator("[data-place] [data-bubble]")).toHaveCount(0);
    await expect(page.locator("[data-place] button")).toHaveCount(0);
    await expect.poll(() => horizontalOverflow(page)).toEqual([]);
  });

  test(`live solve keeps PATCH clear and advances at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByLabel(copy.inputLabel).fill("__build");
    await page.getByLabel(copy.inputLabel).press("Enter");
    const active = page.locator("[data-pet-anchor]");
    const options = active.getByRole("group").getByRole("button");
    const pet = active.getByRole("button", { name: copy.petOpen });
    const prompt = active.locator("p[id]");
    await expect(page.getByLabel(copy.stepProgress(1, 4), { exact: true })).toBeVisible();
    await expect(pet).toBeVisible();
    await expect(prompt).toBeVisible();
    await expect(options.first()).toBeVisible();
    await expect.poll(() => horizontalOverflow(page)).toEqual([]);
    const petBox = await pet.boundingBox();
    const promptBox = await prompt.boundingBox();
    expect(petBox).not.toBeNull();
    expect(promptBox).not.toBeNull();
    expect(intersects(petBox!, promptBox!)).toBe(false);
    for (const option of await options.all()) {
      const box = await option.boundingBox();
      expect(box).not.toBeNull();
      expect(intersects(petBox!, box!)).toBe(false);
    }
    await page.getByRole("button", { name: "Vận tốc ca nô khi nước yên lặng", exact: true }).click();
    await expect(page.getByLabel(copy.stateOk, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.expandProblem })).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel(copy.stepProgress(2, 4), { exact: true })).toBeVisible();
  });
}

test("geometry stays behind the sticky problem header", async ({ page }) => {
  // A short viewport makes the fixture doc scrollable, so the figure can be scrolled up under the sticky header.
  await page.setViewportSize({ width: 375, height: 520 });
  await page.goto("/dev/fixtures?f=solve-patrol-boat-figure");
  const board = page.locator('[data-block-id="so_do"] [role="region"]');
  await expect(board.locator("svg")).toBeVisible();
  await expect(board.getByText("Ngược dòng: 60 km")).toBeAttached();
  await page.getByRole("button", { name: "Vận tốc ca nô khi nước yên lặng", exact: true }).click();
  const header = page.locator('[data-block-id="bai_toan"] > div');
  await expect(page.getByRole("button", { name: copy.expandProblem })).toHaveAttribute("aria-expanded", "false");
  await page.evaluate(() => {
    const scroller = document.querySelector("[data-pet-column]")!.parentElement!;
    const header = document.querySelector('[data-block-id="bai_toan"] > div')!.getBoundingClientRect();
    const board = document.querySelector('[data-block-id="so_do"] [role="region"]')!.getBoundingClientRect();
    const stickyCenter = scroller.getBoundingClientRect().top + 60 + header.height / 2;
    scroller.scrollTop += board.top + board.height / 2 - stickyCenter;
  });
  await expect.poll(async () => {
    const a = await header.boundingBox();
    const b = await board.boundingBox();
    return !!a && !!b && intersects(a, b);
  }).toBe(true);
  // JSXGraph labels have pointer-events: none, so a hit test cannot see them. Compare what is painted instead: the header
  // area must look identical with the figure shown and with the figure hidden (nothing of the figure paints over the header).
  const clip = await header.boundingBox();
  expect(clip).not.toBeNull();
  const withFigure = await page.screenshot({ clip: clip! });
  await board.evaluate((el) => { (el as HTMLElement).style.visibility = "hidden"; });
  const withoutFigure = await page.screenshot({ clip: clip! });
  expect(withFigure.equals(withoutFigure)).toBe(true);
});
