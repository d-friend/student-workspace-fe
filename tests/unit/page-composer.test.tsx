import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";

import Page from "@/app/page";
import * as api from "@/lib/api";
import { track } from "@/lib/track";
import { copy } from "@/lib/copy";
import { fixtures } from "@/workspace/fixtures";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  createGuest: vi.fn().mockResolvedValue({ guestId: "g", created: false }),
  currentSession: vi.fn().mockResolvedValue(null),
  createSession: vi.fn().mockResolvedValue({ sessionId: "s" }),
  listSessions: vi.fn().mockResolvedValue({ sessions: [], next_before: null }),
  getProgress: vi.fn().mockResolvedValue({ items: [] }),
  resumeSession: vi.fn().mockResolvedValue(undefined),
  authMethods: vi.fn().mockResolvedValue({ google: false, email: false }),
  getMe: vi.fn().mockResolvedValue({ signed_in: false, profile_needed: false }),
  turn: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/photo", () => ({ readPhoto: vi.fn().mockResolvedValue({ data: "eA==", bytes: 1, width: 1, height: 1, processMs: 1 }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
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
  expect(screen.queryByText(copy.progressLatest)).toBeNull();
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
  expect(await screen.findByText(copy.progressLatest)).toBeTruthy();
  expect(screen.queryByText(copy.starter1)).toBeNull();
  expect(screen.queryByText("Older practice")).toBeNull();
  fireEvent.change(screen.getByLabelText(copy.inputLabel), { target: { value: "Draft" } });
  rerender(<StrictMode><Page /></StrictMode>);
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([
    ["progress_opened", { place: "entry", cards: 2 }],
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Bài dòng nước Dừng ở: Lập vận tốc" }));
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
  expect(screen.queryByText(copy.progressLatest)).toBeNull();
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([]);
});

it("keeps entry usable while progress loads and counts it only after the photo check closes", async () => {
  let finish!: (value: { items: api.ProgressItem[] }) => void;
  vi.mocked(api.getProgress).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const { container } = render(<Page />);
  await waitFor(() => expect(api.currentSession).toHaveBeenCalledOnce());
  expect(screen.getByText(copy.starter1)).toBeTruthy();
  expect((screen.getByLabelText(copy.inputLabel) as HTMLTextAreaElement).disabled).toBe(false);
  fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["x"], "problem.jpg", { type: "image/jpeg" })] } });
  await screen.findByRole("heading", { name: copy.photoTitle });
  await act(async () => finish({ items: [progressItem] }));
  expect(screen.queryByText(copy.progressLatest)).toBeNull();
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: copy.removePhoto }));
  await screen.findByText(copy.progressLatest);
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened")).toEqual([
    ["progress_opened", { place: "entry", cards: 1 }],
  ]);
});

it("does not show or track a list arriving while the entry is leaving", async () => {
  let finish!: (value: { items: api.ProgressItem[] }) => void;
  let build!: () => void;
  vi.mocked(api.getProgress).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  vi.mocked(api.turn).mockImplementationOnce((_session, _message, onDelta, onEvent) => new Promise(resolve => {
    build = () => {
      onEvent!({ event: "workspace", workspaceId: "w", phase: "solve", doc: fixtures["solve-tangent.json"] });
      onDelta("Xong rồi.");
      resolve({ turnId: "t", stopReason: "end_turn" });
    };
  }));
  const { container } = render(<Page />);
  await waitFor(() => expect(api.currentSession).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText(copy.inputLabel), { target: { value: "Build" } });
  fireEvent.keyDown(screen.getByLabelText(copy.inputLabel), { key: "Enter" });
  await waitFor(() => expect(build).toBeTypeOf("function"));
  await act(async () => { build(); });
  expect(container.querySelector('[data-unfold="flying"]')).toBeTruthy();
  await act(async () => finish({ items: [progressItem] }));
  expect(screen.queryByText(copy.progressLatest)).toBeNull();
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
  const card = await screen.findByRole("button", { name: /Bài dòng nước/ });
  await act(async () => { fireEvent.click(card); });
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /Bài dòng nước/ })).toBe(card);
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([false, true])("hands the only composer to chat during unfold and back on close (desktop=%s)", async (desktop) => {
  vi.spyOn(window, "matchMedia").mockImplementation(query => ({
    matches: desktop && query === "(min-width: 800px)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }) as unknown as MediaQueryList);
  let build!: () => void;
  vi.mocked(api.turn).mockImplementationOnce((_session, _message, onDelta, onEvent) => new Promise(resolve => {
    build = () => {
      onEvent!({ event: "workspace", workspaceId: "w", phase: "solve", doc: fixtures["solve-tangent.json"] });
      onDelta("Xong rồi.");
      resolve({ turnId: "t", stopReason: "end_turn" });
    };
  }));
  const { container } = render(<Page />);
  await waitFor(() => expect(api.currentSession).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText(copy.inputLabel), { target: { value: "__build" } });
  fireEvent.keyDown(screen.getByLabelText(copy.inputLabel), { key: "Enter" });
  await waitFor(() => expect(build).toBeTypeOf("function"));
  await act(async () => { build(); });
  expect(container.querySelector('[data-unfold="flying"]')).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: copy.petOpen }));
  expect(screen.getByRole("dialog", { name: copy.drawerLabel })).toBeDefined();
  // getAllByLabelText deliberately includes hidden/inert nodes, like Playwright getByLabel.
  expect(screen.getAllByLabelText(copy.inputLabel)).toHaveLength(1);
  expect(container.querySelector("main textarea")).toBeNull();

  fireEvent.keyDown(screen.getByRole("dialog", { name: copy.drawerLabel }), { key: "Escape" });
  expect(screen.getAllByLabelText(copy.inputLabel)).toHaveLength(1);
  expect(container.querySelector('[role="dialog"][data-leaving] textarea')).toBeNull();
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
