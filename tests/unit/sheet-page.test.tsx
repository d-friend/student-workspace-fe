import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import SheetPage from "@/app/sheet/[id]/page";
import { ApiError, getSheet, nameSheet, openSheetItem, resumeSession, type SheetView } from "@/lib/api";
import { copy } from "@/lib/copy";

const params = vi.hoisted(() => ({ id: "" }));
vi.mock("next/navigation", () => ({ useParams: () => params }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  getSheet: vi.fn(),
  nameSheet: vi.fn(),
  openSheetItem: vi.fn(),
  resumeSession: vi.fn(),
}));

const sheet = (named: boolean, states: ("new" | "started" | "done")[]): SheetView => ({
  id: params.id, title: "Ôn tập HK1", named, count: states.length, done: states.filter((s) => s === "done").length,
  items: states.map((state, i) => ({ position: i + 1, label: `Bài ${i + 1}`, firstLine: `Đề ${i + 1}`, state })),
});

let nextId = 0;
beforeEach(() => {
  params.id = `sheet-${nextId++}`;
  vi.mocked(nameSheet).mockResolvedValue();
  vi.mocked(openSheetItem).mockResolvedValue({ sessionId: "session-1" });
  // Never settles: the page would navigate away after it, which jsdom cannot do.
  vi.mocked(resumeSession).mockReturnValue(new Promise(() => {}));
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const typeName = (value: string) => {
  fireEvent.change(screen.getByLabelText(copy.sheetNameLabel), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: copy.sheetStart }));
};

test("a first visit asks for the name once, says who will see it, and opens nothing yet", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(false, ["new", "new"]));
  render(<SheetPage />);
  expect(await screen.findByRole("heading", { name: "Ôn tập HK1" })).toBeTruthy();
  expect((screen.getByLabelText(copy.sheetNameLabel) as HTMLInputElement).maxLength).toBe(60);
  expect(screen.getByText(copy.sheetNameNote)).toBeTruthy();
  expect(getSheet).toHaveBeenCalledWith(params.id);
  expect(openSheetItem).not.toHaveBeenCalled();
});

test("an empty or blank name starts nothing", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(false, ["new"]));
  render(<SheetPage />);
  await screen.findByLabelText(copy.sheetNameLabel);
  typeName("");
  typeName("   ");
  expect(nameSheet).not.toHaveBeenCalled();
});

test("giving a name saves it trimmed, then opens the first problem and resumes its session", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(false, ["new", "new"]));
  render(<SheetPage />);
  await screen.findByLabelText(copy.sheetNameLabel);
  typeName("  Nguyễn An ");
  await waitFor(() => expect(resumeSession).toHaveBeenCalledWith("session-1"));
  expect(nameSheet).toHaveBeenCalledExactlyOnceWith(params.id, "Nguyễn An");
  expect(openSheetItem).toHaveBeenCalledExactlyOnceWith(params.id, 1);
  expect(vi.mocked(nameSheet).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(openSheetItem).mock.invocationCallOrder[0]);
});

test("a returning student goes straight to the first unfinished problem, with no form", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(true, ["done", "started", "new"]));
  render(<SheetPage />);
  await waitFor(() => expect(resumeSession).toHaveBeenCalledWith("session-1"));
  expect(openSheetItem).toHaveBeenCalledExactlyOnceWith(params.id, 2);
  expect(nameSheet).not.toHaveBeenCalled();
  expect(screen.queryByLabelText(copy.sheetNameLabel)).toBeNull();
});

test("when every problem is done it opens the first one", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(true, ["done", "done"]));
  render(<SheetPage />);
  await waitFor(() => expect(openSheetItem).toHaveBeenCalledExactlyOnceWith(params.id, 1));
});

test("an unknown sheet shows a start link", async () => {
  vi.mocked(getSheet).mockRejectedValue(new ApiError(404, "sheet_not_found", "missing"));
  render(<SheetPage />);
  expect(await screen.findByRole("heading", { name: copy.sheetMissingTitle })).toBeTruthy();
  expect(screen.getByRole("link", { name: copy.sheetStart })).toHaveProperty("pathname", "/");
});

test("a sheet that fails to load can be retried", async () => {
  vi.mocked(getSheet).mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(sheet(false, ["new"]));
  render(<SheetPage />);
  fireEvent.click(await screen.findByRole("button", { name: copy.sheetRetry }));
  expect(await screen.findByLabelText(copy.sheetNameLabel)).toBeTruthy();
  expect(getSheet).toHaveBeenCalledTimes(2);
});

test("a name that could not be saved says so and keeps what was typed", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(false, ["new"]));
  vi.mocked(nameSheet).mockRejectedValue(new ApiError(429, "rate_limited", "slow"));
  render(<SheetPage />);
  await screen.findByLabelText(copy.sheetNameLabel);
  typeName("An");
  expect((await screen.findByRole("alert")).textContent).toBe(copy.sheetNameFailed);
  expect((screen.getByLabelText(copy.sheetNameLabel) as HTMLInputElement).value).toBe("An");
  expect(openSheetItem).not.toHaveBeenCalled();
});

test("if the server no longer knows the name, the form comes back", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(true, ["new"]));
  vi.mocked(openSheetItem).mockRejectedValue(new ApiError(409, "name_required", "name first"));
  render(<SheetPage />);
  expect(await screen.findByLabelText(copy.sheetNameLabel)).toBeTruthy();
});

test("a problem that is not built yet explains the delay and can be retried", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(true, ["new"]));
  vi.mocked(openSheetItem)
    .mockRejectedValueOnce(new ApiError(409, "workspace_not_ready", "not ready"))
    .mockResolvedValueOnce({ sessionId: "session-2" });
  render(<SheetPage />);
  expect((await screen.findByRole("alert")).textContent).toBe(copy.sheetNotReady);
  fireEvent.click(screen.getByRole("button", { name: copy.sheetRetry }));
  await waitFor(() => expect(resumeSession).toHaveBeenCalledWith("session-2"));
});

test("any other failure to open shows the generic retry", async () => {
  vi.mocked(getSheet).mockResolvedValue(sheet(true, ["new"]));
  vi.mocked(openSheetItem).mockRejectedValue(new ApiError(404, "item_not_found", "gone"));
  render(<SheetPage />);
  expect((await screen.findByRole("alert")).textContent).toBe(copy.sheetRetryHint);
  expect(screen.getByRole("button", { name: copy.sheetRetry })).toBeTruthy();
});
