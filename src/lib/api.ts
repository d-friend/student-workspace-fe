import type { Block, CheckResponse, Phase, Workspace, WorkspaceDoc } from "@/workspace/types";
import { getLocale } from "./copy";
import { readSse } from "./sse";

// Typed client for spec 4.2 to 4.6. A 401 no_guest makes one guest call and one retry.

export type StartedVia = "photo" | "typed" | "starter_derivative" | "starter_geometry";

export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };
};
export type TextBlock = { type: "text"; text: string };
export type Message =
  | { role: "user" | "assistant"; content: string }
  | { role: "user"; content: [ImageBlock] | [ImageBlock, TextBlock] };

export type EventPayload = {
  type: string;
  at: string;
  session_id: string | null;
  props: Record<string, unknown>;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterS?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// A failure inside the stream, from an `error` event or a broken connection.
export class TurnError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TurnError";
  }
}

const JSON_HEADERS = { "content-type": "application/json" };

async function toApiError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  const error = body?.error ?? {};
  const retryAfter = error.retry_after_s ?? (Number(res.headers.get("retry-after")) || undefined);
  return new ApiError(res.status, error.code ?? "unknown", error.message ?? res.statusText, retryAfter);
}

async function isNoGuest(res: Response): Promise<boolean> {
  const body = await res.clone().json().catch(() => ({}));
  return body?.error?.code === "no_guest";
}

async function withGuest(send: () => Promise<Response>): Promise<Response> {
  const res = await send();
  if (res.status !== 401 || !(await isNoGuest(res))) return res;
  await createGuest();
  return send();
}

const post = (path: string, body: unknown, keepalive = false) =>
  withGuest(() => fetch(path, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body), keepalive }));
const get = (path: string) => withGuest(() => fetch(path));

// Parallel first-visit callers (app start, a 401 retry, the first event) share one request: each
// extra POST without a cookie would mint another guest for the same visitor.
let guestInFlight: Promise<{ guestId: string; created: boolean }> | null = null;

export function createGuest(locale?: string): Promise<{ guestId: string; created: boolean }> {
  guestInFlight ??= postGuest(locale).finally(() => {
    guestInFlight = null;
  });
  return guestInFlight;
}

async function postGuest(locale?: string): Promise<{ guestId: string; created: boolean }> {
  const res = await fetch("/api/guest", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(locale ? { locale } : {}),
  });
  if (!res.ok) throw await toApiError(res);
  const body = await res.json();
  return { guestId: body.guest_id, created: body.created };
}

export async function createSession(startedVia: StartedVia): Promise<{ sessionId: string }> {
  const res = await post("/api/sessions", { started_via: startedVia });
  if (!res.ok) throw await toApiError(res);
  const body = await res.json();
  return { sessionId: body.session_id };
}

// The guest's open session with its transcript, or null (204) when there is none.
export async function currentSession(): Promise<{
  sessionId: string;
  messages: Message[];
  html: string | null;
  tabs: (Workspace & { phase: Phase })[];
  activeId: string | null;
} | null> {
  const res = await get("/api/sessions/current");
  if (res.status === 204) return null;
  if (!res.ok) throw await toApiError(res);
  const body = await res.json();
  const tabs = (body.tabs ?? []).map((w: { workspace_id: string; phase: Phase; doc: WorkspaceDoc; state?: Workspace["state"] }) =>
    ({ id: w.workspace_id, phase: w.phase, doc: w.doc, state: w.state }));
  return { sessionId: body.session_id, messages: body.messages, html: body.html ?? null, tabs, activeId: body.active_workspace_id ?? null };
}

// Whether a turn of this session is still running on the server.
export async function turnStatus(sessionId: string): Promise<boolean> {
  const res = await get(`/api/sessions/${sessionId}/turn-status`);
  if (!res.ok) throw await toApiError(res);
  return (await res.json()).in_flight;
}

