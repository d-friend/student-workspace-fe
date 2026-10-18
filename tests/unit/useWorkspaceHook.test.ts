import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";

import Page from "@/app/page";
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
  turn: vi.fn(),
  check: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

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
  expect(result.current.bubbles.map((b) => b.text)).toEqual(["xin chào", "Chào bạn."]);
  expect(result.current.busy).toBe(false);
});

const DONE = { turnId: "t", stopReason: "end_turn" };
const send = async (text: string) => {
  // The composer lives in the chat drawer, which opens from the pet.
  if (!screen.queryByRole("dialog")) fireEvent.click(screen.getByRole("button", { name: copy.petOpen }));
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
  expect(screen.getByRole("tab", { name: copy.phaseSolve }).getAttribute("aria-selected")).toBe("true");

  const line = screen.getByRole("textbox", { name: copy.lineLabel(1) });
  fireEvent.change(line, { target: { value: "y' = 3x^2" } });
  fireEvent.change(screen.getByRole("textbox", { name: copy.inputLabel }), { target: { value: "đang gõ" } });
  fireEvent.click(screen.getByRole("tab", { name: copy.phaseLearn }));
  expect(screen.getByRole("tab", { name: copy.phaseLearn }).getAttribute("aria-selected")).toBe("true");
  fireEvent.click(screen.getByRole("tab", { name: copy.phaseSolve }));

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
    onEvent!({ event: "phase", phase: "solve" });
    onEvent!({ event: "task_done", workspaceId: "S1", blockId: "s1" });
    onDelta("Xong rồi.");
    return DONE;
  });
  const { container } = render(createElement(Page));
  await send("đề bài");
  expect(container.querySelector("#panel-solve")!.textContent).toContain(copy.doneTitle);
  expect(container.querySelector("#panel-practice")!.textContent).not.toContain(copy.doneTitle);

  // The completions ride along with the next typed message.
  vi.mocked(api.turn).mockImplementationOnce(async (_s, _m, onDelta) => {
    onDelta("ok");
    return DONE;
  });
  await send("tiếp");
  const content = String((vi.mocked(api.turn).mock.calls.at(-1)![1] as { content: string }).content);
  const events = JSON.parse(content.slice("[workspace] ".length, content.indexOf("\n\n")));
  expect(events.filter((e: { type: string }) => e.type === "task_completed")).toEqual([
    { type: "task_completed", data: { similar: false, helped: false, max_hint: 0, via: "master" }, byStudent: false },
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
  await screen.findByText(copy.stateOk);

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
  await screen.findByText(copy.stateOk);
  expect(screen.queryByText(copy.stateReview)).toBeNull();
  expect(screen.getByRole("textbox", { name: copy.lineLabel(2) })).toBeTruthy();
});
