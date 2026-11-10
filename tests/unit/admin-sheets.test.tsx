import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SheetsSection } from "@/app/admin/sections";
import { ApiError } from "@/lib/api";
import { adminGet, adminPost, type SheetRow } from "@/lib/admin";

vi.mock("@/lib/admin", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/admin")>()), adminGet: vi.fn(), adminPost: vi.fn() }));
const mockedGet = vi.mocked(adminGet);
const mockedPost = vi.mocked(adminPost);

const sheets: SheetRow[] = [
  { id: "sheet-new", title: "Ôn tập HK1", items: 12, path: "/sheet/sheet-new", created_at: "2026-11-10T03:00:00Z" },
  { id: "sheet-old", title: "Hàm số", items: 3, path: "/sheet/sheet-old", created_at: "2026-11-01T03:00:00Z" },
];
const made: SheetRow = { id: "sheet-made", title: "Đề cương", items: 2, path: "/sheet/sheet-made", created_at: "2026-11-10T04:00:00Z" };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const fill = (title: string, lines: string) => {
  fireEvent.change(screen.getByLabelText("Sheet title"), { target: { value: title } });
  fireEvent.change(screen.getByLabelText(/^Problems/), { target: { value: lines } });
  fireEvent.click(screen.getByRole("button", { name: "Create sheet" }));
};

test("lists the sheets with their title, item count and full link", async () => {
  mockedGet.mockResolvedValue(sheets);
  render(<SheetsSection token="token" />);
  const link = await screen.findByRole("link", { name: `${window.location.origin}/sheet/sheet-new` });
  expect(link.getAttribute("href")).toBe(`${window.location.origin}/sheet/sheet-new`);
  expect(screen.getByText("Ôn tập HK1")).toBeTruthy();
  expect(screen.getByText("12")).toBeTruthy();
  expect(screen.getByText("Hàm số")).toBeTruthy();
  expect(mockedGet).toHaveBeenCalledWith("/sheets", "token");
});

test("says so when there are no sheets yet, and when the list fails to load", async () => {
  mockedGet.mockResolvedValueOnce([]);
  render(<SheetsSection token="token" />);
  expect(await screen.findByText("No data yet.")).toBeTruthy();
  cleanup();
  mockedGet.mockRejectedValueOnce(new Error("down"));
  render(<SheetsSection token="token" />);
  expect(await screen.findByText("Could not load this section.")).toBeTruthy();
});

test("creates a sheet from one 'label | link' line per problem, shows its link and reloads the list", async () => {
  mockedGet.mockResolvedValue([]);
  mockedPost.mockResolvedValue(made);
  render(<SheetsSection token="token" />);
  await screen.findByText("No data yet.");
  fill("  Đề cương  ", "Bài 1 | https://demo.dfriend.online/s/aaa\n\n  Bài 2|bbb  \n");
  await waitFor(() => expect(mockedPost).toHaveBeenCalledWith("/sheets", "token", {
    title: "Đề cương",
    items: [
      { label: "Bài 1", workspace: "https://demo.dfriend.online/s/aaa" },
      { label: "Bài 2", workspace: "bbb" },
    ],
  }));
  expect((await screen.findByRole("status")).textContent).toContain(`${window.location.origin}/sheet/sheet-made`);
  await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  expect((screen.getByLabelText("Sheet title") as HTMLInputElement).value).toBe("");
});

test("shows the server's message when a line is rejected, and keeps what was typed", async () => {
  mockedGet.mockResolvedValue([]);
  mockedPost.mockRejectedValue(new ApiError(400, "invalid_item", "line 2: no such workspace"));
  render(<SheetsSection token="token" />);
  await screen.findByText("No data yet.");
  fill("Đề cương", "Bài 1 | aaa\nBài 2 | bbb");
  expect((await screen.findByRole("alert")).textContent).toContain("line 2: no such workspace");
  expect((screen.getByLabelText("Sheet title") as HTMLInputElement).value).toBe("Đề cương");
  expect(mockedGet).toHaveBeenCalledTimes(1);
});

test("a line without 'label | link' is refused before anything is sent", async () => {
  mockedGet.mockResolvedValue([]);
  render(<SheetsSection token="token" />);
  await screen.findByText("No data yet.");
  fill("Đề cương", "Bài 1 | aaa\nhttps://demo.dfriend.online/s/bbb");
  expect((await screen.findByRole("alert")).textContent).toContain("Line 2");
  fill("Đề cương", "Bài 1 |   ");
  expect((await screen.findByRole("alert")).textContent).toContain("Line 1");
  fill("", "Bài 1 | aaa");
  fill("Đề cương", "   \n");
  expect(mockedPost).not.toHaveBeenCalled();
});
