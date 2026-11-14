import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { Entry } from "@/components/Entry";
import { copy } from "@/lib/copy";
import type { ProgressItem } from "@/lib/api";

afterEach(cleanup);

function setup(extra: Partial<Parameters<typeof Entry>[0]> = {}) {
  const props = {
    composer: {
      value: "",
      onChange: vi.fn(),
      onSend: vi.fn(),
      onPickPhoto: vi.fn(),
      placeholder: copy.placeholderEmpty,
      photo: null,
    },
    onStarter: vi.fn(),
    ...extra,
  };
  return { props, ui: <Entry {...props} /> };
}

test("shows the greeting, the composer, the camera and both starters", () => {
  render(setup().ui);
  expect(screen.getByRole("heading", { name: copy.entryTitle })).toBeTruthy();
  expect(screen.getByLabelText(copy.inputLabel)).toBeTruthy();
  expect(screen.getByRole("button", { name: copy.pickPhoto })).toBeTruthy();
  expect(screen.getByText(copy.starter1)).toBeTruthy();
  expect(screen.getByText(copy.starter2)).toBeTruthy();
});

test("a starter starts its sample", () => {
  const s = setup();
  render(s.ui);
  fireEvent.click(screen.getByText(copy.starter2));
  expect(s.props.onStarter).toHaveBeenCalledWith("geometry");
});

test("Enter in the composer sends", () => {
  const s = setup();
  render(s.ui);
  fireEvent.keyDown(screen.getByLabelText(copy.inputLabel), { key: "Enter" });
  expect(s.props.composer.onSend).toHaveBeenCalledTimes(1);
});

test("Thử lại shows only when a retry is given", () => {
  const onRetry = vi.fn();
  const { unmount } = render(setup().ui);
  expect(screen.queryByRole("button", { name: copy.retry })).toBeNull();
  unmount();
  render(setup({ onRetry }).ui);
  fireEvent.click(screen.getByRole("button", { name: copy.retry }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test("with a photo, the photo check replaces the greeting and the starters", () => {
  const onSend = vi.fn();
  const onRetake = vi.fn();
  const s = setup({ photoCheck: { src: "data:image/jpeg;base64,x", onSend, onRetake } });
  render(s.ui);
  expect(screen.getByRole("heading", { name: copy.photoTitle })).toBeTruthy();
  expect(screen.queryByText(copy.starter1)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.sendPhoto }));
  fireEvent.click(screen.getByRole("button", { name: copy.retake }));
  expect(onSend).toHaveBeenCalledTimes(1);
  expect(onRetake).toHaveBeenCalledTimes(1);
});

const progressItem: ProgressItem = {
  workspace_id: "w", session_id: "s", phase: "solve", title: "Bài vừa làm", created_at: "2026-11-14T05:00:00Z", tabs: 1,
  roadmap: "generic", stages: [0, 1], steps: { entries: [{ state: "ok", tries: 1, hint: 0 }], done: false, free: false },
  quizzes: null, next: null,
};

test("progress replaces both starters and keeps the retry action", () => {
  const onOpen = vi.fn(); const onRetry = vi.fn();
  render(setup({ progress: { item: progressItem, onOpen }, onRetry }).ui);
  expect(screen.getByText(copy.progressLatest)).toBeTruthy();
  expect(screen.queryByText(copy.samplesLabel)).toBeNull();
  expect(screen.queryByText(copy.starter1)).toBeNull();
  expect(screen.queryByText(copy.starter2)).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Bài vừa làm/ }));
  fireEvent.click(screen.getByRole("button", { name: copy.retry }));
  expect(onOpen).toHaveBeenCalledOnce();
  expect(onRetry).toHaveBeenCalledOnce();
});

test("null progress keeps both starters and a photo hides progress", () => {
  const { rerender } = render(setup({ progress: null }).ui);
  expect(screen.getByText(copy.starter1)).toBeTruthy();
  expect(screen.getByText(copy.starter2)).toBeTruthy();
  rerender(setup({ progress: { item: progressItem, onOpen: vi.fn() }, photoCheck: { src: "data:image/jpeg;base64,x", onSend: vi.fn(), onRetake: vi.fn() } }).ui);
  expect(screen.queryByText(copy.progressLatest)).toBeNull();
  expect(screen.queryByRole("button", { name: /Bài vừa làm/ })).toBeNull();
});
