import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { BusinessSection } from "@/app/admin/BusinessSection";
import { useAdmin } from "@/app/admin/sections";
import type { Business, FeaturePanel } from "@/lib/admin";

vi.mock("@/app/admin/sections", () => ({
  Section: ({ title, children }: { title: string; children: ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  Empty: () => <p>No data</p>,
  Failure: () => <p>Failure</p>,
  Metric: ({ label, value, detail }: { label: string; value: number | string; detail?: string }) => <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>,
  money: () => "—",
  percent: () => "—",
  useAdmin: vi.fn(() => ({ data: null, error: false })),
  when: () => "",
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("renders weekly traction first, followed by the scorecard and return frequency", () => {
  render(<BusinessSection token="token" days={7} onGuestOpen={() => {}} />);

  const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  expect(headings.slice(0, 5)).toEqual(["Weekly traction", "Scorecard", "Comebacks", "Features", "How often people come back"]);
  expect(headings).not.toContain("Users");
});

test("shows windowed people activity and links with no opens", () => {
  const scorecard = {
    active: 15, new: 0, returning: 0, new_via_link: 0, messages: 12, workspaces: 3,
    start: { sent: 0, opened: 0, rate: null },
    completed: { persons: 0, active: 0, rate: null }, usd_per_active: null,
  };
  const data: Business = {
    scorecard, scorecard_previous: { ...scorecard, active: 12, messages: 10 }, frequency: [], cohorts: [],
    comebacks: { returning: 3, active: 15, doors: [{ door: "starter_surprise", return_days: 4, persons: 2 }, { door: "opened_only", return_days: 1, persons: 1 }] },
    weekly: Array.from({ length: 12 }, (_, index) => ({ week: `2026-W${String(index + 1).padStart(2, "0")}`, start: `2026-01-${String(index + 1).padStart(2, "0")}`, partial: index === 11, active: index === 11 ? 5 : 8, new: 2, returning: 3, messages: 12, workspaces: 3 })),
    people: [{
      person_id: "person", guest_id: "guest", label: "Student", school: null, grade: null,
      first_day: "2026-11-01", last_day: "2026-11-17", active_days_window: 2, active_days_total: 5,
      messages_window: 12, workspaces_window: 3, sessions: 4, completions: 1, usd: null,
      came_from: "direct", returning: false, dormant: false,
    }],
    links: [{
      type: "workspace", id: "workspace-id", path: "/s/workspace-id", title: null,
      sharer: null, created: "2026-11-17", opened: 0, new_to_dfriend: 0,
      did_something: 0, came_back: 0, started_own: 0,
    }],
    unknown_link_opens: 0,
  };
  const panel: FeaturePanel = {
    subjects: { opened: 4, tabs: [{ tab: "map", count: 5, persons: 3 }], reused: 2 },
    notes: { uploaded: 2, extracted: 2, merged: 1, failed: 1, retries: [{ stage: "merge", count: 1, persons: 1 }], reused: 1 },
    review: { started: 5, by_via: [{ via: "home_chip", count: 3, persons: 3 }], built: 4, finished: 2, answered: 3, reused_v1: 1, home_chip: 3, home_chip_with_exam: 2 },
    home: { empty_state: 10, doors: [{ door: "starter_surprise", sessions: 4, persons: 3 }], old_session: { picked: 5, from_home_card: 2, from_history_list: 2, unsplit: 1 } },
    learner: { replies: 20, observed: 5, persons_with_signals: 6, persons_ready: 2, transitions: [{ from: "intermediate", to: "advanced", why: "evidence", count: 1, persons: 1 }] },
  };
  const serve = (business: Business) => vi.mocked(useAdmin).mockImplementation(((path: string) => ({ data: path === "/business/features" ? panel : business, error: false })) as typeof useAdmin);
  serve(data);
  const { rerender } = render(<BusinessSection token="token" days={7} onGuestOpen={() => {}} />);

  const weekly = screen.getByRole("heading", { name: "Weekly traction" }).closest("section")!;
  expect(within(weekly).getByRole("img", { name: "Weekly active, new and returning people" })).toBeTruthy();
  expect(within(weekly).getByText(/5 active vs 8 last week: −3 \(−38%\) vs prev/)).toBeTruthy();
  const scorecardSection = screen.getByRole("heading", { name: "Scorecard" }).closest("section")!;
  expect(within(scorecardSection).getByText("+3 (+25%) vs prev")).toBeTruthy();
  expect(within(scorecardSection).getByText("Workspaces")).toBeTruthy();
  const messagesMetric = within(scorecardSection).getByText("Messages sent").parentElement!;
  expect(within(messagesMetric).getByText("12")).toBeTruthy();
  expect(within(messagesMetric).getByText("+2 (+20%) vs prev")).toBeTruthy();

  const comebacks = screen.getByRole("heading", { name: "Comebacks" }).closest("section")!;
  expect(within(comebacks).getByText("3 / 15 (—)")).toBeTruthy();
  expect(within(within(comebacks).getByRole("row", { name: /starter surprise/ })).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["starter surprise", "4", "2"]);
  expect(within(comebacks).getByText(/The door is the first thing they did that day/)).toBeTruthy();
  expect(within(comebacks).getByText("opened only")).toBeTruthy();
  const featuresSection0 = screen.getByRole("heading", { name: "Features", level: 2 }).closest("section")!;
  expect(within(featuresSection0).getByText("Picked up an old session from the home card").nextElementSibling!.textContent).toBe("2");
  expect(within(featuresSection0).getByText("…from the history list").nextElementSibling!.textContent).toBe("2");
  expect(within(featuresSection0).getByText(/can't be told apart/)).toBeTruthy();
  const featuresSection = screen.getByRole("heading", { name: "Features", level: 2 }).closest("section")!;
  expect(within(featuresSection).getByText("Opened the same subject on 2+ days").nextElementSibling!.textContent).toBe("2 / 4 (—)");
  expect(within(featuresSection).getByText("Master replies with an observation").nextElementSibling!.textContent).toBe("5 / 20 (—)");
  expect(within(featuresSection).getByText(/Home chip starts with a test date: 2 \/ 3/)).toBeTruthy();

  const people = screen.getByRole("heading", { name: "People" }).closest("section")!;
  const headers = within(people).getAllByRole("columnheader").map(header => header.textContent);
  expect(headers.slice(4, 7)).toEqual(["Active days (all time)", "Messages sent (window)", "Workspaces (window)"]);
  const cells = within(within(people).getByRole("row", { name: /Student/ })).getAllByRole("cell");
  expect(cells.slice(5, 7).map(cell => cell.textContent)).toEqual(["12", "3"]);
  expect(within(people).getByText(/Windowed: active days \(window\), Messages sent \(window\)/)).toBeTruthy();

  const links = screen.getByRole("heading", { name: "Shared links" }).closest("section")!;
  const linkCells = within(within(links).getByRole("row", { name: /workspace-id/ })).getAllByRole("cell");
  expect(linkCells.slice(3).map(cell => cell.textContent)).toEqual(["0", "—", "—", "—", "—"]);
  expect(within(links).getByText(/a link is listed if it was shared or opened in the selected range/)).toBeTruthy();

  serve({ ...data, weekly: data.weekly.map((week, index) => index === 10 ? { ...week, active: 0 } : week) });
  rerender(<BusinessSection token="token" days={7} onGuestOpen={() => {}} />);
  expect(within(weekly).getByText(/5 active vs 0 last week: —/)).toBeTruthy();

  serve({ ...data, weekly: data.weekly.map(week => ({ ...week, active: 0 })) });
  rerender(<BusinessSection token="token" days={7} onGuestOpen={() => {}} />);
  expect(within(weekly).getByText("No data")).toBeTruthy();
  expect(within(weekly).queryByRole("img")).toBeNull();

  serve({ ...data, weekly: undefined } as unknown as Business);
  rerender(<BusinessSection token="token" days={7} onGuestOpen={() => {}} />);
  expect(within(weekly).getByText("No data")).toBeTruthy();
});
