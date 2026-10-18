import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { customFrames } from "@/lib/frame";
import { ApiError, TurnError, type TurnEvent } from "@/lib/api";
import { copy } from "@/lib/copy";
import { createWorkspace } from "@/hooks/useWorkspace";
import { fixtures } from "@/workspace/fixtures";
import type { Phase, Workspace } from "@/workspace/types";

const HTML_REPLY = "Mình đọc đề là: x.\n```html\n<p>x</p>\n```";
const DONE = { turnId: "t", stopReason: "end_turn" };

type Turn = (
  sessionId: string,
  message: unknown,
  onDelta: (t: string) => void,
  onEvent?: (e: TurnEvent) => void,
) => Promise<typeof DONE>;
const reply =
  (text: string): Turn =>
  async (_s, _m, onDelta) => {
    onDelta(text);
    return DONE;
  };

type Current = {
  sessionId: string;
  messages: unknown[];
  html: string | null;
  workspaces: Partial<Record<Phase, Workspace>>;
  phase: Phase | null;
};

// `current` is what GET /api/sessions/current returns: a session, null (204), an Error (network failure),
// or a promise to settle it later.
type CurrentArg = Current | Error | null | Promise<Current | null>;
function setup(turn: Turn = reply(HTML_REPLY), current: CurrentArg = null) {
  let session = 0;
  const api = {
    createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: true }),
    currentSession: vi.fn(async () => {
      if (current instanceof Error) throw current;
      return current;
    }),
    createSession: vi.fn(async () => ({ sessionId: `s${++session}` })),
    endSession: vi.fn().mockResolvedValue(undefined),
    turn: vi.fn(turn),
  };
  const track = vi.fn();
  const focus = vi.fn();
  const readPhoto = vi.fn().mockResolvedValue({ data: "PHOTO", bytes: 9, width: 4, height: 3, processMs: 2 });
  let clock = 1000;
  const make = () => {
    const ws = createWorkspace({
      api: api as never,
      track: track as never,
      readPhoto,
      now: () => (clock += 100),
    });
    ws.bind({ frameWindow: () => window, focusInput: focus });
    const detach = ws.attach();
    ws.init();
    return { ws, detach };
  };
  const { ws, detach } = make();
  return { ws, api, track, focus, readPhoto, make, detach, state: () => ws.getState() };
}

const post = (event: Record<string, unknown>, source: unknown = window) =>
  window.dispatchEvent(new MessageEvent("message", { data: { dfriend: true, event }, source: source as Window }));
const click = (gesture: number, type = "answer_submitted") => post({ type, data: null, byStudent: true, gesture });
const lastCall = (api: ReturnType<typeof setup>["api"]) => api.turn.mock.calls.at(-1)!;
const lastContent = (api: ReturnType<typeof setup>["api"]) => (lastCall(api)[1] as { content: unknown }).content;

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  vi.useRealTimers();
});
// init() is async now (guest, then the server's current session), so wait for it to settle.
const boot = async (turn?: Turn, current?: CurrentArg) => {
  const t = setup(turn, current);
  cleanup.push(t.detach);
  await vi.advanceTimersByTimeAsync(0);
  return t;
};

describe("typed turn", () => {
  it("shows the student bubble and thinking, streams the chat, then the building text", async () => {
    const seen: string[] = [];
    const t = await boot(async (_s, _m, onDelta) => {
      seen.push(t.state().bubbles.map((b) => b.text).join("|"));
      onDelta("Mình đọc đề");
      seen.push(t.state().bubbles.at(-1)!.text);
      onDelta(" là: x.\n```html\n<p>");
      seen.push(`${t.state().bubbles.at(-1)!.text}/${t.state().building}`);
      onDelta("x</p>\n```");
      return DONE;
    });
    t.ws.actions.setInput("tìm x");
    await t.ws.actions.submit();
    expect(seen).toEqual([
      `tìm x|${copy.thinking}`,
      "Mình đọc đề",
      "Mình đọc đề là: x./true",
    ]);
    const s = t.state();
    expect(s.building).toBe(false);
    expect(s.html).toBe("<p>x</p>");
    expect(s.bubbles.map((b) => b.kind)).toEqual(["student", "agent"]);
  });

  it("keeps the bubble waiting while a block-only reply builds, then says built", async () => {
    const texts: string[] = [];
    const t = await boot(async (_s, _m, onDelta) => {
      onDelta("```html\n<p>x");
      texts.push(t.state().bubbles.at(-1)!.text);
      onDelta("</p>\n```");
      return DONE;
    });
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(texts).toEqual([copy.thinking]);
    expect(t.state().bubbles.at(-1)!.text).toBe(copy.built);
  });
});

