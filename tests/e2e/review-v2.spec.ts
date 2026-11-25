import { expect, test, type Page } from "./fixtures";
import { copy } from "../../src/lib/copy";

// Review Mode v2 (documents/review-mode/spec-v2.md) against the mock backend (MOCK=true): the home card opens the intake,
// two taps build a review tab, and the tab is worked through to its end card. Every state of spec §3.2 is screenshotted into
// test-results/review-v2/ at 360, 390 and 1280 px, light and dark.
const SIZES = [{ w: 360, h: 780 }, { w: 390, h: 844 }, { w: 1280, h: 800 }] as const;
const OUT = "test-results/review-v2";

const composer = (page: Page) => page.getByLabel(copy.inputLabel);
const inside = async (page: Page, width: number) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
const quiz = (page: Page, text: string | RegExp) => page.locator("section", { hasText: text }).filter({ has: page.locator("[role=radiogroup], input") }).last();

async function open(page: Page, theme: "light" | "dark") {
  await page.addInitScript(t => { try { window.localStorage.setItem("df-theme", t); window.localStorage.setItem("df-sidebar", "closed"); } catch { /* storage blocked */ } }, theme);
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await expect(composer(page)).toBeVisible();
}

for (const { w, h } of SIZES) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${w}px ${theme}`, () => {
      test.use({ viewport: { width: w, height: h }, ...(w < 800 && { isMobile: true, hasTouch: true }) });

      test("home card → intake chips → review tab → quiz, practice, end card; project button and day-before chip", async ({ page }) => {
        const shot = async (name: string) => { await page.waitForTimeout(450); await page.screenshot({ path: `${OUT}/${w}-${theme}-${name}.png` }); }; // past the doc's fade-in
        await open(page, theme);

        // Home: the fourth card.
        const card = page.getByRole("button", { name: new RegExp(copy.reviewHomeMain) });
        await expect(card).toBeVisible();
        expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await inside(page, w);
        await shot("home-card");

        // Intake: two taps, never a form.
        await card.click();
        await expect(page.getByText("Khi nào bạn kiểm tra?").last()).toBeVisible();
        await inside(page, w);
        await shot("intake-when");
        await page.getByRole("button", { name: "Mai", exact: true }).click();
        await expect(page.getByText("Ôn phần nào?").last()).toBeVisible();
        await expect(page.getByRole("button", { name: copy.reviewPhotoChip })).toBeVisible();
        await shot("intake-scope");
        await page.getByRole("button", { name: "Cả chương II" }).click();

        // The review tab.
        await expect(page.getByRole("button", { name: copy.reviewStartTest })).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText(copy.reviewExam(copy.reviewExamTomorrow("")).replace(/\(\)$/, "").trim(), { exact: false })).toBeVisible();
        await expect(page.locator(".katex").first()).toBeVisible();
        await inside(page, w);
        await shot("review-top");
        await page.getByText(copy.reviewMistake).scrollIntoViewIfNeeded();
        await shot("review-notes");

        // Self-test: a choice quiz answered wrong twice shows the explanation and the way back to the note.
        await page.getByRole("button", { name: copy.reviewStartTest }).click();
        const q1 = page.getByText("Tiếp tuyến của đường tròn vuông góc với đường nào").locator("xpath=ancestor::section[1]");
        await expect(q1).toBeVisible();
        await q1.getByRole("radio", { name: "Đường kính bất kỳ" }).click();
        await expect(q1.getByRole("radio", { name: /Đường kính bất kỳ/ })).toContainText(copy.stateReview);
        await q1.getByRole("radio", { name: "Dây cung" }).click();
        const again = q1.getByRole("button", { name: copy.reviewSeeAgain("Tiếp tuyến") });
        await expect(again).toBeVisible();
        expect((await again.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await q1.scrollIntoViewIfNeeded();
        await shot("quiz-wrong-explained");
        await again.click();
        await expect(page.getByRole("heading", { name: "Tiếp tuyến", level: 3, exact: true })).toBeInViewport();

        // The rest: right answers.
        const numeric = async (question: string, value: string) => {
          const s = page.getByText(question, { exact: false }).locator("xpath=ancestor::section[1]");
          await s.getByRole("textbox").fill(value);
          await s.getByRole("button", { name: copy.answer }).click();
        };
        await numeric("tiếp xúc", "12");
        await page.getByText("Góc nội tiếp bằng bao nhiêu lần").locator("xpath=ancestor::section[1]").getByRole("radio", { name: "Một nửa" }).click();
        await numeric("chắn nửa đường tròn", "90");
        await numeric("Bán kính đường tròn ngoại tiếp", "2,5");
        await expect(page.getByRole("button", { name: new RegExp(copy.reviewSegTest) })).toContainText("5/5");

        // Practice cards.
        await page.getByText(copy.reviewPracticeTitle(1, "Tiếp tuyến")).scrollIntoViewIfNeeded();
        await expect(page.getByRole("button", { name: copy.reviewPractice })).toHaveCount(2);
        await inside(page, w);
        await shot("practice");
        await page.getByRole("button", { name: copy.reviewPractice }).first().click();
        await expect(page.getByText("Chọn ẩn là gì?")).toBeVisible({ timeout: 30_000 }); // the practice tab, built from the card

        // Mark that problem done through the saved state, as finishing it would; "Để sau" on the other card.
        // The tab shows while the build streams; the turn saves it when it ends.
        const sessionNow = async () => (await (await page.request.get("/api/sessions/current")).json()) as { session_id: string; tabs: { phase: string; workspace_id: string; parent_workspace_id: string | null; doc: { from_block?: string } }[] };
        await expect.poll(async () => (await sessionNow()).tabs.length, { timeout: 30_000 }).toBe(2);
        const current = await sessionNow();
        const practice = current.tabs.find(t => t.phase !== "review")!;
        const review = current.tabs.find(t => t.phase === "review")!;
        expect(practice.parent_workspace_id).toBe(review.workspace_id);
        expect(practice.doc.from_block).toBe("p1");
        expect((await page.request.put(`/api/workspaces/${practice.workspace_id}/state`, { data: { state: { blocks: { s1: { type: "steps", entries: [], done: true, free: false } } } } })).status()).toBe(204);
        await expect.poll(async () => { // the answers are saved a moment after the last tap
          const saved = (await sessionNow()).tabs.find(t => t.phase === "review") as unknown as { state?: { blocks?: Record<string, { done?: boolean }> } };
          return Object.values(saved.state?.blocks ?? {}).filter(b => b.done).length;
        }).toBe(5);
        await page.reload();
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        await page.getByRole("tab", { name: /Ôn tập/ }).click();
        await page.getByRole("button", { name: copy.reviewLater }).click();
        await expect(page.getByText(copy.reviewDoneBadge)).toBeVisible();
        await expect(page.getByText(copy.reviewLaterBadge)).toBeVisible();
        await page.getByText(copy.reviewPracticeTitle(1, "Tiếp tuyến")).scrollIntoViewIfNeeded();
        await shot("practice-done-skipped");

        // The end card: the promise is true, so it names a day.
        const end = page.getByRole("status").filter({ hasText: copy.reviewEnd(4, 5) });
        await expect(end).toBeVisible();
        await expect(end).toContainText(copy.reviewKept(1, copy.reviewTomorrow));
        await end.scrollIntoViewIfNeeded();
        await inside(page, w);
        await shot("end-card");

        // The project's button, with the cards waiting under it; then the day-before chip on home.
        const projects = (await (await page.request.get("/api/projects")).json()).projects as { id: string; name: string }[];
        expect(projects).toHaveLength(1);
        await page.route("**/api/review/count", route => route.fulfill({ json: { projects: [{ project_id: projects[0].id, due: 3, exam_tomorrow: true }] } }));
        await page.goto(`/projects/${projects[0].id}`);
        const button = page.getByRole("button", { name: new RegExp(copy.reviewProjectButton) });
        await expect(button).toContainText(copy.reviewProjectDue(3));
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await inside(page, w);
        await shot("project-button");

        await page.evaluate(id => fetch(`/api/sessions/${id}/end`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "new_problem" }) }), current.session_id);
        await page.goto("/");
        const chip = page.getByRole("button", { name: copy.homeReviewChipExam(projects[0].name, 3) });
        await expect(chip).toBeVisible();
        expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await inside(page, w);
        await shot("home-chip");
        await page.unroute("**/api/review/count");
      });
    });
  }
}

test.describe("keyboard", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("focus runs segmented bar → notes → quiz options → practice buttons", async ({ page }) => {
    await open(page, "light");
    await composer(page).fill("__review");
    await composer(page).press("Enter");
    const start = page.getByRole("button", { name: copy.reviewStartTest });
    await expect(start).toBeVisible({ timeout: 30_000 });
    await page.getByRole("navigation", { name: copy.reviewSegments }).getByRole("button").first().focus();
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      seen.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; return `${e.getAttribute("role") ?? e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") ?? e.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}`; }));
      await page.keyboard.press("Tab");
    }
    const at = (needle: RegExp) => seen.findIndex(s => needle.test(s));
    const order = [/Ghi nhớ/, /Tự kiểm tra/, /Luyện đề/, new RegExp(copy.reviewStartTest), /radio:Bán kính/, /input:|textbox/, new RegExp(copy.reviewPractice)].map(at);
    expect(order.every(i => i >= 0), seen.join("\n")).toBe(true);
    expect(order, seen.join("\n")).toEqual([...order].sort((a, b) => a - b));
  });
});