export async function check(
  sessionId: string,
  body: { workspaceId: string; blockId: string; answer: string; previous: string[]; item?: number },
): Promise<CheckResponse> {
  const res = await post(`/api/sessions/${sessionId}/check`, {
    workspace_id: body.workspaceId,
    block_id: body.blockId,
    answer: body.answer,
    previous: body.previous,
    ...(body.item !== undefined && { item: body.item }),
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function endSession(sessionId: string, reason: "new_problem" | "abandoned"): Promise<void> {
  // keepalive: "Bài mới" then a reload must not leave the old session open for currentSession to resurrect.
  const res = await post(`/api/sessions/${sessionId}/end`, { reason }, true);
  if (!res.ok) throw await toApiError(res);
}

export async function sendEvents(
  events: EventPayload[],
): Promise<{ accepted: number; rejected: { index: number; reason: string }[] }> {
  const res = await post("/api/events", { events });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function sendFeedback(message: string): Promise<void> {
  const res = await post("/api/feedback", { message });
  if (!res.ok) throw await toApiError(res);
}

// The static blocks written so far; every other block is a stub that only holds its place.
export type PreviewBlock = Block | { type: "stub"; id: string };
export type Preview = { phase: Phase; title: string | null; blocks: PreviewBlock[] };

export type TurnEvent =
  | { event: "announce"; text: string }
  | { event: "status"; stage: "planning" | "searching" | "reading" | "simulating" | "failed"; label?: string; phase?: Phase }
  | ({ event: "workspace_partial" } & Preview)
  | { event: "workspace"; workspaceId: string; phase: Phase; doc: WorkspaceDoc; replaces?: string }
  | { event: "simulation"; workspaceId: string; blockId: string; html: string; height: number }
  | { event: "simulation_failed"; workspaceId: string; blockId: string }
  | { event: "active"; workspaceId: string }
  | { event: "line_state"; workspaceId: string; blockId: string; line: number; state: "ok" | "review" }
  | { event: "task_done"; workspaceId: string; blockId: string };

// One agent turn. Text deltas go to onDelta; resolves on `done`, throws TurnError on `error`.
export async function turn(
  sessionId: string,
  message: Message,
  onDelta: (text: string) => void,
  onEvent?: (e: TurnEvent) => void,
): Promise<{ turnId: string; stopReason: string | null }> {
  // A request that never connects may still have reached the server, so it is as recoverable as a dropped stream.
  const res = await post(`/api/sessions/${sessionId}/turns`, { message, lang: getLocale() }).catch((e) => {
    throw new TurnError("stream_lost", e instanceof Error ? e.message : "request failed");
  });
  if (!res.ok) throw await toApiError(res);
  try {
    for await (const { event, data } of readSse(res)) {
      if (event === "text") onDelta((data as { delta: string }).delta);
      else if (event === "announce" || event === "status" || event === "workspace_partial") onEvent?.({ event, ...(data as object) } as TurnEvent);
      else if (event === "workspace") {
        const d = data as { workspace_id: string; phase: Phase; doc: WorkspaceDoc; replaces?: string };
        onEvent?.({ event, workspaceId: d.workspace_id, phase: d.phase, doc: d.doc, ...(d.replaces && { replaces: d.replaces }) });
      } else if (event === "active") {
        onEvent?.({ event, workspaceId: (data as { workspace_id: string }).workspace_id });
      } else if (event === "line_state") {
        const d = data as { workspace_id: string; block_id: string; line: number; state: "ok" | "review" };
        onEvent?.({ event, workspaceId: d.workspace_id, blockId: d.block_id, line: d.line, state: d.state });
      } else if (event === "task_done") {
        const d = data as { workspace_id: string; block_id: string };
        onEvent?.({ event, workspaceId: d.workspace_id, blockId: d.block_id });
      }
      else if (event === "simulation" || event === "simulation_failed") {
        const d = data as { workspace_id: string; block_id: string; html?: string; height?: number };
        onEvent?.(event === "simulation"
          ? { event, workspaceId: d.workspace_id, blockId: d.block_id, html: d.html!, height: d.height! }
          : { event, workspaceId: d.workspace_id, blockId: d.block_id });
      }
      else if (event === "done") {
        const done = data as { turn_id: string; stop_reason: string | null };
        return { turnId: done.turn_id, stopReason: done.stop_reason };
      } else if (event === "error") {
        const err = data as { code: string; message: string };
        throw new TurnError(err.code, err.message);
      }
    }
  } catch (e) {
    if (e instanceof TurnError) throw e;
    // The server keeps building after the connection drops (a locked phone), so the caller can wait for it.
    throw new TurnError("stream_lost", e instanceof Error ? e.message : "stream failed");
  }
  throw new TurnError("stream_lost", "the reply stream ended before done");
}

export type AuthMethods = { google: boolean; email: boolean; demo?: boolean };
export type Me = { signed_in: false } | { signed_in: true; email: string; name: string | null };

// Plain fetch, not get(): asking who is signed in must not create a guest.
export async function authMethods(): Promise<AuthMethods> {
  const res = await fetch("/api/auth/methods");
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function getMe(): Promise<Me> {
  const res = await fetch("/api/me");
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function demoSignIn(email: string, password: string): Promise<Extract<Me, { signed_in: true }>> {
  const res = await post("/api/auth/demo", { email, password });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function emailStart(email: string): Promise<void> {
  const res = await post("/api/auth/email/start", { email });
  if (!res.ok) throw await toApiError(res);
}

export async function emailVerify(email: string, code: string): Promise<Extract<Me, { signed_in: true }>> {
  const res = await post("/api/auth/email/verify", { email, code });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function logout(): Promise<void> {
  const res = await post("/api/auth/logout", {});
  if (!res.ok) throw await toApiError(res);
}

export type SessionSummary = {
  id: string;
  title: string | null;
  created_at: string;
  last_active_at: string; // the list is ordered and grouped by this, so a resumed session moves to the top
  tabs: { phase: "learn" | "solve" | "practice" }[];
  done: boolean;
  current: boolean;
};

export type SessionList = { sessions: SessionSummary[]; next_before: string | null };

export async function listSessions(before?: string, limit = 20): Promise<SessionList> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (before !== undefined) query.set("before", before);
  const res = await get(`/api/sessions?${query}`);
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

// The student switched tabs: the server keeps it so the tutor and a reload see the tab they are looking at.
export async function setActiveWorkspace(sessionId: string, workspaceId: string): Promise<void> {
  const res = await withGuest(() =>
    fetch(`/api/sessions/${sessionId}/active`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ workspace_id: workspaceId }), keepalive: true,
    }),
  );
  if (!res.ok) throw await toApiError(res);
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await withGuest(() => fetch(`/api/sessions/${sessionId}`, {
    method: "DELETE", headers: JSON_HEADERS, body: "{}",
  }));
  if (!res.ok) throw await toApiError(res);
}

// Opening a past session resumes it on this device: the caller reloads, and the restore path loads it.
export async function resumeSession(sessionId: string): Promise<void> {
  const res = await post(`/api/sessions/${sessionId}/resume`, {});
  if (!res.ok) throw await toApiError(res);
}

// Content is saved separately from the content-free event stream.
export async function putWorkspaceState(id: string, state: NonNullable<Workspace["state"]>): Promise<void> {
  const res = await withGuest(() => fetch(`/api/workspaces/${id}/state`, {
    method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ state }), keepalive: true,
  }));
  if (!res.ok) throw await toApiError(res);
}
