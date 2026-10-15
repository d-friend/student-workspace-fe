import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, TurnError } from "@/lib/api";
import { copy } from "@/lib/copy";
import { loadSession } from "@/lib/store";
import { createWorkspace } from "@/hooks/useWorkspace";

const HTML_REPLY = "Mình đọc đề là: x.\n```html\n<p>x</p>\n```";
const DONE = { turnId: "t", stopReason: "end_turn" };

type Turn = (sessionId: string, message: unknown, onDelta: (t: string) => void) => Promise<typeof DONE>;
const reply =
  (text: string): Turn =>
  async (_s, _m, onDelta) => {
    onDelta(text);
    return DONE;
  };

function setup(turn: Turn = reply(HTML_REPLY)) {
  let session = 0;
  const api = {
    createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: true }),
    createSession: vi.fn(async () => ({ sessionId: `s${++session}` })),
    endSession: vi.fn().mockResolvedValue(undefined),
    turn: vi.fn(turn),
  };
  const track = vi.fn();
  const readPhoto = vi.fn().mockResolvedValue({ data: "PHOTO", bytes: 9, width: 4, height: 3, processMs: 2 });
  let clock = 1000;
  const make = () => {
    const ws = createWorkspace({
      api: api as never,
      track: track as never,
      readPhoto,
      now: () => (clock += 100),
    });
    ws.bind({ frameWindow: () => window, focusInput: () => {} });
    const detach = ws.attach();
    ws.init();
    return { ws, detach };
  };
  const { ws, detach } = make();
  return { ws, api, track, readPhoto, make, detach, state: () => ws.getState() };
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
  localStorage.clear();
  vi.useRealTimers();
});
const boot = (turn?: Turn) => {
  const t = setup(turn);
  cleanup.push(t.detach);
  return t;
};

describe("typed turn", () => {
  it("shows the student bubble and thinking, streams the chat, then the building text", async () => {
    const seen: string[] = [];
    const t = boot(async (_s, _m, onDelta) => {
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

  it("shows building, then built, for a block-only reply", async () => {
    const texts: string[] = [];
    const t = boot(async (_s, _m, onDelta) => {
      onDelta("```html\n<p>x");
      texts.push(t.state().bubbles.at(-1)!.text);
      onDelta("</p>\n```");
      return DONE;
    });
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(texts).toEqual([copy.building]);
    expect(t.state().bubbles.at(-1)!.text).toBe(copy.built);
  });
});

describe("workspace turn", () => {
  async function withWorkspace(turn: Turn = reply(HTML_REPLY)) {
    const t = boot(turn);
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
    expect(loadSession()!.messages.at(-1)).toEqual({ role: "assistant", content: "[silent]" });
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
    expect(loadSession()!.messages).toHaveLength(2); // the failed user message was popped
  });
});

describe("failure of a typed turn", () => {
  it("pops the message, removes the bubbles, restores text, photo and events", async () => {
    const t = boot(reply(HTML_REPLY));
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
    const t = boot(async () => {
      throw error;
    });
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.state().bubbles.at(-1)).toEqual(expect.objectContaining({ kind: "error", text }));
    expect(t.track).toHaveBeenCalledWith("turn_failed", props, expect.anything());
  });
});

describe("session lifecycle", () => {
  it("creates a session once, with started_via from photo, starter or typed", async () => {
    const t = boot();
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

  it("Bài mới ends the session, clears the store and resets", async () => {
    const t = boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    t.ws.actions.newProblem();
    expect(t.api.endSession).toHaveBeenCalledWith("s1", "new_problem");
    expect(loadSession()).toBeNull();
    expect(t.state()).toMatchObject({ bubbles: [], html: null, hasMessages: false, screen: "empty" });
    expect(t.track).toHaveBeenCalledWith("new_problem_clicked", { turns_in_session: 1 }, "s1");
  });

  it("on 409 session_ended it opens a new session and the resend uses it", async () => {
    const t = boot();
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

describe("save and restore", () => {
  it("restores bubbles, photo and workspace on load, and tracks it", async () => {
    const t = boot();
    await t.ws.actions.pickPhoto(new Blob(["x"]), "snap_button");
    t.ws.actions.setInput("ghi chú");
    await t.ws.actions.submit();
    t.api.turn.mockImplementation(reply("[silent]"));
    click(1);
    await vi.advanceTimersByTimeAsync(800);

    const again = boot();
    const s = again.state();
    expect(s.bubbles.map((b) => b.kind)).toEqual(["student", "agent"]);
    expect(s.bubbles[0]).toMatchObject({ text: "ghi chú", photo: "PHOTO" });
    expect(s.html).toBe("<p>x</p>");
    expect(s.screen).toBe("workspace");
    await vi.advanceTimersByTimeAsync(0);
    expect(again.track).toHaveBeenCalledWith(
      "app_opened",
      expect.objectContaining({ restored: true, viewport_w: expect.any(Number) }),
    );
    expect(again.track).toHaveBeenCalledWith("session_restored", { messages: 4, has_workspace: true });
    // Nothing is sent with the stale session id until the server has seen it again.
    expect(again.state().restateChips).toBe(false);
  });

  it("starts empty when nothing is saved, after the guest call", async () => {
    const t = boot();
    expect(t.state()).toMatchObject({ ready: true, screen: "empty" });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.api.createGuest).toHaveBeenCalledTimes(1);
    expect(t.track).toHaveBeenCalledWith("empty_state_shown", {}, null);
    expect(t.track).toHaveBeenCalledWith("app_opened", expect.objectContaining({ restored: false }));
  });
});

describe("chips", () => {
  it("restate chips show on the last agent bubble until something happens", async () => {
    const t = boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.state().restateChips).toBe(true);
    t.ws.actions.confirmRestate();
    expect(t.state().restateChips).toBe(false);
    expect(t.track).toHaveBeenCalledWith("restate_confirmed", {}, "s1");
    expect(t.api.turn).toHaveBeenCalledTimes(1); // "Đúng đề" sends no turn
  });

  it("a workspace event hides them, and 'Sửa lại đề' prefills the composer", async () => {
    const t = boot();
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    post({ type: "tick", byStudent: false });
    expect(t.state().restateChips).toBe(false);

    const u = boot();
    u.ws.actions.setInput("x");
    await u.ws.actions.submit();
    u.ws.actions.correctRestate();
    expect(u.state().input).toBe("Đề đúng là: ");
    expect(u.state().restateChips).toBe(false);
    expect(u.track).toHaveBeenCalledWith("restate_corrected", {}, "s1");
  });

  it("offer chips: yes sends a typed turn, later only hides; both are tracked", async () => {
    const t = boot(reply("[offer] Có một bài tương tự."));
    t.ws.actions.setInput("x");
    await t.ws.actions.submit();
    expect(t.state().offerChips).toBe(true);
    expect(t.state().bubbles.at(-1)).toMatchObject({ offer: true });

    await t.ws.actions.answerOffer(true);
    expect(lastContent(t.api)).toBe(copy.offerYesMessage);
    expect(t.track).toHaveBeenCalledWith("similar_offer_answered", { accepted: true }, "s1");

    const u = boot(reply("[offer] Có một bài tương tự."));
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
    const t = boot();
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

  it("tracks the watching cue when it goes from hidden to shown", async () => {
    const t = boot();
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