describe("workspace turn", () => {
  async function withWorkspace(turn: Turn = reply(HTML_REPLY)) {
    const t = await boot(turn);
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    return t;
  }

  it("shows no bubble, and [silent] is stored without one", async () => {
    const t = await withWorkspace();
    t.api.turn.mockImplementation(reply("[silent]"));
    const before = t.state().bubbles.length;
    click(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(String(lastContent(t.api))).toMatch(/^\[workspace\] /);
    expect(t.state().bubbles).toHaveLength(before);
    // The [silent] reply is kept in memory as a message, so it counts as a turn of the session.
    t.ws.actions.newProblem();
    expect(t.track).toHaveBeenCalledWith("new_problem_clicked", { turns_in_session: 2 }, "s1");
  });

  it("custom iframe events reach pending", async () => {
    const t = await withWorkspace();
    t.api.turn.mockClear();
    const win = {} as Window;
    post({ type: "answer_submitted", byStudent: true, gesture: 5 }, win);
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.api.turn).not.toHaveBeenCalled();
    customFrames.add(win);
    post({ type: "answer_submitted", byStudent: true, gesture: 5 }, win);
    await vi.advanceTimersByTimeAsync(800);
    expect(t.api.turn).toHaveBeenCalled();
    customFrames.delete(win);
  });

  it("starts only from the iframe, only on a student gesture, flushed 800 ms after the first event", async () => {
    const t = await withWorkspace();
    t.api.turn.mockClear();
    post({ type: "a", byStudent: true, gesture: 1 }, {}); // wrong source
    window.dispatchEvent(new MessageEvent("message", { data: { event: { type: "a" } }, source: window }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.api.turn).not.toHaveBeenCalled();

    post({ type: "tick", byStudent: false }); // not a trigger on its own
    await vi.advanceTimersByTimeAsync(800);
    expect(t.api.turn).not.toHaveBeenCalled();

    click(10);
    await vi.advanceTimersByTimeAsync(799);
    expect(t.api.turn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.api.turn).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(lastContent(t.api)).slice("[workspace] ".length));
    expect(sent.map((e: { type: string }) => e.type)).toEqual(["tick", "answer_submitted"]);
  });

  it("keeps at most 20 events", async () => {
    const t = await withWorkspace();
    t.api.turn.mockClear();
    for (let i = 0; i < 25; i++) post({ type: `e${i}`, byStudent: false });
    click(20);
    await vi.advanceTimersByTimeAsync(800);
    const sent = JSON.parse(String(lastContent(t.api)).slice("[workspace] ".length));
    expect(sent).toHaveLength(20);
    expect(sent.at(-1).type).toBe("answer_submitted");
  });

  it("one gesture starts one turn", async () => {
    const t = await withWorkspace();
    t.api.turn.mockClear();
    click(5);
    await vi.advanceTimersByTimeAsync(800);
    click(5); // same gesture again
    await vi.advanceTimersByTimeAsync(800);
    expect(t.api.turn).toHaveBeenCalledTimes(1);
    click(6);
    await vi.advanceTimersByTimeAsync(800);
    expect(t.api.turn).toHaveBeenCalledTimes(2);
  });

  it("queues one typed message behind a workspace turn and sends it when the turn ends", async () => {
    const t = await withWorkspace();
    const gate = deferred();
    t.api.turn.mockClear();
    t.api.turn.mockImplementationOnce(async () => {
      await gate.promise;
      return DONE;
    });
    click(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(t.state().busy).toBe(true);
    expect(t.state().typedTurn).toBe(false);

    t.ws.actions.setInput("câu hỏi");
    await t.ws.actions.submit();
    expect(t.state().queued).toBe(true);
    expect(t.state().sendDisabled).toBe(true);
    expect(t.state().bubbles.at(-1)).toMatchObject({ kind: "student", text: "câu hỏi" });
    expect(t.track).toHaveBeenCalledWith("message_sent", expect.objectContaining({ queued: true }), "s1");

    // A second message while one is queued is ignored.
    t.ws.actions.setInput("khác");
    await t.ws.actions.submit();
    expect(t.api.turn).toHaveBeenCalledTimes(1);

    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.api.turn).toHaveBeenCalledTimes(2);
    expect(lastContent(t.api)).toBe("câu hỏi");
    expect(t.state().queued).toBe(false);
  });

  it("shows a note, not an error bubble, when a workspace turn fails", async () => {
    const t = await withWorkspace();
    t.api.turn.mockRejectedValueOnce(new TurnError("upstream", "boom"));
    click(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(t.state().bubbles.at(-1)).toEqual(expect.objectContaining({ kind: "note", text: copy.errConnect("boom") }));
    expect(t.state().hasMessages).toBe(true);
    // The failed user message was popped: one turn (two messages) remains.
    t.ws.actions.newProblem();
    expect(t.track).toHaveBeenCalledWith("new_problem_clicked", { turns_in_session: 1 }, "s1");
  });
});

describe("failure of a typed turn", () => {
  it("pops the message, removes the bubbles, restores text, photo and events", async () => {
    const t = await boot(reply(HTML_REPLY));
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    await t.ws.actions.pickPhoto(new Blob(["x"]), "composer_button");
    t.ws.actions.setInput("câu hỏi");
    post({ type: "tick", byStudent: false }); // a pending event with its flush timer
    t.api.turn.mockRejectedValueOnce(new TurnError("upstream", "boom"));

    await t.ws.actions.submit();
    const s = t.state();
    expect(s.bubbles.slice(2)).toEqual([expect.objectContaining({ kind: "error", text: copy.errConnect("boom") })]);
    expect(s.input).toBe("câu hỏi");
    expect(s.photo).toBe("PHOTO");
    expect(s.hasMessages).toBe(true);

    // The stale timer must not fire the restored events alone.
    t.api.turn.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.api.turn).not.toHaveBeenCalled();

    // Resend: the events ride along with the typed text.
    t.api.turn.mockImplementation(reply("ok"));
    await t.ws.actions.submit();
    const content = lastContent(t.api) as [{ type: string }, { text: string }];
    expect(content[1].text).toMatch(/^\[workspace\] [\s\S]*"tick"[\s\S]*\n\ncâu hỏi$/);
  });

  it.each([
    ["413", new ApiError(413, "too_large", "x"), copy.errTooLong, { status: 413, code: "too_large" }],
    ["429 minutes round up", new ApiError(429, "rate_limited", "x", 61), copy.errRateLimited(2), { status: 429, code: "rate_limited" }],
    ["429 at least a minute", new ApiError(429, "rate_limited", "x", 1), copy.errRateLimited(1), { status: 429, code: "rate_limited" }],
    ["503", new ApiError(503, "budget_exhausted", "x"), copy.errBudget, { status: 503, code: "budget_exhausted" }],
    ["409", new ApiError(409, "session_ended", "x"), copy.errEnded, { status: 409, code: "session_ended" }],
    ["stream code", new TurnError("model_refusal", "declined"), copy.errConnect("declined"), { code: "model_refusal" }],
    ["network", new TypeError("Failed to fetch"), copy.errConnect("Failed to fetch"), { code: "network" }],
  ])("maps %s to its copy and tracks turn_failed", async (_name, error, text, props) => {
    const t = await boot(async () => {
      throw error;
    });
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.state().bubbles.at(-1)).toEqual(expect.objectContaining({ kind: "error", text }));
    expect(t.track).toHaveBeenCalledWith("turn_failed", props, expect.anything());
  });
});

