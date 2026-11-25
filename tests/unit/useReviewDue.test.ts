import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { getReviewCount, listProjects } from "@/lib/api";
import { useReviewDue } from "@/hooks/useReviewDue";

vi.mock("@/lib/api", () => ({ getReviewCount: vi.fn(), listProjects: vi.fn() }));
beforeEach(() => {
  vi.mocked(getReviewCount).mockReset();
  vi.mocked(listProjects).mockReset();
  vi.mocked(listProjects).mockResolvedValue([{ id: "a", name: "Lý" }, { id: "b", name: "Toán" }] as never);
});

test("points at the subject with the most cards and says whether its test is tomorrow", async () => {
  vi.mocked(getReviewCount).mockResolvedValue([{ project_id: "a", due: 2, exam_tomorrow: false }, { project_id: "b", due: 5, exam_tomorrow: true }]);
  const { result } = renderHook(() => useReviewDue());
  await waitFor(() => expect(result.current).toEqual({ due: 5, projectId: "b", subject: "Toán", examTomorrow: true }));
});

test("no due cards means no chip", async () => {
  vi.mocked(getReviewCount).mockResolvedValue([{ project_id: "a", due: 0, exam_tomorrow: false }]);
  const { result } = renderHook(() => useReviewDue());
  await waitFor(() => expect(getReviewCount).toHaveBeenCalled());
  expect(result.current).toBeNull();
});

test("a failed load, or a subject with no name, means no chip", async () => {
  vi.mocked(getReviewCount).mockRejectedValueOnce(new Error("offline"));
  const { result } = renderHook(() => useReviewDue());
  await waitFor(() => expect(getReviewCount).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(result.current).toBeNull();
  vi.mocked(getReviewCount).mockResolvedValue([{ project_id: "zzz", due: 1, exam_tomorrow: false }]);
  const again = renderHook(() => useReviewDue());
  await waitFor(() => expect(listProjects).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(again.result.current).toBeNull();
});
