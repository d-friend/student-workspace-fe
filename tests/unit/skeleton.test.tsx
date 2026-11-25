import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Loading, loadingTiming } from "@/components/Skeleton";

// The real timing (the unit-test setup turns skeletons off): shown after 150 ms, held 300 ms, never for a fast load.
const real = { ...loadingTiming };
beforeEach(() => { vi.useFakeTimers(); loadingTiming.showAfter = 150; loadingTiming.hold = 300; });
afterEach(() => { cleanup(); vi.useRealTimers(); Object.assign(loadingTiming, real); });

const view = (busy: boolean) => <Loading busy={busy} label="Đang tải" skeleton={<i>grey</i>}>{busy ? null : <p>content</p>}</Loading>;
const status = () => screen.queryByRole("status", { name: "Đang tải" });

it("a load that ends within 150 ms never shows the skeleton", () => {
  const { rerender } = render(view(true));
  act(() => { vi.advanceTimersByTime(100); });
  rerender(view(false));
  expect(screen.getByText("content")).toBeTruthy();
  expect(status()).toBeNull();
});

it("a slow load shows the skeleton after 150 ms, and the content only once it has been held for 300 ms", () => {
  const { rerender } = render(view(true));
  expect(status()?.hasAttribute("data-wait")).toBe(true); // mounted for its space, not yet visible
  act(() => { vi.advanceTimersByTime(150); });
  expect(status()?.hasAttribute("data-wait")).toBe(false);
  act(() => { vi.advanceTimersByTime(100); });
  rerender(view(false)); // data arrived 100 ms after it showed
  expect(screen.queryByText("content")).toBeNull();
  act(() => { vi.advanceTimersByTime(199); });
  expect(screen.queryByText("content")).toBeNull();
  act(() => { vi.advanceTimersByTime(1); });
  expect(screen.getByText("content")).toBeTruthy();
  expect(status()).toBeNull();
});
