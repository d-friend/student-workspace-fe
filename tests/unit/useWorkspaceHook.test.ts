import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import Page from "@/app/page";
import { useDesktop } from "@/hooks/useDesktop";
import { useWorkspace } from "@/hooks/useWorkspace";
import * as api from "@/lib/api";
import { copy } from "@/lib/copy";
import { fixtures } from "@/workspace/fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: true }),
  currentSession: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue({ sessionId: "s1" }),
  endSession: vi.fn().mockResolvedValue(undefined),
  getProgress: vi.fn().mockResolvedValue({ items: [] }),
  turn: vi.fn(),
  check: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

vi.mock("@/hooks/useDesktop", () => ({ useDesktop: vi.fn() }));
beforeEach(() => { vi.mocked(useDesktop).mockReturnValue(true); });
afterEach(cleanup);

it("wires the controller into React: input, a typed turn, and the screen", async () => {
  const api = {
    createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: true }),
    currentSession: vi.fn().mockResolvedValue(null),
    createSession: vi.fn().mockResolvedValue({ sessionId: "s1" }),
    endSession: vi.fn().mockResolvedValue(undefined),
    turn: vi.fn(async (_s: string, _m: unknown[], onDelta: (t: string) => void) => {
      onDelta("Chào bạn.");
      return { turnId: "t", stopReason: "end_turn" };
    }),
  };
  const { result } = renderHook(() => useWorkspace({ api: api as never, track: vi.fn() as never }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.screen).toBe("empty");

  act(() => result.current.setInput("xin chào"));
  expect(result.current.input).toBe("xin chào");
  await act(async () => {
    await result.current.submit();
  });
  expect(result.current.input).toBe("");
  expect(result.current.bubbles).toEqual([
    expect.objectContaining({ kind: "student", text: "xin chào", failed: null }),
    expect.objectContaining({ kind: "agent", text: "Chào bạn." }),
  ]);
  expect(result.current.busy).toBe(false);
});

const DONE = { turnId: "t", stopReason: "end_turn" };
const send = async (text: string) => {
  fireEvent.change(screen.getByRole("textbox", { name: copy.inputLabel }), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: copy.send }));
  });
};

it("keeps input across phase switch", async () => {
  const learn = fixtures["learn-derivative.json"];
  const solve = fixtures["solve-tangent.json"];
  vi.mocked(api.turn).mockImplementation(async (_s, _m, onDelta, onEvent) => {
    onEvent!({ event: "workspace", workspaceId: "L1", phase: "learn", doc: learn });
    onEvent!({ event: "workspace", workspaceId: "S1", phase: "solve", doc: solve });
    onDelta("Xong.");
    return DONE;
  });
  render(createElement(Page));
  await send("đề bài");
  expect(screen.getByRole("tab", { name: solve.title }).getAttribute("aria-selected")).toBe("true");

  const line = screen.getByRole("textbox", { name: copy.lineLabel(1) });
  fireEvent.change(line, { target: { value: "y' = 3x^2" } });
  fireEvent.change(screen.getByRole("textbox", { name: copy.inputLabel }), { target: { value: "đang gõ" } });
  fireEvent.click(screen.getByRole("tab", { name: learn.title }));
  expect(screen.getByRole("tab", { name: learn.title }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: solve.title }));

  expect(screen.getByRole("textbox", { name: copy.lineLabel(1) })).toBe(line);
  expect((line as HTMLInputElement).value).toBe("y' = 3x^2");
  expect((screen.getByRole("textbox", { name: copy.inputLabel }) as HTMLTextAreaElement).value).toBe("đang gõ");
});

it("a failed build with nothing to show offers Thử lại, which asks for a rebuild", async () => {
  vi.mocked(api.turn).mockImplementation(async (_s, _m, onDelta, onEvent) => {
    onEvent!({ event: "status", stage: "failed" });
    onDelta("Mình chưa dựng được.");
    return DONE;
  });
  render(createElement(Page));
  await send("đề bài");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: copy.retry }));
  });
  expect(vi.mocked(api.turn).mock.calls.at(-1)![1]).toEqual({ role: "user", content: copy.rebuildMessage });
});

