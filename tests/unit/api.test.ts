import { afterEach, expect, test, vi } from "vitest";
import { ApiError, createSession, currentSession, turn } from "@/lib/api";

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
  expect(await currentSession()).toEqual({ sessionId: "s1", messages, html: "<p>x</p>" });
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
