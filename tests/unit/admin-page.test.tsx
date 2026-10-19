import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import AdminPage from "@/app/admin/page";
import { adminGet, clearToken, readToken, saveToken } from "@/lib/admin";
import { ApiError } from "@/lib/api";

vi.mock("@/lib/admin", () => ({
  adminGet: vi.fn(),
  clearToken: vi.fn(),
  readToken: vi.fn(),
  saveToken: vi.fn(),
}));

vi.mock("@/app/admin/sections", () => ({
  HealthSection: () => <div />,
  CostSection: () => <div />,
  LatencySection: () => <div />,
  UsersSection: () => <div />,
  ThesisSection: () => <div />,
  GuestsSection: () => <div />,
  GuestTimeline: () => <div />,
}));

const mockedAdminGet = vi.mocked(adminGet);
const mockedClearToken = vi.mocked(clearToken);
const mockedReadToken = vi.mocked(readToken);
const mockedSaveToken = vi.mocked(saveToken);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("shows the token form without a token", () => {
  mockedReadToken.mockReturnValue(null);

  render(<AdminPage />);

  expect(screen.getByRole("heading", { name: "Admin access" })).toBeTruthy();
  expect(screen.getByLabelText("Admin token")).toBeTruthy();
});

test("a wrong token (404) shows an error and keeps the form", async () => {
  mockedReadToken.mockReturnValue(null);
  mockedAdminGet.mockRejectedValue(new ApiError(404, "not_found", "not found"));
  render(<AdminPage />);

  fireEvent.change(screen.getByLabelText("Admin token"), { target: { value: "wrong" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByText("That token is not valid.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Admin access" })).toBeTruthy();
  expect(mockedSaveToken).not.toHaveBeenCalled();
});

test("a valid token hides the form and shows the days selector", async () => {
  mockedReadToken.mockReturnValue(null);
  mockedAdminGet.mockResolvedValue({});
  render(<AdminPage />);

  fireEvent.change(screen.getByLabelText("Admin token"), { target: { value: "good" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));

  expect(await screen.findByRole("button", { name: "7 days" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Admin access" })).toBeNull();
  expect(mockedSaveToken).toHaveBeenCalledWith("good");
});

test("changing the days selector refetches with days=30", async () => {
  mockedReadToken.mockReturnValue("good");
  mockedAdminGet.mockResolvedValue({});
  render(<AdminPage />);

  await screen.findByRole("button", { name: "7 days" });
  fireEvent.click(screen.getByRole("button", { name: "30 days" }));

  await waitFor(() => expect(mockedAdminGet).toHaveBeenLastCalledWith("/health?days=30", "good"));
});

test("Sign out clears the token and shows the form", async () => {
  mockedReadToken.mockReturnValue("good");
  mockedAdminGet.mockResolvedValue({});
  render(<AdminPage />);

  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

  expect(mockedClearToken).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { name: "Admin access" })).toBeTruthy();
});
