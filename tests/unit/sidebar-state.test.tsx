import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { groupSessions } from "@/components/sidebar/groupSessions";
import type { SessionSummary } from "@/lib/api";

function viewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: width >= 800, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each([[800, "rail"], [1100, "rail"], [1300, "open"], [1600, "open"]])("chooses default at %i", (width, mode) => {
  viewport(width as number);
  expect(renderHook(useSidebar).result.current.mode).toBe(mode);
});
it.each(["open", "closed"])("respects saved %s and persists a choice", (saved) => {
  viewport(1300); localStorage.setItem("df-sidebar", saved);
  const { result } = renderHook(useSidebar);
  expect(result.current.mode).toBe(saved === "open" ? "open" : "rail");
  act(() => result.current.toggle());
  expect(localStorage.getItem("df-sidebar")).toBe(saved === "open" ? "closed" : "open");
});
it("survives blocked storage and keeps phone drawer separate", () => {
  viewport(360);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error(); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error(); });
  const { result } = renderHook(useSidebar);
  expect(result.current.drawerOpen).toBe(false);
  act(() => result.current.openDrawer());
  expect(result.current.drawerOpen).toBe(true);
  act(() => result.current.closeDrawer());
  act(() => result.current.toggle());
  expect(result.current.drawerOpen).toBe(false);
});
it("groups by local calendar days at midnight, sorts newest first, and omits empty groups", () => {
  const now = new Date(2026, 9, 29, 0, 1);
  const row = (id: string, day: number, hour = 12): SessionSummary => ({ id, title: id, created_at: new Date(2026, 9, day, hour).toISOString(), last_active_at: new Date(2026, 9, day, hour).toISOString(), tabs: [], done: false, current: false });
  const groups = groupSessions([row("old", 21), row("yesterday", 28, 23), row("seven", 22), row("today", 29, 0), row("recent", 27)], now);
  expect(groups.map(g => [g.key, g.sessions.map(s => s.id)])).toEqual([
    ["today", ["today"]], ["yesterday", ["yesterday"]], ["week", ["recent", "seven"]], ["older", ["old"]],
  ]);
  expect(groupSessions([], now)).toEqual([]);
});
it("keeps desktop controls usable when storage writes throw", () => {
  viewport(1300);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
  const { result } = renderHook(useSidebar);
  expect(result.current.mode).toBe("open");
  act(() => result.current.toggle());
  expect(result.current.mode).toBe("rail");
});
it("does not override a student's choice when the viewport changes", () => {
  viewport(1300);
  const { result, rerender } = renderHook(useSidebar);
  act(() => result.current.toggle());
  viewport(1700); rerender();
  expect(result.current.mode).toBe("rail");
});
it("places moments on either side of local midnight into separate groups", () => {
  const now = new Date(2026, 0, 1, 0, 1);
  const base = { title: null, tabs: [], done: false, current: false };
  const groups = groupSessions([
    { ...base, id: "before", created_at: new Date(2025, 11, 31, 23, 59).toISOString(), last_active_at: new Date(2025, 11, 31, 23, 59).toISOString() },
    { ...base, id: "after", created_at: new Date(2026, 0, 1, 0, 0).toISOString(), last_active_at: new Date(2026, 0, 1, 0, 0).toISOString() },
  ], now);
  expect(groups.map(g => g.key)).toEqual(["today", "yesterday"]);
});
