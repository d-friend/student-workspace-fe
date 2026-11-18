import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EmptyThread, type EmptyThreadProps } from "@/components/chat/EmptyThread";
import { copy } from "@/lib/copy";
import { ApiError, getSurpriseCard, type ProgressItem } from "@/lib/api";
import { setLocale } from "@/lib/copy";
import { stoppedAt } from "@/lib/progress";

vi.mock("@/lib/api", async original => ({
  ...await original<typeof import("@/lib/api")>(), getSurpriseCard: vi.fn(),
}));
const surprise = { id: "lesson-1", title: "Vì sao trời xanh?", emoji: "🌤️", teaser: "Tự thử với ánh sáng.", tag: "Bí ẩn đời thường" };
beforeEach(() => {
  setLocale("vi");
  vi.mocked(getSurpriseCard).mockReset().mockResolvedValue(surprise);
});

afterEach(() => { cleanup(); setLocale("vi"); });

function setup(extra: Partial<EmptyThreadProps> = {}) {
  const props = {
    onStarter: vi.fn(),
    onSurprise: vi.fn(),
    ...extra,
  };
  return { props, ui: <EmptyThread {...props} /> };
}

test("shows the greeting, both starters and the footer", () => {
  render(setup().ui);
  expect(screen.getByRole("heading", { name: copy.entryTitle })).toBeTruthy();
  expect(screen.getByText(copy.entrySub)).toBeTruthy();
  expect(screen.getByText(copy.entryFoot)).toBeTruthy();
  expect(screen.getByText(copy.starter1)).toBeTruthy();
  expect(screen.getByText(copy.starter2)).toBeTruthy();
});

test("a starter starts its sample", () => {
  const s = setup();
  render(s.ui);
  fireEvent.click(screen.getByText(copy.starter2));
  expect(s.props.onStarter).toHaveBeenCalledWith("geometry");
});

const progressItem: ProgressItem = {
  workspace_id: "w", session_id: "s", phase: "solve", title: "Bài vừa làm", created_at: "2026-11-14T05:00:00Z", tabs: 1,
  roadmap: "generic", stages: [0, 1], steps: { entries: [{ state: "ok", tries: 1, hint: 0 }], done: false, free: false },
  quizzes: null, next: null,
};

test("progress shows the next-step card and its resume link", () => {
  const onOpen = vi.fn();
  render(setup({ progress: { item: progressItem, onOpen } }).ui);
  expect(screen.getByRole("heading", { name: copy.entryNext })).toBeTruthy();
  expect(screen.queryByText(copy.samplesLabel)).toBeNull();
  expect(screen.queryByText(copy.starter1)).toBeNull();
  expect(screen.queryByText(copy.starter2)).toBeNull();
  expect(screen.getByRole("link", { name: copy.progressSeeAll }).getAttribute("href")).toBe("/progress");
  fireEvent.click(screen.getByRole("button", { name: copy.entryResume }));
  expect(onOpen).toHaveBeenCalledOnce();
});

test("null progress keeps both starters", () => {
  render(setup({ progress: null }).ui);
  expect(screen.getByText(copy.starter1)).toBeTruthy();
  expect(screen.getByText(copy.starter2)).toBeTruthy();
  expect(screen.queryByRole("link", { name: copy.progressSeeAll })).toBeNull();
});

test.each([false, true])("surprise preview is available with progress=%s", async (hasProgress) => {
  const onSurprise = vi.fn();
  render(setup({ onSurprise, progress: hasProgress ? { item: progressItem, onOpen: vi.fn() } : null }).ui);
  expect(await screen.findByText(surprise.title)).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Bài bất ngờ" })).toBeTruthy();
  expect(screen.getByText(surprise.tag)).toBeTruthy();
  expect(screen.getByText(surprise.teaser)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.surpriseExplore }));
  expect(onSurprise).toHaveBeenCalledExactlyOnceWith(surprise.id);
});