describe("focusInput", () => {
  it("a successful typed turn asks for focus without revealing", async () => {
    const t = await boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.focus).toHaveBeenCalledTimes(1);
    expect(t.focus.mock.calls[0][0]).toBeFalsy();
  });

  it("a failed typed turn reveals the composer", async () => {
    const t = await boot();
    t.api.turn.mockRejectedValueOnce(new TurnError("upstream", "boom"));
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.focus).toHaveBeenLastCalledWith(true);
  });

  it("Sửa lại đề and Gõ đề bài reveal; removing the photo does not", async () => {
    const t = await boot();
    t.ws.actions.correctRestate();
    expect(t.focus).toHaveBeenLastCalledWith(true);
    t.focus.mockClear();
    t.ws.actions.typeProblemClicked();
    expect(t.focus).toHaveBeenLastCalledWith(true);
    t.focus.mockClear();
    t.ws.actions.removePhoto();
    expect(t.focus.mock.calls[0][0]).toBeFalsy();
  });
});

describe("session lifecycle", () => {
  it("creates a session once, with started_via from photo, starter or typed", async () => {
    const t = await boot();
    await t.ws.actions.pickPhoto(new Blob(["x"]), "snap_button");
    await t.ws.actions.submit();
    expect(t.api.createSession).toHaveBeenLastCalledWith("photo");
    t.ws.actions.setInput("again");
    await t.ws.actions.submit();
    expect(t.api.createSession).toHaveBeenCalledTimes(1);
    expect(t.api.turn.mock.calls.map((c) => c[0])).toEqual(["s1", "s1"]);

    t.ws.actions.newProblem();
    await t.ws.actions.startStarter("geometry");
    expect(t.api.createSession).toHaveBeenLastCalledWith("starter_geometry");
    t.ws.actions.newProblem();
    t.ws.actions.setInput("typed");
    await t.ws.actions.submit();
    expect(t.api.createSession).toHaveBeenLastCalledWith("typed");
  });

  it("Bài mới bumps newProblemCount only when it resets; it is ignored while a turn runs", async () => {
    const gate = deferred();
    const t = await boot(async () => {
      await gate.promise;
      return DONE;
    });
    expect(t.state().newProblemCount).toBe(0);
    t.ws.actions.setInput("x");
    const sending = t.ws.actions.submit();
    t.ws.actions.newProblem(); // busy: no reset
    expect(t.state().newProblemCount).toBe(0);
    gate.resolve();
    await sending;
    t.ws.actions.newProblem();
    expect(t.state().newProblemCount).toBe(1);
  });

  it("Bài mới ends the session and resets, and nothing is kept in localStorage", async () => {
    const t = await boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    t.ws.actions.newProblem();
    expect(t.api.endSession).toHaveBeenCalledWith("s1", "new_problem");
    expect(localStorage.length).toBe(0);
    expect(t.state()).toMatchObject({ bubbles: [], html: null, hasMessages: false, screen: "empty" });
    expect(t.track).toHaveBeenCalledWith("new_problem_clicked", { turns_in_session: 1 }, "s1");
  });

  it("on 409 session_ended it opens a new session and the resend uses it", async () => {
    const t = await boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    t.api.turn.mockRejectedValueOnce(new ApiError(409, "session_ended", "x"));
    t.ws.actions.setInput("y");
    await t.ws.actions.submit();
    expect(t.api.createSession).toHaveBeenCalledTimes(2);
    expect(t.state().bubbles.at(-1)).toMatchObject({ kind: "error", text: copy.errEnded });
    await t.ws.actions.submit();
    expect(lastCall(t.api)[0]).toBe("s2");
  });
});

