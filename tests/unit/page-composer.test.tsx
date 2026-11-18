import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";

import Page from "@/app/page";
import * as api from "@/lib/api";
import { track } from "@/lib/track";
import { copy } from "@/lib/copy";
import { JPEG_PREFIX, readPhoto } from "@/lib/photo";
import { useDesktop } from "@/hooks/useDesktop";
import { fixtures } from "@/workspace/fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: false }),
  currentSession: vi.fn().mockResolvedValue(null),
  endSession: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn().mockResolvedValue({ sessionId: "s" }),
  listSessions: vi.fn().mockResolvedValue({ sessions: [], next_before: null }),
  getSurpriseCard: vi.fn().mockRejectedValue(new Error("empty pool")),
  getProgress: vi.fn().mockResolvedValue({ items: [] }),
  resumeSession: vi.fn().mockResolvedValue(undefined),
  authMethods: vi.fn().mockResolvedValue({ google: false, email: false }),
  getMe: vi.fn().mockResolvedValue({ signed_in: false, profile_needed: false }),
  turn: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/hooks/useDesktop", () => ({ useDesktop: vi.fn() }));
vi.mock("@/lib/photo", async (original) => ({
  ...await original<typeof import("@/lib/photo")>(),
  readPhoto: vi.fn().mockResolvedValue({ data: "eA==", bytes: 1, width: 1, height: 1, processMs: 1 }),
}));

beforeEach(() => { vi.mocked(useDesktop).mockReturnValue(false); });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const progressItem: api.ProgressItem = {
  workspace_id: "past-work", session_id: "past-session", phase: "solve", title: "Bài dòng nước", created_at: new Date(Date.now() - 3.5 * 86_400_000).toISOString(), tabs: 3,
  roadmap: "motion_current", stages: [0, 1], steps: { entries: [{ item: 0, state: "ok", tries: 1, hint: 0 }], done: false, free: false },
  quizzes: null, next: null,
};

it("a failed progress fetch leaves starters usable without an error or impression", async () => {
  vi.mocked(api.getProgress).mockRejectedValueOnce(Error("offline"));
  render(<Page />);
  await waitFor(() => expect(api.getProgress).toHaveBeenCalledOnce());
  expect(screen.getByText(copy.starter1)).toBeTruthy();
  expect(screen.getByText(copy.starter2)).toBeTruthy();
  expect(screen.queryByText(copy.entryNext)).toBeNull();
  expect(screen.queryByRole("link", { name: copy.progressNav })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([]);
});

it("shows the newest eligible card, counts all cards once, and resumes before reload", async () => {
  const reload = vi.fn();
  const realWindow = window;
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, key) {
      if (key === "location") return { href: target.location.href, reload };
      return Reflect.get(target, key);
    },
  }));
  let finishResume!: () => void;
  vi.mocked(api.resumeSession).mockReturnValueOnce(new Promise(resolve => { finishResume = resolve; }));
  vi.mocked(api.getProgress).mockResolvedValueOnce({ items: [
    { ...progressItem, phase: "learn" }, progressItem,
    { ...progressItem, workspace_id: "practice", phase: "practice", title: "Older practice" },
    { ...progressItem, steps: null },
  ] });
  const { rerender } = render(<StrictMode><Page /></StrictMode>);
  expect(await screen.findByText(copy.entryNext)).toBeTruthy();
  // The phone drawer is closed in jsdom, so the link is in the tree but hidden.
  expect(screen.getByRole("link", { name: copy.progressNav, hidden: true }).getAttribute("href")).toBe("/progress");
  expect(screen.queryByText(copy.starter1)).toBeNull();
  expect(screen.queryByText("Older practice")).toBeNull();
  fireEvent.change(screen.getByLabelText(copy.inputLabel), { target: { value: "Draft" } });
  rerender(<StrictMode><Page /></StrictMode>);
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([
    ["progress_opened", { place: "entry", cards: 2 }],
  ]);
  fireEvent.click(screen.getByRole("button", { name: copy.entryResume }));
  expect(track).toHaveBeenCalledWith("history_session_viewed", { tabs: 3, age_days: 3 }, "past-session");
  expect(api.resumeSession).toHaveBeenCalledExactlyOnceWith("past-session");
  expect(reload).not.toHaveBeenCalled();
  await act(async () => finishResume());
  expect(reload).toHaveBeenCalledOnce();
});

