import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SessionList } from "@/components/sidebar/SessionList";
import type { SessionSummary } from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";

const session: SessionSummary = {
  id: "one", title: "A lesson", created_at: new Date().toISOString(), last_active_at: new Date().toISOString(),
  tabs: [], done: false, current: false,
};
beforeEach(() => { vi.useFakeTimers(); setLocale("en"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup(disabled = false) {
  const choose = vi.fn(); const remove = vi.fn();
  render(<SessionList sessions={[session]} onChoose={choose} onDelete={remove} disabled={disabled} />);
  const button = screen.getByRole("button", { name: /^A lesson/ });
  return { button, row: button.parentElement!, choose, remove };
}
function touch(button: HTMLElement, type: string, x = 10, y = 10) {
  fireEvent(button, new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
}
function down(button: HTMLElement) {
  const event = new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  fireEvent(button, event);
}

test("holding reveals deletion and release does not open the session", () => {
  const { button, row, choose, remove } = setup();
  down(button);
  act(() => vi.advanceTimersByTime(499));
  expect(row.hasAttribute("data-actions")).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(row.hasAttribute("data-actions")).toBe(true);
  touch(button, "pointerup");
  fireEvent.click(button);
  expect(choose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: copy.historyDelete }));
  expect(remove).toHaveBeenCalledWith("one");
  fireEvent.pointerDown(document.body);
  expect(row.hasAttribute("data-actions")).toBe(false);
});

test.each(["pointermove", "pointercancel"])("scrolling or %s cancels the hold", type => {
  const { button, row, choose } = setup();
  down(button);
  touch(button, type, 10, 35);
  act(() => vi.advanceTimersByTime(700));
  expect(row.hasAttribute("data-actions")).toBe(false);
  if (type === "pointercancel") return;
  down(button);
  act(() => vi.advanceTimersByTime(100));
  touch(button, "pointerup");
  fireEvent.click(button);
  expect(choose).toHaveBeenCalledWith("one");
});

test("disabled rows cannot reveal delete actions", () => {
  const { button, row } = setup(true);
  down(button);
  act(() => vi.advanceTimersByTime(700));
  expect(row.hasAttribute("data-actions")).toBe(false);
});
