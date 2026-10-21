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
};
export type Users = {
  new_guests_per_day: { day: string; n: number }[];
  active_guests_per_day: { day: string; n: number }[];
  funnel: { opened: number; sent_problem: number; saw_workspace: number; completed: number };
};
export type Thesis = {
  returns: { guest_id: string; first_completion_day: string; active_days_after: number; first_return_gap_days: number | null; days_observed: number }[];
  cohorts: { first_completion_day: string; completers: number; eligible_d1: number; returned_d1: number; eligible_d7: number; returned_d7: number }[];
  pairs: { session_id: string; original_max_hint: number; reinforcement_max_hint: number; drop: number }[];
  hint_table: { original_max_hint: number; reinforcement_max_hint: number; n: number }[];
  mean_drop: number | null;
  funnel: { sessions_original_done: number; sessions_offered: number; sessions_accepted: number; sessions_reinforcement_done: number };
};
export type GuestRow = { id: string; created_at: string; last_seen_at: string; internal: boolean; sessions: number; turns: number; completions: number; usd: number };
export type GuestDetail = {
  guest: GuestRow;
  sessions: {
    id: string;
    started_via: string;
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
