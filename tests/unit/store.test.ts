import { afterEach, expect, test, vi } from "vitest";
import type { Message } from "@/lib/api";
import { clearSession, loadSession, SESSION_KEY, saveSession } from "@/lib/store";

const user = { role: "user", content: "a" } as const;
const agent = { role: "assistant", content: "b" } as const;
const photo: Message = {
  role: "user",
  content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } }],
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

test("round-trips a session", () => {
  saveSession({ sessionId: "s1", messages: [user, agent, photo, agent], html: "<p>x</p>" });
  expect(loadSession()).toEqual({ sessionId: "s1", messages: [user, agent, photo, agent], html: "<p>x</p>" });
});

test("rejects corrupted JSON, wrong order, odd length and bad html or photo", () => {
  const cases = [
    "{not json",
    JSON.stringify({ messages: [agent, user], html: null, sessionId: null }),
    JSON.stringify({ messages: [user], html: null, sessionId: null }),
    JSON.stringify({ messages: [user, agent], html: 42, sessionId: null }),
    JSON.stringify({
      messages: [{ role: "user", content: [{ type: "image", source: { data: 5 } }] }, agent],
      html: null,
      sessionId: null,
    }),
  ];
  for (const raw of cases) {
    localStorage.setItem(SESSION_KEY, raw);
    expect(loadSession()).toBeNull();
  }
});

test("a full storage quota does not throw", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  expect(() => saveSession({ sessionId: null, messages: [user, agent], html: null })).not.toThrow();
  expect(() => clearSession()).not.toThrow();
});

test("loading removes the v2 session key", () => {
  localStorage.setItem("dfriend.session.v2", "{}");
  loadSession();
  expect(localStorage.getItem("dfriend.session.v2")).toBeNull();
});
