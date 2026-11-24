import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { getReviewCount } from "@/lib/api";
import { useReviewDue } from "@/hooks/useReviewDue";

vi.mock("@/lib/api", () => ({ getReviewCount: vi.fn() }));
beforeEach(() => vi.mocked(getReviewCount).mockReset());

test("totals the due cards and points at the subject with the most", async () => {
  vi.mocked(getReviewCount).mockResolvedValue([{ project_id: "a", due: 2 }, { project_id: "b", due: 5 }, { project_id: "c", due: 1 }]);
  const { result } = renderHook(() => useReviewDue());
  await waitFor(() => expect(result.current).toEqual({ due: 8, projectId: "b" }));
});

test("no due cards means no chip", async () => {
  vi.mocked(getReviewCount).mockResolvedValue([{ project_id: "a", due: 0 }]);
  const { result } = renderHook(() => useReviewDue());
  await waitFor(() => expect(getReviewCount).toHaveBeenCalled());
  expect(result.current).toBeNull();
});

test("a failed load means no chip", async () => {
  vi.mocked(getReviewCount).mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(() => useReviewDue());
  await waitFor(() => expect(getReviewCount).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(result.current).toBeNull();
});