it("does not count entry progress while restoring a workspace", async () => {
  let restore!: (value: Awaited<ReturnType<typeof api.currentSession>>) => void;
  vi.mocked(api.currentSession).mockReturnValueOnce(new Promise(resolve => { restore = resolve; }));
  vi.mocked(api.getProgress).mockResolvedValueOnce({ items: [progressItem] });
  render(<Page />);
  await waitFor(() => expect(api.getProgress).toHaveBeenCalledOnce());
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([]);
  await act(async () => restore({
    sessionId: "restored", html: null, activeId: "w", sheet: null, messages: [],
    tabs: [{ id: "w", phase: "solve", doc: fixtures["solve-tangent.json"] }],
  }));
  expect(screen.queryByText(copy.entryNext)).toBeNull();
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([]);
});

it("attaches gallery files in order and keeps the greeting and progress visible", async () => {
  let finish!: (value: { items: api.ProgressItem[] }) => void;
  let decodeFirst!: (result: Awaited<ReturnType<typeof readPhoto>>) => void;
  vi.mocked(readPhoto).mockReturnValueOnce(new Promise(resolve => { decodeFirst = resolve; }));
  vi.mocked(api.getProgress).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { container } = render(<Page />);
  await waitFor(() => expect(api.currentSession).toHaveBeenCalledOnce());
  expect(screen.getByText(copy.starter1)).toBeTruthy();
  expect((screen.getByLabelText(copy.inputLabel) as HTMLTextAreaElement).disabled).toBe(false);
  const gallery = container.querySelector('input[type="file"][multiple]')!;
  expect(container.querySelector('input[type="file"][capture]:not([multiple])')).not.toBeNull();
  const files = [new File(["a"], "first.jpg"), new File(["b"], "second.jpg")];
  fireEvent.change(gallery, { target: { files } });
  expect(readPhoto).toHaveBeenCalledExactlyOnceWith(files[0]);
  await act(async () => decodeFirst({ data: "YQ==", bytes: 1, width: 1, height: 1, processMs: 1 }));
  expect(readPhoto).toHaveBeenNthCalledWith(2, files[1]);
  expect(screen.getAllByRole("img", { name: copy.photoChip }).map((img) => img.getAttribute("src"))).toEqual([
    JPEG_PREFIX + "YQ==",
    JPEG_PREFIX + "eA==",
  ]);
  expect(screen.getByRole("heading", { name: copy.entryTitle })).toBeTruthy();
  await act(async () => finish({ items: [progressItem] }));
  await screen.findByText(copy.entryNext);
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([
    ["progress_opened", { place: "entry", cards: 1 }],
  ]);
});

it("does not show or track progress arriving after the first message", async () => {
  let finish!: (value: { items: api.ProgressItem[] }) => void;
  vi.mocked(api.getProgress).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  vi.mocked(api.turn).mockImplementationOnce(async (_session, _message, onDelta) => {
    onDelta("Mình cần thêm chi tiết.");
    return { turnId: "t", stopReason: "end_turn" };
  });
  render(<Page />);
  await waitFor(() => expect(api.currentSession).toHaveBeenCalledOnce());
  send("Một câu hỏi");
  expect(await screen.findByText("Mình cần thêm chi tiết.")).toBeTruthy();
  await act(async () => finish({ items: [progressItem] }));
  expect(screen.queryByText(copy.entryNext)).toBeNull();
  expect(screen.queryByText(copy.entryTitle)).toBeNull();
  expect(screen.queryByRole("button", { name: copy.backToChat })).toBeNull();
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([]);
});

it("a failed resume keeps the entry card without reloading or showing an error", async () => {
  const reload = vi.fn();
  const realWindow = window;
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, key) {
      if (key === "location") return { href: target.location.href, reload };
      return Reflect.get(target, key);
    },
  }));
  vi.mocked(api.getProgress).mockResolvedValueOnce({ items: [progressItem] });
  vi.mocked(api.resumeSession).mockRejectedValueOnce(Error("offline"));
  render(<Page />);
  const card = await screen.findByRole("button", { name: copy.entryResume });
  await act(async () => { fireEvent.click(card); });
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: copy.entryResume })).toBe(card);
  expect(screen.queryByRole("alert")).toBeNull();
});