it("a master task_done marks only its own workspace when block ids repeat across phases", async () => {
  const solve = fixtures["solve-tangent.json"]; // steps block s1
  const practice = { ...solve, phase: "practice" as const, title: "Luyện" }; // also s1
  vi.mocked(api.turn).mockImplementationOnce(async (_s, _m, onDelta, onEvent) => {
    onEvent!({ event: "workspace", workspaceId: "S1", phase: "solve", doc: solve });
    onEvent!({ event: "workspace", workspaceId: "P1", phase: "practice", doc: practice });
    onEvent!({ event: "active", workspaceId: "S1" });
    onEvent!({ event: "task_done", workspaceId: "S1", blockId: "s1" });
    onDelta("Xong rồi.");
    return DONE;
  });
  vi.mocked(api.turn).mockImplementationOnce(async () => DONE); // the completion's own turn
  const { container } = render(createElement(Page));
  await send("đề bài");
  expect(container.querySelector("#panel-S1")!.textContent).toContain(copy.doneLabel);
  expect(container.querySelector("#panel-P1")!.textContent).not.toContain(copy.doneLabel);

  // The completion is sent on its own as soon as the build turn ends; it does not wait for the next message.
  await waitFor(() => expect(api.turn).toHaveBeenCalledTimes(2));
  const content = String((vi.mocked(api.turn).mock.calls.at(-1)![1] as { content: string }).content);
  const events = JSON.parse(content.slice("[workspace] ".length));
  expect(events.filter((e: { type: string }) => e.type === "task_completed")).toEqual([
    { type: "task_completed", data: { similar: false, helped: false, max_hint: 0, via: "master" }, byStudent: false, workspace_id: "S1" },
  ]);
});

it("a retyped line is judged on its own after the master withdrew an ok", async () => {
  const solve = fixtures["solve-tangent.json"];
  vi.mocked(api.check).mockResolvedValue({ ok: true, state: "ok", done: false });
  vi.mocked(api.turn).mockImplementationOnce(async (_s, _m, onDelta, onEvent) => {
    onEvent!({ event: "workspace", workspaceId: "S1", phase: "solve", doc: solve });
    onDelta("Xong.");
    return DONE;
  });
  render(createElement(Page));
  await send("đề bài");
  fireEvent.change(screen.getByRole("textbox", { name: copy.lineLabel(1) }), { target: { value: "y' = 3x^2" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: copy.check }));
  });
  await screen.findByLabelText(copy.stateOk);

  vi.mocked(api.turn).mockImplementationOnce(async (_s, _m, onDelta, onEvent) => {
    onEvent!({ event: "line_state", workspaceId: "S1", blockId: "s1", line: 1, state: "review" });
    onDelta("Dòng 1 chưa đúng.");
    return DONE;
  });
  await send("sao sai?");
  await screen.findByText(copy.stateReview);
  const line = screen.getByRole("textbox", { name: copy.lineLabel(1) });

  fireEvent.change(line, { target: { value: "y' = 3x^2 - 2" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: copy.check }));
  });
  await screen.findByLabelText(copy.stateOk);
  expect(screen.queryByText(copy.stateReview)).toBeNull();
  expect(screen.getByRole("textbox", { name: copy.lineLabel(2) })).toBeTruthy();
});


