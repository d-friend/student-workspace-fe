import { afterEach, expect, test, vi } from "vitest";
import { ApiError, check, createSession, currentSession, endSession, turn, type TurnEvent } from "@/lib/api";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => vi.unstubAllGlobals());

test("a 401 no_guest creates the guest once and retries the request", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json(401, { error: { code: "no_guest", message: "no guest" } }))
    .mockResolvedValueOnce(json(200, { guest_id: "g1", created: true }))
    .mockResolvedValueOnce(json(201, { session_id: "s1", created_at: "2026-10-15T00:00:00Z" }));
  vi.stubGlobal("fetch", fetchMock);

  const { sessionId } = await createSession("typed");

  expect(sessionId).toBe("s1");
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/sessions", "/api/guest", "/api/sessions"]);
  const [, init] = fetchMock.mock.calls[0];
  expect(init.headers).toEqual({ "content-type": "application/json" });
  expect(JSON.parse(init.body)).toEqual({ started_via: "typed" });
});

test("errors carry the status, code and retry_after_s from the spec body", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(429, { error: { code: "rate_limited", message: "slow", retry_after_s: 90 } })));
  const err = await createSession("typed").catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 429, code: "rate_limited", retryAfterS: 90 });
});

test("turn streams deltas and resolves on done", async () => {
  const body = 'event: text\ndata: {"delta": "Mình "}\n\nevent: text\ndata: {"delta": "đọc"}\n\nevent: done\ndata: {"turn_id": "t9", "stop_reason": "end_turn"}\n\n';
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
  const deltas: string[] = [];
  const result = await turn("s1", { role: "user", content: "hi" }, (d) => deltas.push(d));
  expect(deltas.join("")).toBe("Mình đọc");
  expect(result).toEqual({ turnId: "t9", stopReason: "end_turn" });
});

test("turn posts only the new message", async () => {
  const done = 'event: done\ndata: {"turn_id": "t1", "stop_reason": "end_turn"}\n\n';
  const fetchMock = vi.fn().mockResolvedValue(new Response(done, { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  await turn("s1", { role: "user", content: "hi" }, () => {});
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/sessions/s1/turns");
  expect(Object.keys(JSON.parse(init.body))).toEqual(["message"]);
  expect(JSON.parse(init.body).message).toEqual({ role: "user", content: "hi" });
});

test("currentSession is null on 204 and maps session_id on 200", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await currentSession()).toBeNull();
  expect(fetchMock).toHaveBeenCalledWith("/api/sessions/current");

  const messages = [{ role: "user", content: "hi" }];
  fetchMock.mockResolvedValueOnce(json(200, { session_id: "s1", messages, html: "<p>x</p>" }));
  expect(await currentSession()).toEqual({ sessionId: "s1", messages, html: "<p>x</p>", workspaces: {}, phase: null });
});

test("a 401 no_guest on currentSession creates the guest once and retries", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(json(401, { error: { code: "no_guest", message: "no guest" } }))
    .mockResolvedValueOnce(json(200, { guest_id: "g1", created: true }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await currentSession()).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/sessions/current", "/api/guest", "/api/sessions/current"]);
});

test("endSession is sent with keepalive so a reload cannot cancel it", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
  await endSession("s1", "new_problem");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/sessions/s1/end");
  expect(init.keepalive).toBe(true);
  expect(JSON.parse(init.body)).toEqual({ reason: "new_problem" });
});

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const doc = { version: 1, phase: "learn", title: "T", blocks: [], sources: [] };

test("turn relays every new event in order", async () => {
  const body =
    sse("announce", { text: "hi" }) +
    sse("status", { stage: "planning", label: "L", phase: "learn" }) +
    sse("workspace", { workspace_id: "w1", phase: "learn", doc }) +
    sse("text", { delta: "x" }) +
    sse("phase", { phase: "solve" }) +
    sse("line_state", { workspace_id: "w1", block_id: "b1", line: 2, state: "review" }) +
    sse("task_done", { workspace_id: "w1", block_id: "b1" }) +
    sse("done", { turn_id: "t1", stop_reason: "end_turn" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
  const events: TurnEvent[] = [];
  const deltas: string[] = [];
  await turn("s1", { role: "user", content: "hi" }, (d) => deltas.push(d), (e) => events.push(e));
  expect(deltas).toEqual(["x"]);
  expect(events).toEqual([
    { event: "announce", text: "hi" },
    { event: "status", stage: "planning", label: "L", phase: "learn" },
    { event: "workspace", workspaceId: "w1", phase: "learn", doc },
    { event: "phase", phase: "solve" },
    { event: "line_state", workspaceId: "w1", blockId: "b1", line: 2, state: "review" },
    { event: "task_done", workspaceId: "w1", blockId: "b1" },
  ]);
});

test("unknown events are ignored", async () => {
  const body = sse("mystery", { a: 1 }) + sse("done", { turn_id: "t1", stop_reason: null });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
  const events: TurnEvent[] = [];
  await turn("s1", { role: "user", content: "hi" }, () => {}, (e) => events.push(e));
  expect(events).toEqual([]);
});

test("currentSession maps workspaces", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      json(200, { session_id: "s1", messages: [], html: null, workspaces: { learn: { workspace_id: "w1", doc } }, phase: "learn" }),
    ),
  );
  expect(await currentSession()).toEqual({
    sessionId: "s1",
    messages: [],
    html: null,
    workspaces: { learn: { id: "w1", doc } },
    phase: "learn",
  });
});

test("check posts snake_case and returns CheckResponse", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: true, state: "ok", done: false }));
  vi.stubGlobal("fetch", fetchMock);
  const res = await check("s1", { workspaceId: "w1", blockId: "b1", answer: "2x", previous: ["x"] });
  expect(res).toEqual({ ok: true, state: "ok", done: false });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/sessions/s1/check");
  expect(JSON.parse(init.body)).toEqual({ workspace_id: "w1", block_id: "b1", answer: "2x", previous: ["x"] });
});

test("check throws ApiError on 429", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(429, { error: { code: "rate_limited", message: "slow" } })));
  const err = await check("s1", { workspaceId: "w", blockId: "b", answer: "a", previous: [] }).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(429);
});