const DONE = { turnId: "t", stopReason: "end_turn" };
const solve = fixtures["solve-tangent.json"];
const composer = () => screen.getByRole("textbox", { name: copy.inputLabel }) as HTMLTextAreaElement;
const back = () => screen.getByRole("button", { name: new RegExp(copy.backToChat) });
const send = (text: string) => {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.keyDown(composer(), { key: "Enter" });
};

async function beginBuild() {
  let emit!: (event: api.TurnEvent) => void;
  let reply!: (text: string) => void;
  let finish!: () => void;
  vi.mocked(api.turn).mockImplementationOnce((_session, _message, onDelta, onEvent) => new Promise(resolve => {
    emit = onEvent!;
    reply = onDelta;
    finish = () => resolve(DONE);
  }));
  await waitFor(() => expect(api.currentSession).toHaveBeenCalledOnce());
  send("Dựng bài giúp mình");
  await waitFor(() => expect(emit).toBeTypeOf("function"));
  await act(async () => emit({ event: "status", stage: "planning", phase: "solve" }));
  return { emit, reply, finish };
}

it("opens the streamed build on mobile, marks unread replies, and reopens the doc from its card", async () => {
  const { container } = render(<Page />);
  const field = composer();
  const turn = await beginBuild();
  const chat = screen.getByTestId("chat-view");
  expect(chat.hidden).toBe(true);
  expect(screen.queryByRole("textbox", { name: copy.inputLabel })).toBeNull();
  expect(container.querySelector('[data-variant="solve"][aria-busy="true"]')).toBeTruthy();
  expect(within(back()).queryByRole("img")).toBeNull();

  await act(async () => {
    turn.emit({ event: "workspace", workspaceId: "w", phase: "solve", doc: solve });
    turn.reply("Mình dựng xong rồi.");
    turn.finish();
  });
  expect(container.querySelector('[data-variant="solve"]')).toBeNull();
  expect(within(back()).getByRole("img", { name: copy.petUnread })).toBeTruthy();

  fireEvent.click(back());
  expect(chat.hidden).toBe(false);
  expect(composer()).toBe(field);
  expect(track).toHaveBeenCalledWith("chat_opened", { unread: true }, "s");
  expect(screen.queryByRole("textbox", { name: copy.lineLabel(1) })).toBeNull();
  expect(within(chat).getByText("Mình dựng xong rồi.")).toBeTruthy();

  fireEvent.click(within(chat).getByRole("button", { name: copy.workspaceOpen }));
  expect(chat.hidden).toBe(true);
  expect(within(back()).queryByRole("img")).toBeNull();
  expect(screen.getByRole("textbox", { name: copy.lineLabel(1) })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: copy.historyOpen }));
  fireEvent.click(screen.getByRole("button", { name: copy.newProblem }));
  expect(chat.hidden).toBe(false);
  expect(screen.getByRole("heading", { name: copy.entryTitle })).toBeTruthy();
  expect(composer()).toBe(field);
});

it("returns to the same mobile thread when the workspace card fails and rebuilds from the card", async () => {
  render(<Page />);
  const turn = await beginBuild();
  expect(back()).toBeTruthy();
  await act(async () => {
    turn.emit({ event: "status", stage: "failed" });
    turn.reply("Mình chưa dựng được.");
    turn.finish();
  });
  const chat = screen.getByTestId("chat-view");
  expect(chat.hidden).toBe(false);
  expect(screen.queryByRole("button", { name: copy.backToChat })).toBeNull();
  expect(within(chat).getByText("Dựng bài giúp mình")).toBeTruthy();
  expect(within(chat).getByText(copy.workspaceBuildFailed)).toBeTruthy();
  vi.mocked(api.turn).mockImplementationOnce(async (_s, _m, onDelta) => {
    onDelta("Để mình thử lại.");
    return DONE;
  });
  await act(async () => fireEvent.click(within(chat).getByRole("button", { name: copy.retry })));
  expect(vi.mocked(api.turn).mock.calls.at(-1)?.[1]).toEqual({ role: "user", content: copy.rebuildMessage });
});

