import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePet } from "@/hooks/usePet";
import type { Bubble, WorkspaceState } from "@/hooks/useWorkspace";

type S = Parameters<typeof usePet>[0];

const base: S = {
  bubbles: [],
  busy: false,
  building: false,
  checking: 0,
  verdict: { seq: 0, state: null, done: false },
  taskDone: {},
};

const student = (id: number): Bubble => ({ id, kind: "student", text: "x", photo: null });
const agent = (id: number, waiting = false, text = "Chào bạn."): Bubble => ({
  id,
  kind: "agent",
  text,
  waiting,
  line: null,
  offer: false,
  restate: false,
});
const verdict = (seq: number, state: WorkspaceState["verdict"]["state"], done = false) => ({ seq, state, done });

function setup(initial: S = base) {
  let props = initial;
  const r = renderHook((p: S) => usePet(p), { initialProps: initial });
  const to = (patch: Partial<S>) => {
    props = { ...props, ...patch };
    r.rerender(props);
  };
  const mood = () => r.result.current.mood;
  const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
  return { r, to, mood, wait };
}

function type(el: HTMLElement) {
  act(() => void el.dispatchEvent(new Event("input", { bubbles: true })));
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("usePet", () => {
  it("(a) a workspace turn with no agent bubble thinks, then idles when it ends silently", () => {
    const { to, mood } = setup();
    to({ busy: true });
    expect(mood()).toBe("thinking");
    to({ busy: false });
    expect(mood()).toBe("idle");
  });

  it("(b) a waiting agent bubble is typing, but thinking while building", () => {
    const { to, mood } = setup();
    to({ busy: true, bubbles: [student(1), agent(2, true)] });
    expect(mood()).toBe("typing");
    to({ building: true });
    expect(mood()).toBe("thinking");
    to({ building: false }); // the build is over, the reply is about to arrive
    expect(mood()).toBe("typing");
  });

  it("(b) the first long build of a typed turn shows thinking, not dots", () => {
    const { to, mood } = setup();
    to({ busy: true, building: true, bubbles: [student(1), agent(2, true)] });
    expect(mood()).toBe("thinking");
  });

  it("(c) streaming text is talking, and stays talking 1.8 s after the turn ends", () => {
    const { to, mood, wait } = setup();
    to({ busy: true, bubbles: [student(1), agent(2, true)] });
    to({ bubbles: [student(1), agent(2, false, "Chào")] });
    expect(mood()).toBe("talking");
    to({ busy: false });
    expect(mood()).toBe("talking");
    wait(1799);
    expect(mood()).toBe("talking");
    wait(1);
    expect(mood()).toBe("idle");
  });

  it("(c) a workspace turn whose agent speaks talks too", () => {
    const { to, mood, wait } = setup();
    to({ busy: true });
    expect(mood()).toBe("thinking");
    to({ bubbles: [agent(1)] });
    expect(mood()).toBe("talking");
    to({ busy: false });
    wait(1800);
    expect(mood()).toBe("idle");
  });

  it("(d) an ok verdict is happy for 1.3 s; a done one for 2.4 s", () => {
    const { to, mood, wait, r } = setup();
    to({ verdict: verdict(1, "ok") });
    expect(mood()).toBe("happy");
    expect(r.result.current.celebrateKey).toBe(1);
    wait(1299);
    expect(mood()).toBe("happy");
    wait(1);
    expect(mood()).toBe("idle");

    to({ verdict: verdict(2, "ok", true) });
    wait(2399);
    expect(mood()).toBe("happy");
    wait(1);
    expect(mood()).toBe("idle");
  });

  it("(d') a task_done from the agent (taskDone grows) celebrates for 2.4 s", () => {
    const { to, mood, wait, r } = setup();
    to({ taskDone: { w1: ["b1"] } });
    expect(mood()).toBe("happy");
    expect(r.result.current.celebrateKey).toBe(1);
    wait(2399);
    expect(mood()).toBe("happy");
    wait(1);
    expect(mood()).toBe("idle");
  });

  it("(d') taskDone shrinking (a replaced doc) does not celebrate, and the next growth does", () => {
    const { to, mood, r } = setup({ ...base, taskDone: { w1: ["b1", "b2"] } });
    to({ taskDone: {} });
    expect(mood()).toBe("idle");
    to({ taskDone: { w2: ["b1"] } });
    expect(mood()).toBe("happy");
    expect(r.result.current.celebrateKey).toBe(1);
  });

  it("(e) a review verdict holds doubt; typing does not clear it, a check or an ok does", () => {
    const input = document.body.appendChild(document.createElement("input"));
    const { to, mood, wait } = setup();
    to({ verdict: verdict(1, "review") });
    expect(mood()).toBe("doubt");
    wait(10_001);
    expect(mood()).toBe("doubt");
    type(input);
    expect(mood()).toBe("doubt");
    to({ checking: 1 });
    expect(mood()).toBe("thinking");
    to({ checking: 0 });
    expect(mood()).toBe("doubt");
    to({ verdict: verdict(2, "ok") });
    expect(mood()).toBe("happy");
    wait(1300);
    expect(mood()).toBe("listening"); // the keystroke 1.3 s ago still counts
  });

  it("(f) review, then the agent speaks: talking while it speaks, doubt 1.8 s after", () => {
    const { to, mood, wait } = setup({ ...base, verdict: verdict(1, "review") });
    to({ busy: true });
    expect(mood()).toBe("doubt"); // reading: the held doubt outranks thinking
    to({ bubbles: [agent(1)] });
    expect(mood()).toBe("talking");
    to({ busy: false });
    wait(1799);
    expect(mood()).toBe("talking");
    wait(1);
    expect(mood()).toBe("doubt");
  });

  it("(g) a keystroke in an input listens for 2.5 s; leaving the field stops it", () => {
    const input = document.body.appendChild(document.createElement("input"));
    const area = document.body.appendChild(document.createElement("textarea"));
    const div = document.body.appendChild(document.createElement("div"));
    const { mood, wait } = setup();
    type(div);
    expect(mood()).toBe("idle");
    type(input);
    expect(mood()).toBe("listening");
    wait(2499);
    expect(mood()).toBe("listening");
    wait(1);
    expect(mood()).toBe("idle");
    type(area);
    expect(mood()).toBe("listening");
    act(() => void area.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(mood()).toBe("idle");
  });

  it("(h) celebrate() is happy for 1.3 s and bumps celebrateKey", () => {
    const { r, mood, wait } = setup();
    act(() => r.result.current.celebrate());
    expect(mood()).toBe("happy");
    expect(r.result.current.celebrateKey).toBe(1);
    wait(1300);
    expect(mood()).toBe("idle");
    act(() => r.result.current.celebrate());
    expect(r.result.current.celebrateKey).toBe(2);
  });

  it("a restored session starts idle: no celebration, no talking", () => {
    const { mood, r, wait } = setup({
      ...base,
      bubbles: [student(1), agent(2)],
      verdict: verdict(4, "ok", true),
      taskDone: { w1: ["b1"] },
    });
    expect(mood()).toBe("idle");
    expect(r.result.current.celebrateKey).toBe(0);
    wait(3000);
    expect(mood()).toBe("idle");
  });

  it("newProblem (bubbles cleared) ends the talking hold at once", () => {
    const { to, mood } = setup();
    to({ busy: true, bubbles: [agent(1)] });
    to({ busy: false });
    expect(mood()).toBe("talking");
    to({ bubbles: [] });
    expect(mood()).toBe("idle");
  });

  it("an ok while talking jumps, then goes back to talking", () => {
    const { to, mood, wait } = setup();
    to({ busy: true, bubbles: [agent(1)] });
    to({ verdict: verdict(1, "ok") });
    expect(mood()).toBe("happy");
    wait(1300);
    expect(mood()).toBe("talking");
  });

  it("an ok while in doubt jumps, then idles", () => {
    const { to, mood, wait } = setup({ ...base, verdict: verdict(1, "review") });
    to({ verdict: verdict(2, "ok") });
    expect(mood()).toBe("happy");
    wait(1300);
    expect(mood()).toBe("idle");
  });

  it("two ok verdicts in a row bump celebrateKey twice and restart the window", () => {
    const { to, mood, wait, r } = setup();
    to({ verdict: verdict(1, "ok") });
    wait(1000);
    to({ verdict: verdict(2, "ok") });
    expect(r.result.current.celebrateKey).toBe(2);
    wait(1000);
    expect(mood()).toBe("happy"); // 2 s after the first: the second window still runs
    wait(300);
    expect(mood()).toBe("idle");
  });

  it("a typed turn that ends silent (waiting bubble removed) goes idle, not stuck typing", () => {
    const { to, mood, wait } = setup();
    to({ busy: true, bubbles: [student(1), agent(2, true)] });
    expect(mood()).toBe("typing");
    to({ busy: false, bubbles: [student(1)] });
    expect(mood()).toBe("idle");
    wait(2000);
    expect(mood()).toBe("idle");
  });

  it("a workspace turn ignores the previous turn's agent bubble", () => {
    const { to, mood, wait } = setup({ ...base, bubbles: [student(1), agent(2)] });
    to({ busy: true });
    expect(mood()).toBe("thinking");
    to({ busy: false });
    expect(mood()).toBe("idle");
    wait(2000);
    expect(mood()).toBe("idle");
  });

  it("the agent's build text is not talking: building shows thinking", () => {
    const { to, mood } = setup();
    to({ busy: true, bubbles: [student(1), agent(2, true)] });
    to({ building: true, bubbles: [student(1), agent(2, false, "Mình đang dựng...")] });
    expect(mood()).toBe("thinking");
  });

  it("a new turn during the talking hold ends the hold", () => {
    const { to, mood } = setup();
    to({ busy: true, bubbles: [agent(1)] });
    to({ busy: false });
    expect(mood()).toBe("talking");
    to({ busy: true });
    expect(mood()).toBe("thinking");
  });

  it("unmount clears every timer and the document listeners", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const input = document.body.appendChild(document.createElement("input"));
    const { to, r } = setup();
    type(input);
    to({ verdict: verdict(1, "ok"), busy: true, bubbles: [agent(1)] });
    to({ busy: false });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    r.unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("input", expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith("focusout", expect.any(Function), true);
  });
});