it("reopens a restored legacy iframe from its chat card on mobile", async () => {
  vi.mocked(useDesktop).mockReturnValue(false);
  vi.mocked(api.currentSession).mockResolvedValueOnce({ sessionId: "legacy", messages: [{ role: "assistant", content: "Hello" }], html: "<p>Legacy work</p>", tabs: [], activeId: null, sheet: null });
  render(createElement(Page));
  const frame = await screen.findByTitle(copy.workspaceTitle);
  expect(frame.getAttribute("srcdoc")).toContain("Legacy work");
  expect(screen.queryByRole("tablist")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.backToChat }));
  expect(screen.getByTestId("chat-view").hidden).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: copy.workspaceOpen }));
  expect(screen.getByTestId("chat-view").hidden).toBe(true);
  expect(screen.getByTitle(copy.workspaceTitle)).toBe(frame);
});

// A turn held open so a check can land while it runs; `judge` then delivers the master's verdict.
async function heldTurn(solve = fixtures["solve-tangent.json"]) {
  let emit!: Parameters<typeof api.turn>[3];
  let end!: () => void;
  const turn = vi.fn()
    .mockImplementationOnce(async (_s, _m, onDelta, onEvent) => {
      onEvent!({ event: "workspace", workspaceId: "S1", phase: "solve", doc: solve });
      onDelta("Xong.");
      return DONE;
    })
    .mockImplementation((_s, _m, onDelta, onEvent) => new Promise((resolve) => {
      emit = onEvent;
      end = () => { onDelta("Ừ."); resolve(DONE); };
    }));
  const check = vi.fn().mockResolvedValue({ ok: false, state: "review", done: false });
  const deps = { ...api, turn, check };
  const { result } = renderHook(() => useWorkspace({ api: deps as never, track: vi.fn() as never }));
  await waitFor(() => expect(result.current.ready).toBe(true));
  const type = async (text: string) => {
    act(() => result.current.setInput(text));
    act(() => void result.current.submit());
  };
  await type("đề bài");
  await waitFor(() => expect(result.current.busy).toBe(false));
  return {
    result,
    start: async () => {
      await type("xem giúp");
      await waitFor(() => expect(result.current.busy).toBe(true));
    },
    checkLine: (previous: string[]) => act(async () => { await result.current.check("S1", "s1", "20", previous); }),
    judge: (line: number) => act(() => emit!({ event: "line_state", workspaceId: "S1", blockId: "s1", line, state: "ok" })),
    end: async () => {
      await act(async () => end());
      await waitFor(() => expect(result.current.busy).toBe(false));
    },
  };
}

it("a master line_state applies to a line checked before its turn", async () => {
  const t = await heldTurn();
  await t.checkLine([]);
  await t.start();
  t.judge(1);
  expect(t.result.current.overrides.S1?.s1).toEqual({ 1: "ok" });
  await t.end();
});

it("a master line_state is ignored for a line re-checked while its turn ran, until the next turn", async () => {
  const t = await heldTurn();
  await t.checkLine([]);
  await t.start();
  await t.checkLine([]);
  const seq = t.result.current.verdict.seq;
  t.judge(1);
  expect(t.result.current.overrides.S1?.s1?.[1]).toBeUndefined();
  expect(t.result.current.verdict.seq).toBe(seq);
  await t.end();
  await t.start();
  t.judge(1);
  expect(t.result.current.overrides.S1?.s1).toEqual({ 1: "ok" });
  await t.end();
});

it("a re-check leaves the same turn's line_state for another line in place", async () => {
  const t = await heldTurn();
  await t.start();
  await t.checkLine(["a"]);
  t.judge(1);
  expect(t.result.current.overrides.S1?.s1).toEqual({ 1: "ok" });
  await t.end();
});

it.each([
  ["a scaffold choice line keeps the key's review", 0, undefined],
  ["a scaffold blank line takes the master's ok", 1, "ok"],
])("master line_state ok: %s", async (_name, item, expected) => {
  const t = await heldTurn(fixtures["steps-scaffold.json"]);
  act(() => t.result.current.saveBlock("S1", "s1", { type: "steps", entries: [{ text: "x", state: "review", item }], done: false, free: false }));
  await t.start();
  t.judge(1);
  expect(t.result.current.overrides.S1?.s1?.[1]).toBe(expected);
  await t.end();
});
