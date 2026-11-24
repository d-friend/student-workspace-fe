import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ReviewSession } from "@/components/review/ReviewSession";
import * as api from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { similarProblemUrl } from "@/lib/review";
import { reviewCards } from "../../src/app/dev/fixtures/projects/projectsFixture";

vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), answerReview: vi.fn() }));

const [choice, number, problem] = reviewCards;
const noop = async () => false;
const draw = (cards = reviewCards, over: Partial<Parameters<typeof ReviewSession>[0]> = {}) =>
  render(<ReviewSession cards={cards} onStartProblem={noop} startFailed={false} onExit={() => {}} {...over} />);
const result = (over: Partial<api.ReviewResult> = {}): api.ReviewResult => ({ correct: true, explanation_md: "Vì $x^2 - 5x + 6 = (x-2)(x-3)$.", box: 2, due_at: "2026-11-27T00:00:00Z", ...over });

beforeEach(() => { setLocale("vi"); vi.mocked(api.answerReview).mockReset(); });
afterEach(cleanup);

test("a quiz card: the choice goes as its option's index, the explanation and Tiếp come with the right answer", async () => {
  vi.mocked(api.answerReview).mockResolvedValue(result());
  draw();
  expect(screen.getByText(copy.reviewCount(1, 3))).toBeDefined();
  expect(screen.getByText("Công thức nghiệm")).toBeDefined();
  expect(screen.queryByRole("button", { name: copy.reviewNext })).toBeNull();
  fireEvent.click(screen.getAllByRole("radio")[1]);
  await screen.findByText(/Vì/);
  expect(api.answerReview).toHaveBeenCalledWith(choice.id, "1", 1);
  fireEvent.click(screen.getByRole("button", { name: copy.reviewNext }));
  expect(screen.getByText(copy.reviewCount(2, 3))).toBeDefined();
});

test("a wrong answer allows one retry (attempt 2), then Tiếp whatever the second answer is", async () => {
  vi.mocked(api.answerReview).mockResolvedValueOnce(result({ correct: false, box: 1, due_at: "2026-11-25T00:00:00Z" })).mockResolvedValueOnce(result({ correct: false, box: 1, due_at: "2026-11-25T00:00:00Z" }));
  draw();
  fireEvent.click(screen.getAllByRole("radio")[0]);
  await waitFor(() => expect(api.answerReview).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: copy.reviewNext })).toBeNull();
  fireEvent.click(screen.getAllByRole("radio")[2]);
  await screen.findByRole("button", { name: copy.reviewNext });
  expect(vi.mocked(api.answerReview).mock.calls.map(c => [c[1], c[2]])).toEqual([["0", 1], ["2", 2]]);
});

test("a wrong first attempt comes back with no explanation: the card shows none until it is done", async () => {
  vi.mocked(api.answerReview).mockResolvedValueOnce(result({ correct: false, explanation_md: null })).mockResolvedValueOnce(result({ correct: true }));
  draw();
  fireEvent.click(screen.getAllByRole("radio")[0]);
  await waitFor(() => expect(api.answerReview).toHaveBeenCalledTimes(1));
  expect(screen.queryByText(/Vì/)).toBeNull();
  fireEvent.click(screen.getAllByRole("radio")[1]);
  await screen.findByText(/Vì/);
});

test("a failed answer call is not an attempt and shows the check error", async () => {
  vi.mocked(api.answerReview).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(result());
  draw([number]);
  const field = screen.getByRole("textbox");
  fireEvent.change(field, { target: { value: "5" } });
  fireEvent.submit(field.closest("form")!);
  await screen.findByText(copy.checkFailed);
  fireEvent.submit(field.closest("form")!);
  await screen.findByRole("button", { name: copy.reviewNext });
  expect(vi.mocked(api.answerReview).mock.calls.map(c => c[2])).toEqual([1, 1]);
});

test("a problem card shows the excerpt, starts a similar problem, and can be left for later", async () => {
  const onStart = vi.fn(async () => true);
  draw([problem], { onStartProblem: onStart });
  expect(screen.getByText(/Hai vòi nước/)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: copy.reviewSimilar }));
  expect(onStart).toHaveBeenCalledWith(problem);
  await waitFor(() => expect((screen.getByRole("button", { name: copy.reviewSimilar }) as HTMLButtonElement).disabled).toBe(true)); // navigating: no second start
});

test("a start that did not navigate re-enables the button and shows the error", async () => {
  const { rerender } = draw([problem]);
  fireEvent.click(screen.getByRole("button", { name: copy.reviewSimilar }));
  await waitFor(() => expect((screen.getByRole("button", { name: copy.reviewSimilar }) as HTMLButtonElement).disabled).toBe(false));
  rerender(<ReviewSession cards={[problem]} onStartProblem={noop} startFailed onExit={() => {}} />);
  expect(screen.getByRole("alert").textContent).toBe(copy.reviewStartFailed);
});

test("the end screen names the earliest next due date among the answers; skipped cards add none", async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-24T09:00:00") });
  try {
    vi.mocked(api.answerReview).mockResolvedValue(result({ due_at: "2026-11-25T09:00:00" }));
    const onExit = vi.fn();
    draw([choice, problem], { onExit });
    fireEvent.click(screen.getAllByRole("radio")[1]);
    fireEvent.click(await screen.findByRole("button", { name: copy.reviewNext }));
    fireEvent.click(screen.getByRole("button", { name: copy.reviewSkip }));
    expect(screen.getByText(`Xong! Hẹn bạn ${copy.reviewTomorrow}.`)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: copy.reviewBack }));
    expect(onExit).toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});

test("no cards: says there is nothing to review", () => {
  draw([]);
  expect(screen.getByText(copy.reviewEmpty)).toBeDefined();
});

test("the similar-problem URL carries the message, the card and the project", () => {
  const url = new URL(similarProblemUrl("p1", problem), "http://x");
  expect(url.pathname).toBe("/");
  expect(url.searchParams.get("via")).toBe("review");
  expect(url.searchParams.get("card")).toBe(problem.id);
  expect(url.searchParams.get("project")).toBe("p1");
  expect(url.searchParams.get("q")).toBe(copy.reviewSimilarMessage(problem.problem!.excerpt_md));
});
