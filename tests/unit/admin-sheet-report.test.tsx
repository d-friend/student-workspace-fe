import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { SheetsSection } from "@/app/admin/sections";
import { adminGet, type SheetReport, type SheetRow } from "@/lib/admin";

vi.mock("@/lib/admin", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/admin")>()), adminGet: vi.fn(), adminPost: vi.fn() }));
const mockedGet = vi.mocked(adminGet);

const sheets: SheetRow[] = [
  { id: "sh1", title: "Ôn tập HK1", items: 2, path: "/sheet/sh1", created_at: "2026-11-10T03:00:00Z" },
  { id: "sh2", title: "Hàm số", items: 1, path: "/sheet/sh2", created_at: "2026-11-01T03:00:00Z" },
];
const report: SheetReport = {
  sheet: { id: "sh1", title: "Ôn tập HK1", items: 2 },
  funnel: { opened: 31, answered: 24, completed_one: 19, completed_all: 6, returned_later_day: 4, started_own: 2 },
  items: [
    { position: 1, label: "Bài 1", opened: 31, completed: 19, hint_0: 9, hint_1: 4, hint_2: 3, hint_3: 3, other_way: 1 },
    { position: 2, label: "Bài 2", opened: 20, completed: 6, hint_0: 1, hint_1: 1, hint_2: 1, hint_3: 3, other_way: 0 },
  ],
  steps: [
    { position: 1, line: 1, tried: 30, wrong_first: 5 },
    { position: 2, line: 3, tried: 14, wrong_first: 11 },
  ],
  students: [
    { guest_id: "g-an-aaaaaaaa", name: "An", opened: 2, completed: 1, max_hints: { "1": 2 }, wrong_first: [[2, 3]] },
    { guest_id: "g-none-bbbbbbb", name: null, opened: 1, completed: 0, max_hints: {}, wrong_first: [] },
  ],
};

function serve(reportResult: Promise<SheetReport> | SheetReport = report) {
  mockedGet.mockImplementation((path: string) => {
    if (path === "/sheets") return Promise.resolve(sheets) as never;
    if (path === "/sheets/sh1/report") return Promise.resolve(reportResult) as never;
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const open = async () => {
  render(<SheetsSection token="token" />);
  fireEvent.click((await screen.findAllByRole("button", { name: /^Report/ }))[0]);
};
const table = (name: string) => screen.findByRole("table", { name });
const cells = (row: HTMLElement) => within(row).getAllByRole("cell").map((cell) => cell.textContent);

test("each sheet has a Report button, and nothing is fetched until it is pressed", async () => {
  serve();
  render(<SheetsSection token="token" />);
  expect(await screen.findAllByRole("button", { name: /^Report/ })).toHaveLength(2);
  expect(mockedGet).not.toHaveBeenCalledWith("/sheets/sh1/report", "token");
});

test("pressing Report loads that sheet's report with its title", async () => {
  serve();
  await open();
  expect((await screen.findByRole("heading", { name: /Ôn tập HK1/ })).textContent).toContain("Report");
  expect(mockedGet).toHaveBeenCalledWith("/sheets/sh1/report", "token");
});

test("the funnel table lists the six stages with their guest counts", async () => {
  serve();
  await open();
  const rows = within(await table("Funnel")).getAllByRole("row").slice(1);
  expect(rows.map(cells)).toEqual([
    ["Opened the sheet", "31"],
    ["Answered a step", "24"],
    ["Finished a problem", "19"],
    ["Finished all problems", "6"],
    ["Came back on a later day", "4"],
    ["Started a problem of their own", "2"],
  ]);
});

test("the per-problem table shows opened, finished, the hint levels and other-way", async () => {
  serve();
  await open();
  const view = within(await table("Per problem"));
  expect(view.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(
    ["Problem", "Opened", "Finished", "Hint 0", "Hint 1", "Hint 2", "Hint 3", "Other way"],
  );
  expect(view.getAllByRole("row").slice(1).map(cells)).toEqual([
    ["Bài 1", "31", "19", "9", "4", "3", "3", "1"],
    ["Bài 2", "20", "6", "1", "1", "1", "3", "0"],
  ]);
});

test("the per-step table names the problem and the step, with tried and wrong-first counts", async () => {
  serve();
  await open();
  const view = within(await table("Per step"));
  expect(view.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Problem", "Step", "Tried", "Wrong first try"]);
  expect(view.getAllByRole("row").slice(1).map(cells)).toEqual([
    ["Bài 1", "1", "30", "5"],
    ["Bài 2", "3", "14", "11"],
  ]);
});

test("the per-student table is the only place with names; a guest without one says so", async () => {
  serve();
  await open();
  const view = within(await table("Per student"));
  expect(view.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Opened", "Finished", "Highest hint", "Wrong first try"]);
  expect(view.getAllByRole("row").slice(1).map(cells)).toEqual([
    ["An", "2", "1", "Bài 1: 2", "Bài 2 step 3"],
    ["(no name)", "1", "0", "—", "—"],
  ]);
  for (const other of ["Funnel", "Per problem", "Per step"]) expect(within(screen.getByRole("table", { name: other })).queryByText("An")).toBeNull();
});

test("a report that is still loading says so, and one that fails shows the section error", async () => {
  serve(new Promise(() => {}));
  await open();
  expect(await screen.findByText("Loading…")).toBeTruthy();
  cleanup();
  mockedGet.mockImplementation((path: string) => (path === "/sheets" ? Promise.resolve(sheets) : Promise.reject(new Error("down"))) as never);
  await open();
  expect((await screen.findByRole("alert")).textContent).toBe("Could not load this section.");
});

test("another sheet's report replaces the open one, and pressing Report again closes it", async () => {
  serve();
  render(<SheetsSection token="token" />);
  const buttons = await screen.findAllByRole("button", { name: /^Report/ });
  fireEvent.click(buttons[0]);
  await table("Funnel");
  fireEvent.click(buttons[0]);
  await waitFor(() => expect(screen.queryByRole("table", { name: "Funnel" })).toBeNull());
  mockedGet.mockClear();
  serve();
  fireEvent.click(buttons[1]);
  await waitFor(() => expect(mockedGet).toHaveBeenCalledWith("/sheets/sh2/report", "token"));
  expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
  expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
});
