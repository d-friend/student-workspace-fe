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

export async function createGuest(locale?: string): Promise<{ guestId: string; created: boolean }> {
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
export async function currentSession(): Promise<{ sessionId: string; messages: Message[]; html: string | null } | null> {
  const res = await get("/api/sessions/current");
  if (res.status === 204) return null;
  if (!res.ok) throw await toApiError(res);
  const body = await res.json();
  return { sessionId: body.session_id, messages: body.messages, html: body.html };
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

// One agent turn. Text deltas go to onDelta; resolves on `done`, throws TurnError on `error`.
export async function turn(
  sessionId: string,
  message: Message,
  onDelta: (text: string) => void,
): Promise<{ turnId: string; stopReason: string | null }> {
  const res = await post(`/api/sessions/${sessionId}/turns`, { message });
  if (!res.ok) throw await toApiError(res);
  try {
    for await (const { event, data } of readSse(res)) {
      if (event === "text") onDelta((data as { delta: string }).delta);
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
    throw new TurnError("internal", e instanceof Error ? e.message : "stream failed");
  }
  throw new TurnError("stream_ended", "the reply stream ended before done");
}