it("leaves mobile chat visible if the student returns while the build is still streaming", async () => {
  render(<Page />);
  const turn = await beginBuild();
  fireEvent.click(back());
  await act(async () => {
    turn.emit({ event: "workspace", workspaceId: "w", phase: "solve", doc: solve });
    turn.reply("Bài của bạn đây.");
    turn.finish();
  });
  expect(screen.getByTestId("chat-view").hidden).toBe(false);
  expect(screen.getByRole("button", { name: copy.workspaceOpen })).toBeTruthy();
  expect(track).toHaveBeenCalledWith("chat_opened", { unread: false }, "s");
});

it.each([false, true])("opens the restored workspace once and focuses chat after a selection (desktop=%s)", async (desktop) => {
  vi.mocked(useDesktop).mockReturnValue(desktop);
  vi.mocked(api.currentSession).mockResolvedValueOnce({
    sessionId: "restored", html: null, activeId: "w", sheet: null,
    messages: [{ role: "assistant", content: "A previous reply." }],
    tabs: [{ id: "w", phase: "solve", doc: solve }],
  });
  const { container } = render(<Page />);
  const chat = screen.getByTestId("chat-view");
  const field = composer();
  await screen.findByRole("textbox", { name: copy.lineLabel(1) });

  expect(chat.hidden).toBe(!desktop);
  expect(chat.closest("[data-chat]") !== null).toBe(desktop);
  if (desktop) {
    expect(composer()).toBe(field);
    expect(screen.queryByRole("button", { name: copy.backToChat })).toBeNull();
    expect(chat.querySelector("header")).toBeNull();
  } else {
    expect(within(back()).queryByRole("img")).toBeNull();
  }

  vi.useFakeTimers();
  const selected = "Viết phương trình tiếp tuyến";
  const target = container.querySelector<HTMLElement>('#panel-w [data-sel="problem"]')!;
  vi.spyOn(window, "getSelection").mockReturnValue({
    isCollapsed: false, rangeCount: 1, toString: () => selected,
    getRangeAt: () => ({ startContainer: target, endContainer: target, getClientRects: () => [{ left: 20, bottom: 40 }] }),
  } as unknown as Selection);
  act(() => { document.dispatchEvent(new Event("selectionchange")); vi.advanceTimersByTime(250); });
  fireEvent.click(screen.getByRole("button", { name: copy.selectionAsk }));

  expect(chat.hidden).toBe(false);
  expect(within(chat).getByText(selected).closest("blockquote")).toBeTruthy();
  expect(composer()).toBe(field);
  expect(field.value).toBe(copy.selectionQuestion);
  expect(document.activeElement).toBe(field);
  expect(screen.getAllByRole("textbox", { name: copy.inputLabel })).toHaveLength(1);
  expect(chat.closest("[data-chat]") !== null).toBe(desktop);
});

it("the restored completion card answers the live offer with place card and loses its buttons", async () => {
  vi.mocked(api.currentSession).mockResolvedValueOnce({
    sessionId: "progress-session", html: null, activeId: "progress-work", sheet: null,
    messages: [{ role: "assistant", content: "[offer] [opts: Học tiếp: Hệ phương trình | Bài tương tự] Xong rồi." }],
    tabs: [{ id: "progress-work", phase: "solve", doc: {
      version: 1, phase: "solve", title: "Bài toán", sources: [], blocks: [
        { type: "problem", id: "p", md: "Tính vận tốc" },
        { type: "steps", id: "s", problem_id: "p", input: "math", roadmap: "motion_current", scaffold: [
          { kind: "choice", prompt: "Chọn ẩn", options: ["x", "y"], stage: 0 },
        ] },
      ],
    }, state: { blocks: { s: { type: "steps", done: true, free: false, entries: [{ text: "x", item: 0, state: "ok", tries: 1, hint: 0 }] } } } }],
  });
  vi.mocked(api.turn).mockImplementationOnce(async (_s, _m, onDelta) => {
    onDelta("Ok.");
    return { turnId: "next-turn", stopReason: "end_turn" };
  });
  render(<Page />);
  const card = (await screen.findByText(copy.doneLabel)).closest<HTMLElement>('[role="status"]')!;
  expect(within(card).getByText(copy.stageFirst)).toBeTruthy();
  fireEvent.click(within(card).getByRole("button", { name: "Học tiếp: Hệ phương trình" }));
  await waitFor(() => expect(track).toHaveBeenCalledWith("next_topic_accepted", { place: "card" }, "progress-session"));
  await waitFor(() => expect(within(card).queryByRole("button")).toBeNull());
});