describe("restore from the server", () => {
  const photoMessage = {
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "PHOTO" } },
      { type: "text", text: "ghi chú" },
    ],
  };
  const SERVER_SESSION: Current = {
    sessionId: "srv1",
    messages: [
      photoMessage,
      { role: "assistant", content: HTML_REPLY },
      { role: "user", content: '[workspace] [{"type":"answer_submitted"}]' },
      { role: "assistant", content: "[silent]" },
    ],
    html: "<p>x</p>",
    workspaces: {},
    phase: null,
  };

  it("restores bubbles and the workspace html from currentSession on init", async () => {
    const t = await boot(undefined, SERVER_SESSION);
    const s = t.state();
    expect(t.api.currentSession).toHaveBeenCalledTimes(1);
    expect(s.ready).toBe(true);
    expect(s.bubbles.map((b) => b.kind)).toEqual(["student", "agent"]);
    expect(s.bubbles[0]).toMatchObject({ text: "ghi chú", photo: "PHOTO" });
    expect(s.html).toBe("<p>x</p>");
    expect(s.screen).toBe("workspace");
    expect(s.hasMessages).toBe(true);
    expect(t.track).toHaveBeenCalledWith("session_restored", { messages: 4, has_workspace: true });
    expect(s.restateChips).toBe(false);
  });

  it("continues the restored session: the next turn uses its id and creates no session", async () => {
    const t = await boot(reply("ok"), SERVER_SESSION);
    t.ws.actions.setInput("tiếp");
    await t.ws.actions.submit();
    expect(t.api.createSession).not.toHaveBeenCalled();
    expect(lastCall(t.api)[0]).toBe("srv1");
    expect(lastCall(t.api)[1]).toEqual({ role: "user", content: "tiếp" });
  });

  it("starts empty when currentSession returns nothing, after the guest call", async () => {
    const t = await boot();
    expect(t.state()).toMatchObject({ ready: true, screen: "empty", bubbles: [] });
    expect(t.api.createGuest).toHaveBeenCalledTimes(1);
    expect(t.api.createGuest.mock.invocationCallOrder[0]).toBeLessThan(t.api.currentSession.mock.invocationCallOrder[0]);
    expect(t.track).toHaveBeenCalledWith("empty_state_shown", {}, null);
  });

  it("starts empty when currentSession fails", async () => {
    const t = await boot(undefined, new TypeError("Failed to fetch"));
    expect(t.state()).toMatchObject({ ready: true, screen: "empty", bubbles: [], html: null });
    expect(t.track).toHaveBeenCalledWith("app_opened", expect.objectContaining({ restored: false }));
    expect(t.track).not.toHaveBeenCalledWith("session_restored", expect.anything());
  });

  it("app_opened.restored is true only when currentSession returned a session", async () => {
    const restored = await boot(undefined, SERVER_SESSION);
    expect(restored.track).toHaveBeenCalledWith(
      "app_opened",
      expect.objectContaining({ restored: true, viewport_w: expect.any(Number) }),
    );
    const empty = await boot();
    expect(empty.track).toHaveBeenCalledWith("app_opened", expect.objectContaining({ restored: false }));
  });

  it("a late currentSession does not clobber a turn that is already in flight", async () => {
    let resolveCurrent!: (c: Current) => void;
    const current = new Promise<Current | null>((res) => (resolveCurrent = res));
    const gate = deferred();
    const t = await boot(async (_s, _m, onDelta) => {
      await gate.promise;
      onDelta(HTML_REPLY);
      return DONE;
    }, current);
    expect(t.state().ready).toBe(false);

    // The student types while the restore request is still pending.
    t.ws.actions.setInput("x");
    const sent = t.ws.actions.submit();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.state().busy).toBe(true);

    resolveCurrent(SERVER_SESSION);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.state().ready).toBe(true);
    expect(t.state().bubbles.map((b) => b.kind)).toEqual(["student", "agent"]);
    expect(t.state().bubbles[0]).toMatchObject({ text: "x" });
    expect(t.state().html).toBeNull();

    gate.resolve();
    await sent;
    expect(t.api.turn.mock.calls.map((c) => c[0])).toEqual(["s1"]);
    expect(t.state().bubbles.map((b) => b.kind)).toEqual(["student", "agent"]);
    expect(t.state().html).toBe("<p>x</p>");
    t.ws.actions.newProblem();
    expect(t.track).toHaveBeenCalledWith("new_problem_clicked", { turns_in_session: 1 }, "s1");
    expect(t.track).toHaveBeenCalledWith("app_opened", expect.objectContaining({ restored: false }));
    expect(t.track).not.toHaveBeenCalledWith("session_restored", expect.anything());
  });

  it("after a history_conflict TurnError it reloads history from currentSession", async () => {
    const t = await boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.api.currentSession).toHaveBeenCalledTimes(1);

    // Another tab added a turn: the server's history now has four messages.
    t.api.currentSession.mockResolvedValueOnce(SERVER_SESSION as never);
    t.api.turn.mockRejectedValueOnce(new TurnError("history_conflict", "history changed"));
    t.ws.actions.setInput("y");
    await t.ws.actions.submit();

    expect(t.api.currentSession).toHaveBeenCalledTimes(2);
    const s = t.state();
    expect(s.bubbles.map((b) => b.kind)).toEqual(["student", "agent", "error"]);
    expect(s.bubbles[0]).toMatchObject({ text: "ghi chú", photo: "PHOTO" });
    expect(s.bubbles.at(-1)).toMatchObject({ kind: "error", text: copy.errConnect("history changed") });
    expect(s.input).toBe("y"); // the failed text is still there to resend
    expect(s.html).toBe("<p>x</p>");

    // The resend goes to the restored session.
    t.api.turn.mockImplementation(reply("ok"));
    await t.ws.actions.submit();
    expect(lastCall(t.api)[0]).toBe("srv1");
    expect(lastCall(t.api)[1]).toEqual({ role: "user", content: "y" });
  });
});

describe("chips", () => {
  it("restate chips show on the last agent bubble until something happens", async () => {
    const t = await boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.state().restateChips).toBe(true);
    t.ws.actions.confirmRestate();
    expect(t.state().restateChips).toBe(false);
    expect(t.track).toHaveBeenCalledWith("restate_confirmed", {}, "s1");
    expect(t.api.turn).toHaveBeenCalledTimes(1); // "Đúng đề" sends no turn
  });

  it("a workspace event hides them, and 'Sửa lại đề' prefills the composer", async () => {
    const t = await boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    post({ type: "tick", byStudent: false });
    expect(t.state().restateChips).toBe(false);

    const u = await boot();
    u.ws.actions.setInput("x");
    await u.ws.actions.submit();
    u.ws.actions.correctRestate();
    expect(u.state().input).toBe("Đề đúng là: ");
    expect(u.state().restateChips).toBe(false);
    expect(u.track).toHaveBeenCalledWith("restate_corrected", {}, "s1");
  });

  it("offer chips: yes sends a typed turn, later only hides; both are tracked", async () => {
    const t = await boot(reply("[offer] Có một bài tương tự."));
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.state().offerChips).toBe(true);
    expect(t.state().bubbles.at(-1)).toMatchObject({ offer: true });

    await t.ws.actions.answerOffer(true);
    expect(lastContent(t.api)).toBe(copy.offerYesMessage);
    expect(t.track).toHaveBeenCalledWith("similar_offer_answered", { accepted: true }, "s1");

    const u = await boot(reply("[offer] Có một bài tương tự."));
    u.ws.actions.setInput("x");
    await u.ws.actions.submit();
    await u.ws.actions.answerOffer(false);
    expect(u.state().offerChips).toBe(false);
    expect(u.api.turn).toHaveBeenCalledTimes(1);
    expect(u.track).toHaveBeenCalledWith("similar_offer_answered", { accepted: false }, "s1");
  });
});

