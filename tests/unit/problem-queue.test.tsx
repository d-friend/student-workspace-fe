import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorkspace } from "@/hooks/useWorkspace";
import type { QueueItem } from "@/lib/api";
import { copy } from "@/lib/copy";
import { fixtures } from "@/workspace/fixtures";
import { PhaseSwitch } from "@/workspace/PhaseSwitch";
import { ProgressCard } from "@/workspace/ProgressCard";
import { QueuedPanel } from "@/workspace/QueuedPanel";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const doc = Object.values(fixtures)[0];
const first = { id: "w1", phase: "solve" as const, doc };
const second = { id: "w2", phase: "solve" as const, doc };
const item = (label: string, status: QueueItem["status"], extra: Partial<QueueItem> = {}): QueueItem =>
  ({ id: `q${label}`, label, firstLabel: "5.28", status, opened: false, workspaceId: null, tab: null, ...extra });
const ready = (opened = false) => item("5.29", "ready", { workspaceId: "w2", tab: second, opened });

async function setup(...answers: QueueItem[][]) {
  let call = 0;
  const api = {
    createGuest: vi.fn().mockResolvedValue({}),
    currentSession: vi.fn().mockResolvedValue({ sessionId: "s1", messages: [], html: null, tabs: [first], activeId: "w1" }),
    createSession: vi.fn(), endSession: vi.fn().mockResolvedValue(undefined),
    setActiveWorkspace: vi.fn().mockResolvedValue(undefined), turnStatus: vi.fn(),
    turn: vi.fn(async (_s: string, _m: unknown, onDelta: (t: string) => void) => { onDelta("Ok."); return { turnId: "t", stopReason: "end_turn" }; }),
    check: vi.fn(),
    getQueue: vi.fn(async () => answers[Math.min(call++, answers.length - 1)]),
  };
  const track = vi.fn();
  let clock = 0;
  const ws = createWorkspace({ api: api as never, track: track as never, readPhoto: vi.fn(), now: () => (clock += 1000) });
  ws.init();
  await vi.advanceTimersByTimeAsync(0);
  return { ws, api, track, state: ws.getState };
}

describe("problem queue", () => {
  it("polls only while a build runs; a ready tab joins the row without taking the screen", async () => {
    vi.useFakeTimers();
    const { api, state } = await setup([item("5.29", "building")], [ready()]);
    expect(state().queue[0].status).toBe("building");
    await vi.advanceTimersByTimeAsync(5000);
    expect(state().tabs.map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(state().activeId).toBe("w1");
    expect(state().queueAnnouncement).toBe(copy.queueReadyAnnounce("5.29"));
    await vi.advanceTimersByTimeAsync(20000);
    expect(api.getQueue).toHaveBeenCalledTimes(2);
  });

  it("opens a ready problem with no turn and reports a zero wait", async () => {
    vi.useFakeTimers();
    const { ws, api, track, state } = await setup([ready()], [ready(true)]);
    ws.actions.openQueued("q5.29", "card");
    expect(state().activeId).toBe("w2");
    expect(api.setActiveWorkspace).toHaveBeenCalledWith("s1", "w2");
    expect(track).toHaveBeenCalledWith("queued_problem_opened", { label: "5.29", wait_ms: 0 }, "s1");
    expect(api.turn).not.toHaveBeenCalled();
  });

  it("waits on a building problem and switches to it when it is ready", async () => {
    vi.useFakeTimers();
    const { ws, track, state } = await setup([item("5.29", "building")], [ready()], [ready(true)]);
    ws.actions.openQueued("q5.29", "card");
    expect(state().queueViewId).toBe("q5.29");
    await vi.advanceTimersByTimeAsync(5000);
    expect([state().queueViewId, state().activeId]).toEqual([null, "w2"]);
    expect(track).toHaveBeenCalledWith("queued_problem_opened", { label: "5.29", wait_ms: expect.any(Number) }, "s1");
  });

  it("does not switch away once the student goes back to their problem", async () => {
    vi.useFakeTimers();
    const { ws, state } = await setup([item("5.29", "building")], [ready()]);
    ws.actions.openQueued("q5.29", "tab");
    ws.actions.setActive("w1");
    await vi.advanceTimersByTimeAsync(5000);
    expect([state().queueViewId, state().activeId]).toEqual([null, "w1"]);
  });

  it("a failed tab explains itself; the card and a queued tab start a build turn", async () => {
    vi.useFakeTimers();
    const { ws, api, state } = await setup([item("5.29", "failed"), item("5.30", "queued")]);
    ws.actions.openQueued("q5.29", "tab");
    expect(state().queueViewId).toBe("q5.29");
    expect(api.turn).not.toHaveBeenCalled();
    ws.actions.openQueued("q5.30", "tab");
    await vi.advanceTimersByTimeAsync(0);
    expect(api.turn.mock.calls[0][1]).toEqual({ role: "user", content: copy.queueBuildMessage("5.30") });
  });

  it("labels queue tabs with the page number and a status word", () => {
    const onOpen = vi.fn();
    render(<PhaseSwitch tabs={[first]} activeId="w1" onActive={() => {}} queue={{ items: [item("5.29", "building"), item("5.30", "queued")], viewId: null, onOpen }} />);
    expect(screen.getByRole("tab", { name: `5.29 ${copy.queueStatus.building}` })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: `5.30 ${copy.queueStatus.queued}` }));
    expect(onOpen).toHaveBeenCalledWith("q5.30", "tab");
  });

  it("the next problem takes the offer's place on the done card", () => {
    render(<ProgressCard hints={0} offer={{ opts: ["Bài tương tự"], onPick: () => {} }} next={{ item: ready(), onOpen: () => {} }} />);
    expect(screen.getByRole("button", { name: new RegExp(copy.queueNext("5.29")) })).toBeTruthy();
    expect(screen.queryByText("Bài tương tự")).toBeNull();
  });

  it("the building panel names the problem to keep doing; the failed one offers a rebuild", () => {
    const onBuild = vi.fn();
    const { rerender } = render(<QueuedPanel item={item("5.29", "building")} current="5.28" onBack={() => {}} onBuild={onBuild} busy={false} />);
    expect(screen.getByText(copy.queuePreparing("5.28"))).toBeTruthy();
    rerender(<QueuedPanel item={item("5.29", "failed")} current="5.28" onBack={() => {}} onBuild={onBuild} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: copy.pageRebuild }));
    expect(onBuild).toHaveBeenCalled();
  });
});
