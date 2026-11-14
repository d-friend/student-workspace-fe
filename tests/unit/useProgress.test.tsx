import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import * as api from "@/lib/api";
import { useProgress } from "@/hooks/useProgress";

vi.mock("@/lib/api", async original => ({
  ...await original<typeof import("@/lib/api")>(), createGuest: vi.fn(), getProgress: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(api.createGuest).mockResolvedValue({ guestId: "g", created: false });
  vi.mocked(api.getProgress).mockResolvedValue({ items: [] });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

test("waits for the guest cookie, fetches once under StrictMode, and becomes ready", async () => {
  let guest!: (value: { guestId: string; created: boolean }) => void;
  vi.mocked(api.createGuest).mockReturnValueOnce(new Promise(resolve => { guest = resolve; }));
  const { result, rerender } = renderHook(() => useProgress(), { wrapper: StrictMode });
  expect(result.current).toMatchObject({ items: [], ready: false, failed: false });
  expect(api.getProgress).not.toHaveBeenCalled();
  await act(async () => { guest({ guestId: "new", created: true }); });
  await waitFor(() => expect(result.current.ready).toBe(true));
  rerender();
  expect(api.getProgress).toHaveBeenCalledOnce();
  expect(api.createGuest).toHaveBeenCalledOnce();
  expect(result.current.failed).toBe(false);
});

test.each(["guest", "progress"])("a %s failure stays empty and exposes failed", async failure => {
  if (failure === "guest") vi.mocked(api.createGuest).mockRejectedValueOnce(Error("offline"));
  else vi.mocked(api.getProgress).mockRejectedValueOnce(Error("offline"));
  const { result } = renderHook(() => useProgress());
  await waitFor(() => expect(result.current).toMatchObject({ items: [], ready: true, failed: true }));
});

test("publishes the returned items only when the list arrives", async () => {
  let finish!: (value: { items: api.ProgressItem[] }) => void;
  vi.mocked(api.getProgress).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const data: api.ProgressItem = {
    workspace_id: "w", session_id: "s", phase: "practice", title: "Practice", created_at: "2026-11-14T05:00:00Z", tabs: 1,
    roadmap: null, stages: null, steps: { entries: [{ state: "ok" }], done: true, free: true }, quizzes: null, next: null,
  };
  const { result } = renderHook(() => useProgress());
  await waitFor(() => expect(api.getProgress).toHaveBeenCalledOnce());
  expect(result.current).toMatchObject({ items: [], ready: false, failed: false });
  await act(async () => finish({ items: [data] }));
  expect(result.current).toMatchObject({ items: [data], ready: true, failed: false });
});

test("retry clears failure and loading state, then publishes a fresh request under StrictMode", async () => {
  vi.mocked(api.getProgress).mockRejectedValueOnce(Error("offline"));
  const { result } = renderHook(() => useProgress(), { wrapper: StrictMode });
  await waitFor(() => expect(result.current.failed).toBe(true));
  let finish!: (value: { items: api.ProgressItem[] }) => void;
  vi.mocked(api.getProgress).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  act(() => result.current.retry());
  expect(result.current).toMatchObject({ ready: false, failed: false, items: [] });
  await waitFor(() => expect(api.getProgress).toHaveBeenCalledTimes(2));
  await act(async () => finish({ items: [] }));
  expect(result.current).toMatchObject({ ready: true, failed: false, items: [] });
  expect(api.createGuest).toHaveBeenCalledTimes(2);
});
