import { expect, test, type Page } from "./fixtures";
import { copy } from "../../src/lib/copy";
import { MATH, projectViews, projectsFixture, reviewCards, sessionsFixture } from "../../src/app/dev/fixtures/projects/projectsFixture";

// Review mode. The review API is not on the mock backend yet, so its calls are answered in the browser: choice option 1 and number "5" are right.
const [choice] = reviewCards;
const answered: { id: string; body: { answer: string; attempt: number } }[] = [];
const created: unknown[] = [];

async function mockReview(page: Page, cards = reviewCards) {
  answered.length = 0;
  created.length = 0;
  await page.route("**/api/projects", route => route.fulfill({ json: { projects: projectsFixture } }));
  await page.route("**/api/projects/*", route => route.fulfill({ json: projectViews[route.request().url().split("/").pop()!] }));
  await page.route("**/api/sessions/current", route => route.fulfill({ status: 204 }));
  await page.route("**/api/sessions?project_id=*", route => route.fulfill({ json: { sessions: sessionsFixture.filter(s => s.project_id === MATH), next_before: null } }));
  await page.route("**/api/review?*", route => route.fulfill({ json: { due: cards.length, cards } }));
  await page.route("**/api/review/count", route => route.fulfill({ json: { projects: [{ project_id: MATH, due: cards.length }] } }));
  await page.route("**/api/review/*/answer", route => {
    const id = route.request().url().split("/").slice(-2)[0];
    const body = route.request().postDataJSON();
    answered.push({ id, body });
    const correct = id === choice.id ? body.answer === "1" : body.answer === "5";
    return route.fulfill({ json: { correct, explanation_md: "Vì $x^2 - 5x + 6 = (x-2)(x-3)$ nên hai nghiệm là $2$ và $3$.", box: correct ? 2 : 1, due_at: new Date(Date.now() + (correct ? 3 : 1) * 86_400_000).toISOString() } });
  });
  await page.route("**/api/sessions", route => {
    if (route.request().method() !== "POST") return route.fallback();
    created.push(route.request().postDataJSON());
    return route.fulfill({ json: { session_id: "ssssssss-0000-4000-8000-000000000001" } });
  });
}

const inside = async (page: Page, width: number) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await mockReview(page);
      await page.addInitScript(t => { try { window.localStorage.setItem("df-sidebar", "open"); window.localStorage.setItem("df-theme", t); } catch { /* storage blocked */ } }, theme);
    });

    test("phone: the row opens one card at a time; a wrong answer retries, Tiếp moves on, a problem card starts a similar session, the end names the next date", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/projects/${MATH}`);
      const row = page.getByRole("button", { name: copy.reviewStartLabel });
      await expect(row).toContainText(copy.reviewToday(3));
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await inside(page, 390);
      await row.click();
      await expect(page).toHaveURL(/tab=review/);
      await expect(page.getByRole("heading", { name: copy.reviewRow, level: 1 })).toBeVisible();
      await expect(page.getByText(copy.reviewCount(1, 3))).toBeVisible();
      await expect(page.locator(".katex").first()).toBeVisible();
      await inside(page, 390);
      await page.screenshot({ path: `test-results/review-phone-${theme}-quiz.png` });

      // Wrong first: the retry stays open and no explanation yet.
      await page.getByRole("radio").nth(0).click();
      await expect(page.getByRole("button", { name: copy.reviewNext })).toHaveCount(0);
      await page.getByRole("radio").nth(1).click();
      await expect(page.getByRole("button", { name: copy.reviewNext })).toBeVisible();
      await expect(page.getByText(/hai nghiệm là/)).toBeVisible();
      expect(answered.map(a => [a.id, a.body.answer, a.body.attempt])).toEqual([[choice.id, "0", 1], [choice.id, "1", 2]]);
      await page.screenshot({ path: `test-results/review-phone-${theme}-explained.png` });
      await page.getByRole("button", { name: copy.reviewNext }).click();

      await expect(page.getByText(copy.reviewCount(2, 3))).toBeVisible();
      await page.getByRole("textbox").fill("5");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: copy.reviewNext }).click();

      await expect(page.getByText(copy.reviewCount(3, 3))).toBeVisible();
      await expect(page.getByText(/Hai vòi nước/)).toBeVisible();
      await inside(page, 390);
      await page.screenshot({ path: `test-results/review-phone-${theme}-problem.png` });
      await page.getByRole("button", { name: copy.reviewSimilar }).click();
      await expect(page).toHaveURL(/\/\?/);
      await expect.poll(() => created.length).toBe(1);
      expect(created[0]).toMatchObject({ started_via: "review", project_id: MATH, review_card_id: reviewCards[2].id });
      await expect(page.getByText(copy.reviewSimilarMessage(reviewCards[2].problem!.excerpt_md).slice(0, 30))).toBeVisible();
    });

    test("desktop: the end screen says Xong with the next date, and Về môn học returns to the overview", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/projects/${MATH}?tab=review`);
      await page.getByRole("radio").nth(1).click();
      await page.getByRole("button", { name: copy.reviewNext }).click();
      await page.getByRole("textbox").fill("5");
      await page.keyboard.press("Enter");
      await page.getByRole("button", { name: copy.reviewNext }).click();
      await page.getByRole("button", { name: copy.reviewSkip }).click();
      await expect(page.getByText(/^Xong! Hẹn bạn/)).toBeVisible();
      await page.screenshot({ path: `test-results/review-desktop-${theme}-end.png` });
      await page.getByRole("button", { name: copy.reviewBack }).click();
      await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
      await expect(page).not.toHaveURL(/tab=/);
    });
  });
}

test("the overview has no review row when nothing is due", async ({ page }) => {
  await mockReview(page, []);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/projects/${MATH}`);
  await expect(page.getByRole("heading", { name: "Toán", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: copy.reviewStartLabel })).toHaveCount(0);
  await page.screenshot({ path: "test-results/review-desktop-overview-none.png" });
});

test("home: the chip shows the total due and opens the review of that subject", async ({ page }) => {
  await mockReview(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const chip = page.getByRole("link", { name: copy.homeReviewChip(3) });
  await expect(chip).toBeVisible();
  expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await inside(page, 390);
  await page.screenshot({ path: "test-results/review-phone-home-chip.png" });
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${MATH}\\?tab=review`));
  await expect(page.getByText(copy.reviewCount(1, 3))).toBeVisible();
});

test("home: no chip when nothing is due", async ({ page }) => {
  await mockReview(page, []);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: copy.entryTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ôn tập hôm nay/ })).toHaveCount(0);
});