describe("tracking", () => {
  it("fires the catalog events at their moments", async () => {
    const t = await boot();
    t.ws.actions.typeProblemClicked();
    await t.ws.actions.pickPhoto(new Blob(["x"]), "snap_button");
    t.ws.actions.retake();
    t.ws.actions.removePhoto();
    t.readPhoto.mockRejectedValueOnce(new Error("bad"));
    await t.ws.actions.pickPhoto(new Blob(["x"]), "composer_button");
    expect(t.state().bubbles.at(-1)).toMatchObject({ kind: "note", text: copy.photoUnreadable });

    t.ws.actions.setInput("abc");
    post({ type: "tick", byStudent: false });
    await t.ws.actions.submit();
    t.api.turn.mockImplementation(reply("```html\n<p>y</p>\n```"));
    t.ws.actions.setInput("again");
    await t.ws.actions.submit();
    document.dispatchEvent(new Event("visibilitychange"));

    const calls = t.track.mock.calls;
    const find = (type: string) => calls.filter((c) => c[0] === type).map((c) => c[1]);
    expect(find("type_problem_clicked")).toHaveLength(1);
    expect(find("photo_picked")[0]).toEqual({ source: "snap_button", bytes: 9, width: 4, height: 3, process_ms: 2 });
    expect(find("photo_retake_clicked")).toHaveLength(1);
    expect(find("photo_removed")).toHaveLength(1);
    expect(find("photo_unreadable")).toHaveLength(1);
    expect(find("message_sent")[0]).toEqual({
      has_photo: false,
      has_text: true,
      text_len: 3,
      had_events: true,
      queued: false,
    });
    const shown = find("workspace_shown") as { ms_since_send: number; replaced: boolean }[];
    expect(shown.map((s) => s.replaced)).toEqual([false, true]);
    expect(shown.every((s) => s.ms_since_send > 0)).toBe(true);
    expect(find("visibility_changed")).toEqual([{ visible: expect.any(Boolean) }]);
  });

  it("chatOpened tracks chat_opened with the unread flag and the session id", async () => {
    const t = await boot();
    t.ws.actions.chatOpened(true);
    expect(t.track).toHaveBeenCalledWith("chat_opened", { unread: true }, null);
  });

  it("tracks the watching cue when it goes from hidden to shown", async () => {
    const t = await boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.track).not.toHaveBeenCalledWith("watching_cue_shown", expect.anything(), expect.anything());
    t.api.turn.mockImplementation(reply("[silent]"));
    click(1);
    await vi.advanceTimersByTimeAsync(800);
    expect(t.state().watching).toBe(true);
    expect(t.track.mock.calls.filter((c) => c[0] === "watching_cue_shown")).toHaveLength(1);
  });
});

