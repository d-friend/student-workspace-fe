import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CostSection, HealthSection, LatencySection, ThesisSection, UsersSection } from "@/app/admin/sections";
import { adminGet, type Cost, type Health, type Latency, type Thesis, type Users } from "@/lib/admin";

vi.mock("@/lib/admin", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/admin")>()), adminGet: vi.fn() }));
const mockedAdminGet = vi.mocked(adminGet);

const health: Health = {
  turns_today: 3, daily_turn_budget: 100, turns: 4, failed: 1, errors_by_code: [{ code: "upstream", n: 1 }], planner_errors: 1,
  client_turn_failed: [{ code: "rate_limited", n: 1 }],
};
const cost: Cost = {
  total_usd: 1.25, unpriced_models: ["unknown-model"], per_day: [{ day: "2026-10-19", usd: 1.25, turns: 4 }],
  by_role_model: [{ role: "master", model: "unknown-model", calls: 1, input_tokens: 2, output_tokens: 3, cache_read_tokens: 4, cache_write_tokens: 5, usd: null }],
  per_active_guest_day_usd: 0.625, per_completed_problem_usd: 1.25, cache_read_ratio: 0.4, searches: 2,
};
const latency: Latency = {
  master_first_text_ms: { p50: 20, p90: 30, n: 2 }, master_total_ms: { p50: 50, p90: 70, n: 2 }, planner_total_ms: { p50: 10, p90: 20, n: 2 },
  time_to_first_workspace_ms: { p50: 100, p90: null, n: 1 }, workspace_shown_ms: { p50: 40, p90: 50, n: 2 },
  slowest: [{ turn_id: "turn-1", guest_id: "guest-12345678", started_at: "2026-10-19T00:00:00Z", route: "master", total_ms: 70, first_text_ms: 30, model: "model", ok: true, error_code: null }],
};
const users: Users = {
  new_guests_per_day: [{ day: "2026-10-19", n: 4 }], active_guests_per_day: [{ day: "2026-10-19", n: 3 }],
  funnel: { opened: 10, sent_problem: 5, saw_workspace: 4, completed: 2 },
};
const thesis: Thesis = {
  returns: [], cohorts: [{ first_completion_day: "2026-10-10", completers: 2, eligible_d1: 2, returned_d1: 1, eligible_d7: 0, returned_d7: 0 }],
  pairs: [{ session_id: "session-1", original_max_hint: 2, reinforcement_max_hint: 1, drop: 1 }], hint_table: [{ original_max_hint: 2, reinforcement_max_hint: 1, n: 1 }],
  mean_drop: 1, funnel: { sessions_original_done: 5, sessions_offered: 4, sessions_accepted: 3, sessions_reinforcement_done: 2 },
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test("Health shows turns today against the budget and the top error code", async () => {
  mockedAdminGet.mockResolvedValue(health);
  render(<HealthSection token="token" days={7} />);
  expect(await screen.findByText("3 / 100")).toBeTruthy();
  expect(screen.getByText("upstream")).toBeTruthy();
});

test("Cost shows — and the partial notice for an unpriced model, never $0", async () => {
  mockedAdminGet.mockResolvedValue(cost);
  render(<CostSection token="token" days={7} />);
  expect(await screen.findByText("Partial: no price for unknown-model")).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
  expect(screen.queryByText("$0.00")).toBeNull();
});

test("Cost shows per guest-day and per completed problem", async () => {
  mockedAdminGet.mockResolvedValue(cost);
  render(<CostSection token="token" days={7} />);
  expect(await screen.findByText("$0.6250")).toBeTruthy();
  expect(screen.getAllByText("$1.25").length).toBeGreaterThan(0);
});

test("Latency lists the slowest turns and the guest id is a button", async () => {
  mockedAdminGet.mockResolvedValue(latency);
  render(<LatencySection token="token" days={7} />);
  expect(await screen.findByRole("button", { name: "guest-12345678" })).toBeTruthy();
  expect(screen.getByText("turn-1")).toBeTruthy();
});

test("Users shows funnel step percentages", async () => {
  mockedAdminGet.mockResolvedValue(users);
  render(<UsersSection token="token" days={7} />);
  expect((await screen.findAllByText("50%")).length).toBeGreaterThan(0);
  expect(screen.getByText("80%")).toBeTruthy();
});

test("Thesis renders the hint grid and shows — for D7 when no one is eligible", async () => {
  mockedAdminGet.mockResolvedValue(thesis);
  render(<ThesisSection token="token" days={7} />);
  expect(await screen.findByText("1", { selector: "td" })).toBeTruthy();
  expect(screen.getAllByText("—").length).toBeGreaterThan(0);
});

test("renders empty states", async () => {
  const emptyHealth: Health = { turns_today: 0, daily_turn_budget: 100, turns: 0, failed: 0, errors_by_code: [], planner_errors: 0, client_turn_failed: [] };
  const emptyCost: Cost = { ...cost, total_usd: 0, unpriced_models: [], per_day: [], by_role_model: [], per_active_guest_day_usd: null, per_completed_problem_usd: null, cache_read_ratio: null, searches: 0 };
  const emptyLatency: Latency = { ...latency, master_first_text_ms: { p50: null, p90: null, n: 0 }, master_total_ms: { p50: null, p90: null, n: 0 }, planner_total_ms: { p50: null, p90: null, n: 0 }, time_to_first_workspace_ms: { p50: null, p90: null, n: 0 }, workspace_shown_ms: { p50: null, p90: null, n: 0 }, slowest: [] };
  const emptyUsers: Users = { new_guests_per_day: [], active_guests_per_day: [], funnel: { opened: 0, sent_problem: 0, saw_workspace: 0, completed: 0 } };
  const emptyThesis: Thesis = { returns: [], cohorts: [], pairs: [], hint_table: [], mean_drop: null, funnel: { sessions_original_done: 0, sessions_offered: 0, sessions_accepted: 0, sessions_reinforcement_done: 0 } };
  mockedAdminGet.mockImplementation((path) => Promise.resolve(path.startsWith("/health") ? emptyHealth : path.startsWith("/cost") ? emptyCost : path.startsWith("/latency") ? emptyLatency : path.startsWith("/users") ? emptyUsers : emptyThesis));
  render(<><HealthSection token="token" days={7} /><CostSection token="token" days={7} /><LatencySection token="token" days={7} /><UsersSection token="token" days={7} /><ThesisSection token="token" days={7} /></>);
  expect((await screen.findAllByText("No data yet.")).length).toBeGreaterThan(0);
  expect(screen.queryByText("NaN")).toBeNull();
});

test("a failing section shows its own error without breaking the others", async () => {
  mockedAdminGet.mockImplementation((path) => path.startsWith("/health") ? Promise.reject(new Error("down")) : Promise.resolve(cost));
  render(<><HealthSection token="token" days={7} /><CostSection token="token" days={7} /></>);
  expect(await screen.findByText("Could not load this section.")).toBeTruthy();
  expect(screen.getAllByText("$1.25").length).toBeGreaterThan(0);
});
