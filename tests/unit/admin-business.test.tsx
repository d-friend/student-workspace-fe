import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { BusinessSection } from "@/app/admin/BusinessSection";
import { useAdmin } from "@/app/admin/sections";
import type { Business } from "@/lib/admin";

vi.mock("@/app/admin/sections", () => ({
  Section: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  UsersSection: () => <section><h2>Users</h2></section>,
  Empty: () => <p>No data</p>,
  Failure: () => <p>Failure</p>,
  Metric: () => <div />,
  money: () => "—",
  percent: () => "—",
  useAdmin: vi.fn(() => ({ data: null, error: false })),
  when: () => "",
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("renders UsersSection between Scorecard and return frequency", () => {
  render(<BusinessSection token="token" days={7} onGuestOpen={() => {}} />);

  const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  expect(headings.indexOf("Scorecard")).toBeLessThan(headings.indexOf("Users"));
  expect(headings.indexOf("Users")).toBeLessThan(headings.indexOf("How often people come back"));
});

test("shows windowed people activity and links with no opens", () => {
  const scorecard = {
    active: 1, new: 0, returning: 0, new_via_link: 0,
    start: { sent: 0, opened: 0, rate: null },
    completed: { persons: 0, active: 0, rate: null }, usd_per_active: null,
  };
  const data: Business = {
    scorecard, scorecard_previous: scorecard, frequency: [], cohorts: [],
    people: [{
      person_id: "person", guest_id: "guest", label: "Student", school: null, grade: null,
      first_day: "2026-11-01", last_day: "2026-11-17", active_days_window: 2, active_days_total: 5,
      turns_window: 12, workspaces_window: 3, sessions: 4, completions: 1, usd: null,
      came_from: "direct", returning: false, dormant: false,
    }],
    links: [{
      type: "workspace", id: "workspace-id", path: "/s/workspace-id", title: null,
      sharer: null, created: "2026-11-17", opened: 0, new_to_dfriend: 0,
      did_something: 0, came_back: 0, started_own: 0, last_shared_day: "2026-11-17",
    }],
    unknown_link_opens: 0,
  };
  vi.mocked(useAdmin).mockReturnValue({ data, error: false });
  render(<BusinessSection token="token" days={7} onGuestOpen={() => {}} />);

  const people = screen.getByRole("heading", { name: "People" }).closest("section")!;
  const headers = within(people).getAllByRole("columnheader").map(header => header.textContent);
  expect(headers.slice(4, 7)).toEqual(["Active days (all time)", "Turns (window)", "Workspaces (window)"]);
  const cells = within(within(people).getByRole("row", { name: /Student/ })).getAllByRole("cell");
  expect(cells.slice(5, 7).map(cell => cell.textContent)).toEqual(["12", "3"]);

  const links = screen.getByRole("heading", { name: "Shared links" }).closest("section")!;
  const linkCells = within(within(links).getByRole("row", { name: /workspace-id/ })).getAllByRole("cell");
  expect(linkCells.slice(3).map(cell => cell.textContent)).toEqual(["0", "—", "—", "—", "—"]);
  expect(within(links).getByText(/a link is listed if it was shared or opened in the selected range/)).toBeTruthy();
});
