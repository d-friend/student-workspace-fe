import { ApiError } from "@/lib/api";

export type Pct = { p50: number | null; p90: number | null; n: number };
export type Health = {
  turns_today: number;
  daily_turn_budget: number;
  turns: number;
  failed: number;
  errors_by_code: { code: string; n: number }[];
  planner_errors: number;
  client_turn_failed: { code: string; n: number }[];
};
export type Cost = {
  total_usd: number;
  unpriced_models: string[];
  per_day: { day: string; usd: number; turns: number }[];
  by_role_model: {
    role: string;
    model: string | null;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    usd: number | null;
  }[];
  per_active_guest_day_usd: number | null;
  per_completed_problem_usd: number | null;
  cache_read_ratio: number | null;
  searches: number;
};
export type Latency = {
  master_first_text_ms: Pct;
  master_total_ms: Pct;
  planner_total_ms: Pct;
  simulator_total_ms: Pct;
  time_to_first_workspace_ms: Pct;
  workspace_shown_ms: Pct;
  slowest: {
    turn_id: string;
    guest_id: string;
    started_at: string;
    route: string | null;
    total_ms: number;
    first_text_ms: number | null;
    model: string | null;
    ok: boolean | null;
    error_code: string | null;
  }[];
  slowest_calls: {
    turn_id: string;
    guest_id: string;
    started_at: string;
    role: string;
    total_ms: number;
    model: string | null;
    error_code: string | null;
  }[];
};
export type Features = {
  events: {
    type: string; count: number; guests: number; persons: number;
    by_method: { method: string; count: number; guests: number; persons: number }[];
    by_kind: { kind: string; count: number; guests: number; persons: number }[];
    by_new_user: { new_user: boolean; count: number; guests: number; persons: number }[];
  }[];
  tabs_per_session: { tabs: "1" | "2" | "3" | "4" | "5+"; sessions: number }[];
};
export type UserFunnel = { opened: number; sent_problem: number; saw_workspace: number; completed: number };
export type AccountRow = {
  user_id: string;
  email: string;
  name: string | null;
  age: number | null;
  parent_consent: boolean;
  created_at: string;
  last_login_at: string | null;
  guests: number;
};
export type Users = {
  new_accounts_per_day: { day: string; n: number }[];
  accounts_total: number;
  accounts_under_16: number;
  accounts_with_parent_consent: number;
  guests_linked: number;
  new_guests_per_day: { day: string; n: number }[];
  active_guests_per_day: { day: string; n: number }[];
  workspaces_per_day: { day: string; learn: number; solve: number; completed: number }[];
  accounts: AccountRow[];
  funnel: UserFunnel;
  funnel_by_person: UserFunnel;
};
export type Thesis = {
  returns_by_person: { person_id: string; first_completion_day: string; active_days_after: number; first_return_gap_days: number | null; days_observed: number }[];
  returns: { guest_id: string; first_completion_day: string; active_days_after: number; first_return_gap_days: number | null; days_observed: number }[];
  cohorts_by_person: { first_completion_day: string; completers: number; eligible_d1: number; returned_d1: number; eligible_d7: number; returned_d7: number }[];
  cohorts: { first_completion_day: string; completers: number; eligible_d1: number; returned_d1: number; eligible_d7: number; returned_d7: number }[];
  pairs: { session_id: string; original_max_hint: number; reinforcement_max_hint: number; drop: number }[];
  hint_table: { original_max_hint: number; reinforcement_max_hint: number; n: number }[];
  mean_drop: number | null;
  funnel: { sessions_original_done: number; sessions_offered: number; sessions_accepted: number; sessions_reinforcement_done: number };
};
export type GuestRow = { nickname?: string | null; province?: string | null; grade?: number | null; school?: string | null; profile_at?: string | null; id: string; user_id: string | null; email: string | null; created_at: string; last_seen_at: string; internal: boolean; sessions: number; turns: number; completions: number; usd: number };
export type GuestDetail = {
  guest: GuestRow;
  sibling_guest_ids: string[];
  sessions: {
    id: string;
    started_via: string;
    last_active_at: string | null;
    active_workspace_id: string | null;
    tabs: { workspace_id: string; phase: "learn" | "solve" | "practice" }[];
    resumed: number;
    created_at: string;
    ended_at: string | null;
    end_reason: string | null;
    mode: string | null;
    turns: {
      id: string;
      started_at: string;
      kind: string;
      route: string | null;
      mode: string | null;
      ok: boolean | null;
      error_code: string | null;
      total_ms: number | null;
      first_text_ms: number | null;
      model: string | null;
      usd: number | null;
      events: string[];
    }[];
  }[];
};

export type FeedbackRow = { id: number; guest_id: string; created_at: string; message: string; internal: boolean };
export type SheetRow = { id: string; title: string; items: number; path: string; created_at: string };
export type SheetCostTotal = { calls: number; input_tokens: number; output_tokens: number; usd: number | null; unpriced: boolean };
export type SheetCostRow = SheetCostTotal & { guest_id: string };
export type SheetReport = {
  sheet: { id: string; title: string; items: number };
  funnel: { opened: number; answered: number; completed_one: number; completed_all: number; returned_later_day: number; started_own: number };
  items: { position: number; label: string; opened: number; completed: number; hint_0: number; hint_1: number; hint_2: number; hint_3: number; other_way: number }[];
  steps: { position: number; line: number; tried: number; wrong_first: number }[];
  students: { guest_id: string; name: string | null; opened: number; completed: number; max_hints: Record<string, number>; wrong_first: [number, number][] }[];
  cost?: SheetCostRow[];
  cost_total?: SheetCostTotal;
};

const TOKEN_KEY = "df_admin_token";

async function errorFor(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  const error = body?.error ?? {};
  return new ApiError(res.status, error.code ?? "unknown", error.message ?? res.statusText);
}

export async function adminGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`/api/admin${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw await errorFor(res);
  return res.json();
}

export async function adminPut(path: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(`/api/admin${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFor(res);
}

export async function adminPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFor(res);
  return res.json();
}

export function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}
export type Scorecard = {
  active: number; new: number; returning: number; new_via_link: number;
  start: { sent: number; opened: number; rate: number | null };
  completed: { persons: number; active: number; rate: number | null };
  usd_per_active: number | null;
};

export type BusinessPerson = {
  person_id: string; guest_id: string; label: string | null; school: string | null; grade: number | null;
  first_day: string; last_day: string; active_days_window: number; active_days_total: number;
  sessions: number; completions: number; usd: number | null;
  came_from: "shared link" | "sheet" | "direct"; returning: boolean; dormant: boolean;
};

export type BusinessLink = {
  type: "workspace" | "session" | "sheet"; id: string; path: string; title: string | null;
  sharer: string | null; created: string; opened: number; new_to_dfriend: number;
  did_something: number; came_back: number; started_own: number;
};

export type Business = {
  scorecard: Scorecard; scorecard_previous: Scorecard;
  frequency: { bucket: "1" | "2" | "3-5" | "6+"; persons: number }[];
  cohorts: { week: string; n: number; weeks: (number | null)[] }[];
  people: BusinessPerson[]; links: BusinessLink[]; unknown_link_opens: number;
};
