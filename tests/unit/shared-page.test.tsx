import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import SharedPage from "@/app/s/[id]/page";
import { ApiError, openSharedWorkspace, resumeSession } from "@/lib/api";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "source" }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  openSharedWorkspace: vi.fn(),
  resumeSession: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

test("a missing source shows a start link and creates only once in Strict Mode", async () => {
  vi.mocked(openSharedWorkspace).mockRejectedValue(new ApiError(404, "workspace_not_found", "missing"));
  render(<StrictMode><SharedPage /></StrictMode>);
  expect(await screen.findByRole("link", { name: "Bắt đầu" })).toHaveProperty("pathname", "/");
  expect(openSharedWorkspace).toHaveBeenCalledExactlyOnceWith("source");
  expect(resumeSession).not.toHaveBeenCalled();
});

test("a failed creation can be retried", async () => {
  vi.mocked(openSharedWorkspace).mockRejectedValue(new Error("Offline"));
  render(<SharedPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
  await waitFor(() => expect(openSharedWorkspace).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("heading", { name: "Chưa thể mở bài" })).toBeTruthy();
});

test("an unfinished workspace explains the delay and retries opening", async () => {
  vi.mocked(openSharedWorkspace)
    .mockRejectedValueOnce(new ApiError(409, "workspace_not_ready", "not ready"))
    .mockResolvedValueOnce({ sessionId: "existing-session" });
  vi.mocked(resumeSession).mockRejectedValue(new Error("Offline"));
  render(<SharedPage />);
  expect((await screen.findByRole("alert")).textContent).toBe("Bài này chưa dựng xong, hãy thử lại sau");
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  await waitFor(() => expect(resumeSession).toHaveBeenCalledWith("existing-session"));
  expect(openSharedWorkspace).toHaveBeenCalledTimes(2);
});

test("other conflicts use the generic error", async () => {
  vi.mocked(openSharedWorkspace).mockRejectedValue(new ApiError(409, "other_conflict", "conflict"));
  render(<SharedPage />);
  expect((await screen.findByRole("alert")).textContent).toBe("Bạn thử lại nhé.");
});

test("retrying resume reuses the created session instead of copying again", async () => {
  vi.mocked(openSharedWorkspace).mockResolvedValue({ sessionId: "student-copy" });
  vi.mocked(resumeSession).mockRejectedValue(new Error("Offline"));
  render(<StrictMode><SharedPage /></StrictMode>);
  fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
  await waitFor(() => expect(resumeSession).toHaveBeenCalledTimes(2));
  expect(resumeSession).toHaveBeenLastCalledWith("student-copy");
  expect(openSharedWorkspace).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole("heading", { name: "Chưa thể mở bài" })).toBeTruthy();
});