test.each(["vi", "en"] as const)("next-step variants in %s", locale => {
  setLocale(locale);
  const onOpen = vi.fn();
  const next = "Căn bậc hai";
  const { rerender, container } = render(setup({ progress: { item: { ...progressItem, next: [next, "Ignored"] }, onOpen } }).ui);
  expect(screen.getByText(progressItem.title)).toBeTruthy();
  expect(screen.getByText(copy.entryLearn + next)).toBeTruthy();
  const card = screen.getByRole("region", { name: copy.entryNext });
  const button = within(card).getByRole("button", { name: copy.entryResume });
  expect(within(card).getAllByRole("button")).toHaveLength(1);
  expect(button.querySelector("a, button, [role=button]")).toBeNull();
  expect(within(card).getByRole("link", { name: copy.progressSeeAll }).closest("button")).toBeNull();
  expect(screen.getByText(copy.entryLearn + next).closest("button, [role=button]")).toBeNull();
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledOnce();
  expect(screen.queryByText("Ignored")).toBeNull();
  rerender(setup({ progress: { item: progressItem, onOpen } }).ui);
  expect(screen.getByText(copy.entryContinue + progressItem.title)).toBeTruthy();
  expect(screen.getByText(copy.progressStopped + stoppedAt(progressItem))).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.entryResume }));
  expect(onOpen).toHaveBeenCalledTimes(2);
  rerender(setup({ progress: { item: { ...progressItem, steps: { ...progressItem.steps!, done: true } }, onOpen } }).ui);
  expect(screen.getByText(progressItem.title).parentElement!.querySelector("svg")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.entryResume }));
  expect(onOpen).toHaveBeenCalledTimes(3);
  expect(container.textContent).not.toContain(copy.entryContinue);
});

test("an existing Học tiếp label is not duplicated", () => {
  render(setup({ progress: { item: { ...progressItem, next: ["Học tiếp: Căn bậc hai"] }, onOpen: vi.fn() } }).ui);
  expect(screen.getByText("Học tiếp: Căn bậc hai")).toBeTruthy();
});

test.each([new Error("offline"), new ApiError(404, "pool_empty", "")])("a failed preview keeps the old random surprise action: %s", async error => {
  vi.mocked(getSurpriseCard).mockRejectedValueOnce(error);
  const onSurprise = vi.fn();
  render(setup({ onSurprise }).ui);
  fireEvent.click(await screen.findByRole("button", { name: "Bài bất ngờ" }));
  expect(onSurprise).toHaveBeenCalledExactlyOnceWith();
  expect(screen.queryByRole("button", { name: copy.surpriseExplore })).toBeNull();
});

test("shuffle excludes this card without opening; explore opens the replacement", async () => {
  const onSurprise = vi.fn();
  let resolve!: (card: typeof surprise) => void;
  vi.mocked(getSurpriseCard).mockResolvedValueOnce(surprise).mockReturnValueOnce(new Promise(done => { resolve = done; }));
  render(setup({ onSurprise }).ui);
  expect(await screen.findByText(surprise.title)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.surpriseShuffle }));
  expect(getSurpriseCard).toHaveBeenLastCalledWith(surprise.id);
  expect(onSurprise).not.toHaveBeenCalled();
  expect(screen.getByRole("status", { name: copy.surpriseLoading })).toBeTruthy();
  expect(screen.queryByRole("button", { name: copy.surpriseExplore })).toBeNull();
  resolve({ ...surprise, id: "lesson-2", title: "Bài khác" });
  await screen.findByText("Bài khác");
  fireEvent.click(screen.getByRole("button", { name: copy.surpriseExplore }));
  expect(onSurprise).toHaveBeenCalledExactlyOnceWith("lesson-2");
});

test("shuffle failure also shows the random fallback", async () => {
  vi.mocked(getSurpriseCard).mockResolvedValueOnce(surprise).mockRejectedValueOnce(new Error("offline"));
  render(setup().ui);
  await screen.findByText(surprise.title);
  fireEvent.click(screen.getByRole("button", { name: copy.surpriseShuffle }));
  expect(await screen.findByRole("button", { name: copy.surprise })).toBeTruthy();
});
