import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { useProject, useReader } from "@/hooks/useProject";
import { useProjectSessions } from "@/hooks/useProjectSessions";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), getProject: vi.fn(), getReader: vi.fn(), listSessions: vi.fn() }));

const session = (id: string): api.SessionSummary => ({ id, title: id, created_at: "", last_active_at: "", tabs: [], done: false, current: false, project_id: "p1" });
beforeEach(() => vi.resetAllMocks());

test("useProject loads the project, and a 404 reads as missing, any other failure as failed", async () => {
  vi.mocked(api.getProject).mockResolvedValueOnce({ id: "p1", name: "Toán", subject_node_id: "math", map: [], packs: [] });
  const ok = renderHook(() => useProject("p1"));
  expect(ok.result.current.ready).toBe(false);
  await waitFor(() => expect(ok.result.current.data?.name).toBe("Toán"));

  vi.mocked(api.getProject).mockRejectedValueOnce(new api.ApiError(404, "not_found", "x"));
  const missing = renderHook(() => useProject("other"));
  await waitFor(() => expect(missing.result.current.error).toBe("missing"));

  vi.mocked(api.getProject).mockRejectedValueOnce(new TypeError("offline"));
  const failed = renderHook(() => useProject("third"));
  await waitFor(() => expect(failed.result.current.error).toBe("failed"));
});

test("switching project never shows the previous project's data", async () => {
  vi.mocked(api.getProject).mockImplementation(async id => ({ id, name: id, subject_node_id: "x", map: [], packs: [] }));
  const { result, rerender } = renderHook(({ id }) => useProject(id), { initialProps: { id: "a" } });
  await waitFor(() => expect(result.current.data?.id).toBe("a"));
  rerender({ id: "b" });
  expect(result.current.data).toBeNull();
  expect(result.current.ready).toBe(false);
  await waitFor(() => expect(result.current.data?.id).toBe("b"));
});

test("the reader waits to be enabled", async () => {
  vi.mocked(api.getReader).mockResolvedValue([]);
  const { result, rerender } = renderHook(({ on }) => useReader("p1", on), { initialProps: { on: false } });
  await act(async () => {});
  expect(api.getReader).not.toHaveBeenCalled();
  rerender({ on: true });
  await waitFor(() => expect(result.current.data).toEqual([]));
  expect(api.getReader).toHaveBeenCalledTimes(1);
});

test("sessions load on first enable, page forward without duplicates, and keep what they have when a page fails", async () => {
  vi.mocked(api.listSessions)
    .mockResolvedValueOnce({ sessions: [session("a"), session("b")], next_before: "c1" })
    .mockResolvedValueOnce({ sessions: [session("b"), session("c")], next_before: null });
  const { result, rerender } = renderHook(({ on }) => useProjectSessions("p1", on), { initialProps: { on: false } });
  expect(api.listSessions).not.toHaveBeenCalled();
  rerender({ on: true });
  await waitFor(() => expect(result.current.sessions.map(s => s.id)).toEqual(["a", "b"]));
  expect(api.listSessions).toHaveBeenCalledWith(undefined, 20, "p1");
  expect(result.current.hasMore).toBe(true);
  act(() => result.current.more());
  await waitFor(() => expect(result.current.sessions.map(s => s.id)).toEqual(["a", "b", "c"]));
  expect(api.listSessions).toHaveBeenLastCalledWith("c1", 20, "p1");
  expect(result.current.hasMore).toBe(false);
});

test("a failed first page is reported, and a failed next page keeps the list", async () => {
  vi.mocked(api.listSessions).mockRejectedValueOnce(new Error("x"));
  const bad = renderHook(() => useProjectSessions("p1", true));
  await waitFor(() => expect(bad.result.current.failed).toBe(true));
  expect(bad.result.current.ready).toBe(true);

  vi.mocked(api.listSessions).mockResolvedValueOnce({ sessions: [session("a")], next_before: "c1" }).mockRejectedValueOnce(new Error("x"));
  const good = renderHook(() => useProjectSessions("p2", true));
  await waitFor(() => expect(good.result.current.sessions).toHaveLength(1));
  act(() => good.result.current.more());
  await waitFor(() => expect(good.result.current.loadingMore).toBe(false));
  expect(good.result.current.sessions).toHaveLength(1);
  expect(good.result.current.hasMore).toBe(true);
});
