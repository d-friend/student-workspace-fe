import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { getReviewCount } from "@/lib/api";
import { useReviewCounts } from "@/hooks/useReviewCounts";

vi.mock("@/lib/api", () => ({ getReviewCount: vi.fn() }));
beforeEach(() => vi.mocked(getReviewCount).mockReset());

test("counts by project, recounts on a new refresh value, and does nothing while disabled", async () => {
  vi.mocked(getReviewCount).mockResolvedValueOnce([{ project_id: "a", due: 3 }, { project_id: "b", due: 1 }]).mockResolvedValueOnce([{ project_id: "a", due: 2 }]);
  const { result, rerender } = renderHook(({ on, key }) => useReviewCounts(on, key), { initialProps: { on: false, key: "1" } });
  expect(getReviewCount).not.toHaveBeenCalled();
  rerender({ on: true, key: "1" });
  await waitFor(() => expect(result.current).toEqual({ a: 3, b: 1 }));
  rerender({ on: true, key: "2" });
  await waitFor(() => expect(result.current).toEqual({ a: 2 }));
});

test("a failed recount keeps the last counts", async () => {
  vi.mocked(getReviewCount).mockResolvedValueOnce([{ project_id: "a", due: 3 }]).mockRejectedValueOnce(new Error("offline"));
  const { result, rerender } = renderHook(({ key }) => useReviewCounts(true, key), { initialProps: { key: "1" } });
  await waitFor(() => expect(result.current).toEqual({ a: 3 }));
  rerender({ key: "2" });
  await waitFor(() => expect(getReviewCount).toHaveBeenCalledTimes(2));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(result.current).toEqual({ a: 3 });
});