describe("structured workspace", () => {
  const SOLVE = fixtures["solve-tangent.json"]; // blocks p1, s1
  const LEARN = fixtures["learn-derivative.json"];
  const shown = (id: string, doc = SOLVE): TurnEvent => ({ event: "workspace", workspaceId: id, phase: doc.phase, doc });
  // Plays text deltas (strings) and events in order; `at` runs between items, for mid-turn checks.
  const stream =
    (items: (string | TurnEvent | (() => void))[]): Turn =>
    async (_s, _m, onDelta, onEvent) => {
      for (const i of items) {
        if (typeof i === "string") onDelta(i);
        else if (typeof i === "function") i();
        else onEvent!(i);
      }
      return DONE;
    };
  const typed = async (t: Awaited<ReturnType<typeof boot>>, text = "x") => {
    t.ws.actions.setInput(text);
    await t.ws.actions.submit();
  };
  const sentEvents = (api: ReturnType<typeof setup>["api"]) =>
    JSON.parse(String(lastContent(api)).slice("[workspace] ".length));

  it("announce becomes its own bubble before the reply", async () => {
    let mid: unknown;
    const t = await boot(
      stream([
        { event: "announce", text: "Ok, mình dựng phần lý thuyết nhé." },
        () => (mid = t.state().bubbles.map((b) => [b.kind, b.text, b.kind === "agent" && b.waiting])),
        shown("w1"),
        "Xong rồi.",
      ]),
    );
    await typed(t);
    expect(mid).toEqual([
      ["student", "x", false],
      ["agent", "Ok, mình dựng phần lý thuyết nhé.", false],
      ["agent", copy.thinking, true],
    ]);
    expect(t.state().bubbles.map((b) => [b.kind, b.text])).toEqual([
      ["student", "x"],
      ["agent", "Ok, mình dựng phần lý thuyết nhé."],
      ["agent", "Xong rồi."],
    ]);
  });

  it("a reply that repeats the announce is dropped, so the student reads it once", async () => {
    const t = await boot(
      stream([{ event: "announce", text: "Mình cùng gỡ ý tưởng chính nhé." }, shown("w1"), "Mình cùng gỡ ý tưởng chính nhé"]),
    );
    await typed(t);
    expect(t.state().bubbles.map((b) => [b.kind, b.text])).toEqual([
      ["student", "x"],
      ["agent", "Mình cùng gỡ ý tưởng chính nhé."],
    ]);
  });

  it("a photo's restatement in the announce carries the restate chips, with or without a reply", async () => {
    const restate = "Mình đọc đề là: tìm x.";
    const silent = await boot(stream([{ event: "announce", text: restate }, shown("w1"), "[silent]"]));
    await typed(silent);
    expect(silent.state().bubbles.map((b) => b.kind === "agent" && b.restate)).toEqual([false, true]);
    expect(silent.state().restateChips).toBe(true);

    const spoken = await boot(stream([{ event: "announce", text: restate }, shown("w1"), "Bạn tự làm trước nhé."]));
    await typed(spoken);
    expect(spoken.state().restateChips).toBe(true);
  });

  it("each turn stamps its bubbles, and a workspace-event reply is a new turn", async () => {
    const t = await boot(reply("Chào."));
    await typed(t);
    const first = t.state().bubbles.map((b) => b.turn);
    expect(new Set(first).size).toBe(1);
    await typed(t, "tiếp");
    const turns = t.state().bubbles.map((b) => b.turn);
    expect(turns[0]).toBe(turns[1]);
    expect(turns[2]).toBeGreaterThan(turns[1]);
    expect(turns[3]).toBe(turns[2]);
  });

  it("workspace event shows the view and clears building", async () => {
    const seen: unknown[] = [];
    const snap = () => {
      const s = t.state();
      seen.push({ screen: s.screen, building: s.building, status: s.status, phase: s.phase });
    };
    const t = await boot(
      stream([
        { event: "status", stage: "planning", phase: "solve" },
        snap,
        { event: "status", stage: "searching", label: "vi.wikipedia.org" },
        snap,
        shown("w1"),
        snap,
        "Xong.",
      ]),
    );
    await typed(t);
    expect(seen).toEqual([
      { screen: "building", building: true, status: copy.statusPlanning, phase: null },
      { screen: "building", building: true, status: copy.statusSearching, phase: null },
      { screen: "workspace", building: false, status: null, phase: "solve" },
    ]);
    expect(t.state().workspaces).toEqual({ solve: { id: "w1", doc: SOLVE } });
    expect(t.state().html).toBeNull();
    expect(t.track).toHaveBeenCalledWith("workspace_shown", { ms_since_send: expect.any(Number), replaced: false }, "s1");
  });

  it("rebuild replaces one phase only", async () => {
    const t = await boot(
      stream([
        shown("L1", LEARN),
        shown("S1"),
        { event: "line_state", workspaceId: "S1", blockId: "s1", line: 1, state: "review" },
        { event: "task_done", workspaceId: "S1", blockId: "s1" },
        { event: "line_state", workspaceId: "L1", blockId: "q1", line: 1, state: "ok" },
        { event: "task_done", workspaceId: "L1", blockId: "q1" },
        "ok",
      ]),
    );
    await typed(t);
    expect(t.state().overrides).toEqual({ S1: { s1: { 1: "review" } }, L1: { q1: { 1: "ok" } } });
    expect(t.state().taskDone).toEqual({ S1: ["s1"], L1: ["q1"] });

    t.api.turn.mockImplementation(stream([shown("S2"), { event: "phase", phase: "learn" }, "ok"]));
    await typed(t, "dựng lại");
    const s = t.state();
    expect(s.workspaces.learn?.id).toBe("L1");
    expect(s.workspaces.solve?.id).toBe("S2");
    expect(s.phase).toBe("learn");
    // Only the replaced workspace's entries go.
    expect(s.overrides).toEqual({ L1: { q1: { 1: "ok" } } });
    expect(s.taskDone).toEqual({ L1: ["q1"] });
    expect(t.track).toHaveBeenLastCalledWith("workspace_shown", expect.objectContaining({ replaced: true }), "s1");
  });

  it("replacing a phase doc drops pending events about blocks only the old doc had", async () => {
    const t = await boot(stream([shown("S1"), "ok"]));
    await typed(t);
    const lineChecked = { block_id: "s1", line: 1, text: "a", ok: true, state: "ok", retried: false };
    const without = { ...SOLVE, blocks: SOLVE.blocks.filter((b) => b.id !== "s1") };
    t.api.turn.mockImplementationOnce(
      stream([
        () => t.ws.actions.report("line_checked", lineChecked), // queued while the rebuild streams
        () => t.ws.actions.report("phase_viewed", { phase: "solve" }),
        shown("S2", without),
        "ok",
      ]),
    );
    t.api.turn.mockImplementation(stream([]));
    await typed(t, "dựng lại");
    await vi.advanceTimersByTimeAsync(0); // the leftover phase_viewed starts a workspace turn
    const sent = String(lastContent(t.api));
    expect(sent).toContain("phase_viewed");
    expect(sent).not.toContain("line_checked");
  });

  it("report flushes as a workspace turn after 800ms", async () => {
    const t = await boot(stream([shown("w1"), "Mình đọc đề là: x."]));
    await typed(t);
    expect(t.state().restateChips).toBe(true);
    t.api.turn.mockClear();
    t.api.turn.mockImplementation(stream([])); // code route: done with no text
    const data = { block_id: "s1", line: 1, text: "y' = 3x^2", ok: true, state: "ok", retried: false };
    t.ws.actions.report("line_checked", data);
    expect(t.state().restateChips).toBe(false);
    await vi.advanceTimersByTimeAsync(799);
    expect(t.api.turn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.api.turn).toHaveBeenCalledTimes(1);
    expect(sentEvents(t.api)).toEqual([{ type: "line_checked", data, byStudent: true, gesture: expect.any(Number) }]);
    // A code-routed turn has no reply: no bubble and no error.
    await vi.advanceTimersByTimeAsync(0);
    expect(t.state().bubbles.map((b) => b.kind)).toEqual(["student", "agent"]);
    expect(t.track).not.toHaveBeenCalledWith("turn_failed", expect.anything(), expect.anything());
  });

  it("task_completed via master is not student-triggered", async () => {
    const t = await boot(stream([shown("w1"), "ok"]));
    await typed(t);
    t.api.turn.mockClear();
    t.ws.actions.report("task_completed", { similar: false, helped: false, max_hint: 0, via: "master" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.api.turn).not.toHaveBeenCalled();
    t.ws.actions.report("help_requested", { block_id: "s1", level: 1 });
    await vi.advanceTimersByTimeAsync(800);
    expect(sentEvents(t.api).map((e: { type: string; byStudent: boolean; gesture?: number }) => [e.type, e.byStudent, e.gesture])).toEqual([
      ["task_completed", false, undefined],
      ["help_requested", true, expect.any(Number)],
    ]);
  });

  it("setPhase reports phase_viewed", async () => {
    const t = await boot(stream([shown("L1", LEARN), shown("S1"), "ok"]));
    await typed(t);
    t.api.turn.mockClear();
    t.ws.actions.setPhase("learn");
    expect(t.state().phase).toBe("learn");
    await vi.advanceTimersByTimeAsync(800);
    expect(sentEvents(t.api)).toEqual([expect.objectContaining({ type: "phase_viewed", data: { phase: "learn" }, byStudent: true })]);
  });

  it("check calls the api with the session and the workspace that holds the block", async () => {
    const t = await boot(stream([shown("L1", LEARN), shown("S1"), "ok"]));
    const check = vi.fn().mockResolvedValue({ ok: true, state: "ok", done: false });
    Object.assign(t.api, { check });
    await typed(t);
    await expect(t.ws.actions.check("S1", "s1", "y", ["a"])).resolves.toMatchObject({ ok: true });
    expect(check).toHaveBeenCalledWith("s1", { workspaceId: "S1", blockId: "s1", answer: "y", previous: ["a"] });
  });

  it("check binds to the given workspace even when another phase repeats the block id", async () => {
    const practice = { ...SOLVE, phase: "practice" as const };
    const t = await boot(stream([shown("S1"), shown("P1", practice), { event: "phase", phase: "solve" }, "ok"]));
    const check = vi.fn().mockResolvedValue({ ok: true, state: "ok", done: false });
    Object.assign(t.api, { check });
    await typed(t);
    await t.ws.actions.check("P1", "s1", "y", []);
    expect(check).toHaveBeenCalledWith("s1", expect.objectContaining({ workspaceId: "P1" }));
  });

  it("a new attempt at a line consumes the master's line_state override for it", async () => {
    const t = await boot(
      stream([
        shown("S1"),
        { event: "line_state", workspaceId: "S1", blockId: "s1", line: 1, state: "review" },
        { event: "line_state", workspaceId: "S1", blockId: "s1", line: 2, state: "review" },
        "ok",
      ]),
    );
    Object.assign(t.api, { check: vi.fn().mockResolvedValue({ ok: true, state: "ok", done: false }) });
    await typed(t);
    await t.ws.actions.check("S1", "s1", "y", []);
    expect(t.state().overrides).toEqual({ S1: { s1: { 2: "review" } } });
  });

  describe("verdict and checking", () => {
    const okCheck = { ok: true, state: "ok", done: false };

    it("checking counts checks in flight, and drops on resolve and on reject", async () => {
      const t = await boot(stream([shown("S1"), "ok"]));
      const d1 = deferred();
      const d2 = deferred();
      Object.assign(t.api, {
        check: vi
          .fn()
          .mockImplementationOnce(() => d1.promise.then(() => okCheck))
          .mockImplementationOnce(() => d2.promise.then(() => okCheck)),
      });
      await typed(t);
      expect(t.state().checking).toBe(0);
      const p1 = t.ws.actions.check("S1", "s1", "y", []);
      expect(t.state().checking).toBe(1);
      const p2 = t.ws.actions.check("S1", "s1", "y", []);
      expect(t.state().checking).toBe(2);
      d1.resolve();
      await p1;
      expect(t.state().checking).toBe(1);
      d2.reject(new Error("net"));
      await expect(p2).rejects.toThrow("net");
      expect(t.state().checking).toBe(0);
    });

    it("a resolved check sets the verdict and seq counts up", async () => {
      const t = await boot(stream([shown("S1"), "ok"]));
      Object.assign(t.api, { check: vi.fn().mockResolvedValue({ ok: false, state: "review", done: true }) });
      await typed(t);
      expect(t.state().verdict).toEqual({ seq: 0, state: null, done: false });
      await t.ws.actions.check("S1", "s1", "y", []);
      expect(t.state().verdict).toEqual({ seq: 1, state: "review", done: true });
      await t.ws.actions.check("S1", "s1", "y", []);
      expect(t.state().verdict.seq).toBe(2);
    });

    it("a rejected check leaves the verdict alone", async () => {
      const t = await boot(stream([shown("S1"), "ok"]));
      Object.assign(t.api, { check: vi.fn().mockRejectedValue(new Error("net")) });
      await typed(t);
      await expect(t.ws.actions.check("S1", "s1", "y", [])).rejects.toThrow("net");
      expect(t.state().verdict).toEqual({ seq: 0, state: null, done: false });
    });

    it("a line_state event during a turn bumps the verdict", async () => {
      const t = await boot(
        stream([shown("S1"), { event: "line_state", workspaceId: "S1", blockId: "s1", line: 1, state: "ok" }, "ok"]),
      );
      await typed(t);
      expect(t.state().verdict).toEqual({ seq: 1, state: "ok", done: false });
    });

    it("newProblem and a phase switch reset the state but keep counting seq", async () => {
      const t = await boot(
        stream([
          shown("L1", LEARN),
          shown("S1"),
          { event: "line_state", workspaceId: "S1", blockId: "s1", line: 1, state: "ok" },
          "ok",
        ]),
      );
      await typed(t);
      expect(t.state().verdict).toEqual({ seq: 1, state: "ok", done: false });
      t.ws.actions.setPhase("solve"); // already active: no change
      expect(t.state().verdict.state).toBe("ok");
      t.ws.actions.setPhase("learn");
      expect(t.state().verdict).toEqual({ seq: 1, state: null, done: false });
      Object.assign(t.api, { check: vi.fn().mockResolvedValue(okCheck) });
      await t.ws.actions.check("S1", "s1", "y", []);
      expect(t.state().verdict.seq).toBe(2);
      t.ws.actions.newProblem();
      expect(t.state().verdict).toEqual({ seq: 2, state: null, done: false });
    });
  });

  it("restore prefers workspaces over html", async () => {
    const t = await boot(undefined, {
      sessionId: "srv",
      messages: [
        { role: "user", content: "đề" },
        { role: "assistant", content: "Ok." },
      ],
      html: "<p>old</p>",
      workspaces: { solve: { id: "S1", doc: SOLVE } },
      phase: "solve",
    });
    const s = t.state();
    expect(s.html).toBeNull();
    expect(s.phase).toBe("solve");
    expect(s.workspaces.solve?.id).toBe("S1");
    expect(s.screen).toBe("workspace");
    expect(t.track).toHaveBeenCalledWith("session_restored", { messages: 2, has_workspace: true });
  });

  it("restore handles consecutive user messages", async () => {
    const t = await boot(undefined, {
      sessionId: "srv",
      messages: [
        { role: "user", content: "đề" },
        { role: "user", content: '[workspace] [{"type":"phase_viewed"}]\n\nGiúp mình' },
        { role: "assistant", content: "Ok, mình dựng nhé." },
        { role: "assistant", content: "[silent]" },
        { role: "user", content: '[workspace] [{"type":"line_checked"}]' },
      ],
      html: null,
      workspaces: { solve: { id: "S1", doc: SOLVE } },
      phase: "solve",
    });
    const s = t.state();
    expect(s.bubbles.map((b) => [b.kind, b.text])).toEqual([
      ["student", "đề"],
      ["student", "Giúp mình"],
      ["agent", "Ok, mình dựng nhé."],
    ]);
    // Workspace activity after a [silent]: the agent is still watching, and the chips are closed.
    expect(s.watching).toBe(true);
    expect(s.restateChips).toBe(false);
  });

  it("newProblem clears workspaces", async () => {
    const t = await boot(
      stream([
        shown("S1"),
        { event: "line_state", workspaceId: "S1", blockId: "s1", line: 1, state: "ok" },
        { event: "task_done", workspaceId: "S1", blockId: "s1" },
        "ok",
      ]),
    );
    await typed(t);
    t.ws.actions.newProblem();
    expect(t.state()).toMatchObject({
      workspaces: {},
      phase: null,
      overrides: {},
      taskDone: {},
      status: null,
      buildingPhase: null,
      screen: "empty",
    });
  });

  it("skeleton follows status phase", async () => {
    const seen: unknown[] = [];
    const snap = () => seen.push(t.state().buildingPhase);
    const t = await boot(stream([snap, { event: "status", stage: "planning", phase: "learn" }, snap, shown("L1", LEARN), snap, "ok"]));
    await typed(t);
    expect(seen).toEqual([null, "learn", null]);
  });

  it("failed build with no workspace offers retry", async () => {
    let mid: unknown;
    const t = await boot(
      stream([
        { event: "status", stage: "planning", phase: "solve" },
        { event: "status", stage: "failed" },
        () => (mid = { screen: t.state().screen, buildFailed: t.state().buildFailed }),
        "Mình chưa dựng được.",
      ]),
    );
    await typed(t);
    // No retry while the turn still streams: it would be a no-op.
    expect(mid).toEqual({ screen: "empty", buildFailed: false });
    expect(t.state()).toMatchObject({ screen: "empty", buildFailed: true, building: false, status: null });
    t.api.turn.mockImplementation(reply("ok"));
    await t.ws.actions.rebuild();
    expect(lastContent(t.api)).toBe(copy.rebuildMessage);
    expect(t.state().buildFailed).toBe(false);
  });

  it("phase is only set to a phase that has a doc", async () => {
    const t = await boot(stream([shown("S1"), { event: "phase", phase: "practice" }, "ok"]));
    await typed(t);
    expect(t.state().phase).toBe("solve");

    const r = await boot(undefined, {
      sessionId: "srv",
      messages: [{ role: "assistant", content: "Ok." }],
      html: null,
      workspaces: { solve: { id: "S1", doc: SOLVE } },
      phase: "learn",
    });
    expect(r.state().phase).toBe("solve");
  });

  it("history_conflict restore resets line states, completions and the failed build", async () => {
    const t = await boot(
      stream([
        shown("S1"),
        { event: "line_state", workspaceId: "S1", blockId: "s1", line: 1, state: "review" },
        { event: "task_done", workspaceId: "S1", blockId: "s1" },
        "ok",
      ]),
    );
    await typed(t);
    t.api.currentSession.mockResolvedValueOnce({
      sessionId: "srv",
      messages: [{ role: "user", content: "đề" }],
      html: null,
      workspaces: {},
      phase: null,
    } as never);
    t.api.turn.mockImplementationOnce(async (_s, _m, _d, onEvent) => {
      onEvent!({ event: "status", stage: "failed" });
      throw new TurnError("history_conflict", "history changed");
    });
    await typed(t, "y");
    expect(t.state()).toMatchObject({ overrides: {}, taskDone: {}, buildFailed: false, workspaces: {}, phase: null });
  });
});
