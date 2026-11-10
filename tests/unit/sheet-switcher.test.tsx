import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SheetSwitcher } from "@/components/work/SheetSwitcher";
import { ApiError, getSheet, openSheetItem, resumeSession, type SheetRef, type SheetView } from "@/lib/api";
import { copy } from "@/lib/copy";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  getSheet: vi.fn(),
  openSheetItem: vi.fn(),
  resumeSession: vi.fn(),
}));

const ref = (position: number): SheetRef => ({ id: "sh1", title: "Ôn tập HK1", position, count: 3 });
const view: SheetView = {
  id: "sh1", title: "Ôn tập HK1", named: true, count: 3, done: 1,
  items: [
    { position: 1, label: "Bài 1", firstLine: "Giải phương trình bậc hai.", state: "done" },
    { position: 2, label: "Bài 2", firstLine: "Tính đạo hàm.", state: "started" },
    { position: 3, label: "Bài 3", firstLine: "Chứng minh tam giác cân.", state: "new" },
  ],
};

const before = vi.fn();
const switched = vi.fn();
const show = (position: number, busy = false) =>
  render(<SheetSwitcher sheet={ref(position)} busy={busy} beforeSwitch={before} onSwitched={switched} />);
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  vi.mocked(getSheet).mockResolvedValue(view);
  vi.mocked(openSheetItem).mockResolvedValue({ sessionId: "session-9" });
  vi.mocked(resumeSession).mockResolvedValue();
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

test("shows where the student is in the sheet", () => {
  show(2);
  expect(screen.getByRole("navigation", { name: copy.sheetNav })).toBeTruthy();
  expect(button(copy.sheetPosition(2, 3))).toBeTruthy();
  expect(button(copy.sheetPrev).disabled).toBe(false);
  expect(button(copy.sheetNext).disabled).toBe(false);
  expect(getSheet).not.toHaveBeenCalled();
});

test("there is no previous problem on the first and no next on the last", () => {
  show(1);
  expect(button(copy.sheetPrev).disabled).toBe(true);
  expect(button(copy.sheetNext).disabled).toBe(false);
  cleanup();
  show(3);
  expect(button(copy.sheetPrev).disabled).toBe(false);
  expect(button(copy.sheetNext).disabled).toBe(true);
});

test("next sends the waiting events first, then opens the item, resumes its session and reports the switch", async () => {
  show(2);
  fireEvent.click(button(copy.sheetNext));
  await waitFor(() => expect(switched).toHaveBeenCalledTimes(1));
  expect(openSheetItem).toHaveBeenCalledExactlyOnceWith("sh1", 3);
  expect(resumeSession).toHaveBeenCalledExactlyOnceWith("session-9");
  expect(before.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(openSheetItem).mock.invocationCallOrder[0]);
  expect(vi.mocked(resumeSession).mock.invocationCallOrder[0]).toBeLessThan(switched.mock.invocationCallOrder[0]);
});

test("previous opens the item before", async () => {
  show(2);
  fireEvent.click(button(copy.sheetPrev));
  await waitFor(() => expect(openSheetItem).toHaveBeenCalledExactlyOnceWith("sh1", 1));
});

test("while a turn is running nothing can be switched", () => {
  show(2, true);
  expect(button(copy.sheetPrev).disabled).toBe(true);
  expect(button(copy.sheetNext).disabled).toBe(true);
  fireEvent.click(button(copy.sheetNext));
  expect(before).not.toHaveBeenCalled();
  expect(openSheetItem).not.toHaveBeenCalled();
});

test("a second tap while a switch is under way does nothing", async () => {
  vi.mocked(openSheetItem).mockReturnValue(new Promise(() => {}));
  show(2);
  fireEvent.click(button(copy.sheetNext));
  fireEvent.click(button(copy.sheetNext));
  fireEvent.click(button(copy.sheetPrev));
  await waitFor(() => expect(button(copy.sheetNext).disabled).toBe(true));
  expect(openSheetItem).toHaveBeenCalledTimes(1);
});

test("a failed switch says so and can be tried again", async () => {
  vi.mocked(openSheetItem).mockRejectedValueOnce(new ApiError(429, "rate_limited", "slow"));
  show(2);
  fireEvent.click(button(copy.sheetNext));
  expect((await screen.findByRole("alert")).textContent).toBe(copy.sheetSwitchFailed);
  expect(switched).not.toHaveBeenCalled();
  fireEvent.click(button(copy.sheetNext));
  await waitFor(() => expect(switched).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the list shows every problem with its first line and state, the count done, and marks the current one", async () => {
  show(2);
  const toggle = button(copy.sheetPosition(2, 3));
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  const list = await screen.findByRole("list");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(getSheet).toHaveBeenCalledExactlyOnceWith("sh1");
  expect(screen.getByText("Ôn tập HK1")).toBeTruthy();
  expect(screen.getByText(copy.sheetDoneCount(1, 3))).toBeTruthy();
  const rows = within(list).getAllByRole("button");
  expect(rows).toHaveLength(3);
  expect(rows[0].textContent).toContain("Bài 1");
  expect(rows[0].textContent).toContain("Giải phương trình bậc hai.");
  expect(rows[0].textContent).toContain(copy.sheetStateDone);
  expect(rows[1].textContent).toContain(copy.sheetStateStarted);
  expect(rows[2].textContent).toContain(copy.sheetStateNew);
  expect(rows.map((row) => row.getAttribute("aria-current"))).toEqual([null, "true", null]);
});

test("tapping a row switches to it; tapping the current row only closes the list", async () => {
  show(2);
  fireEvent.click(button(copy.sheetPosition(2, 3)));
  const rows = within(await screen.findByRole("list")).getAllByRole("button");
  fireEvent.click(rows[1]);
  await waitFor(() => expect(screen.queryByRole("list")).toBeNull());
  expect(openSheetItem).not.toHaveBeenCalled();

  fireEvent.click(button(copy.sheetPosition(2, 3)));
  fireEvent.click(within(await screen.findByRole("list")).getAllByRole("button")[2]);
  await waitFor(() => expect(switched).toHaveBeenCalledTimes(1));
  expect(openSheetItem).toHaveBeenCalledExactlyOnceWith("sh1", 3);
});

test("Escape closes the list, and a list that fails to load says so", async () => {
  show(2);
  fireEvent.click(button(copy.sheetPosition(2, 3)));
  await screen.findByRole("list");
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("list")).toBeNull());

  vi.mocked(getSheet).mockRejectedValueOnce(new Error("Offline"));
  fireEvent.click(button(copy.sheetPosition(2, 3)));
  expect((await screen.findByRole("alert")).textContent).toBe(copy.sheetListFailed);
});
