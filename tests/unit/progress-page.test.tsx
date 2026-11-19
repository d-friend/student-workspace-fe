import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Page from "@/app/progress/page";
import * as api from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { track } from "@/lib/track";

vi.mock("@/lib/api", async original => ({
  ...await original<typeof import("@/lib/api")>(),
  createGuest: vi.fn(), getProgress: vi.fn(), getMe: vi.fn(), authMethods: vi.fn(),
  listSessions: vi.fn(), currentSession: vi.fn(), endSession: vi.fn(), resumeSession: vi.fn(),
  getTree: vi.fn(), setActiveWorkspace: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const item = (id: string, extra: Partial<api.ProgressItem> = {}): api.ProgressItem => ({
  workspace_id: id, session_id: `session-${id}`, phase: "solve", title: `Problem ${id}`,
  created_at: new Date(Date.now() - 3.5 * 86_400_000).toISOString(), tabs: 3,
  roadmap: "motion_current", stages: [0],
  steps: { entries: [{ item: 0, state: "ok", tries: 1, hint: 0 }], done: true, free: false },
  quizzes: null, next: null, ...extra,
});
const learned = (id: string, extra: Partial<api.ProgressItem> = {}) => item(id, {
  phase: "learn", title: `Lesson ${id}`, steps: null, quizzes: { total: 4, done: 4, first_try: 3 }, ...extra,
});
const opened = () => vi.mocked(track).mock.calls.filter(([event]) => event === "progress_opened");
let assign: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  setLocale("vi");
  window.localStorage.setItem("df-sidebar", "open");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  assign = vi.fn(); reload = vi.fn();
  const realWindow = window;
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, key) {
      if (key === "location") return { href: target.location.href, assign, reload };
      return Reflect.get(target, key);
    },
  }));
  vi.mocked(api.createGuest).mockResolvedValue({ guestId: "g", created: false });
  vi.mocked(api.getProgress).mockResolvedValue({ items: [] });
  vi.mocked(api.getMe).mockResolvedValue({ signed_in: false, profile_needed: false });
  vi.mocked(api.authMethods).mockResolvedValue({ google: false, email: false });
  vi.mocked(api.listSessions).mockResolvedValue({ sessions: [], next_before: null });
  vi.mocked(api.currentSession).mockResolvedValue(null);
  vi.mocked(api.endSession).mockResolvedValue(undefined);
  vi.mocked(api.resumeSession).mockResolvedValue(undefined);
  vi.mocked(api.getTree).mockResolvedValue({ nodes: [], workspaces: [] });
  vi.mocked(api.setActiveWorkspace).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  window.localStorage.removeItem("df-sidebar");
  vi.unstubAllGlobals();
  setLocale("vi");
});

test("groups by topic with generic fallback and keeps API order within and between groups", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: [
    item("new-work", { phase: "practice", roadmap: "work_rate" }),
    item("motion"), item("no-roadmap", { roadmap: null }),
    item("old-work", { roadmap: "work_rate" }), item("unknown", { roadmap: "missing" }),
    item("generic", { roadmap: "generic" }), item("prototype", { roadmap: "toString" }),
    item("no-accepted", { steps: null }), learned("no-quizzes", { quizzes: null }),
  ] });
  render(<Page />);
  const sections = await screen.findAllByRole("region");
  expect(sections.map(section => within(section).getByRole("heading").textContent)).toEqual([
    copy.roadmapTitle.work_rate, copy.roadmapTitle.motion_current, copy.roadmapTitle.generic,
  ]);
  expect(within(sections[0]).getAllByRole("button").map(button => within(button).getByText(/Problem/).textContent)).toEqual(["Problem new-work", "Problem old-work"]);
  expect(within(sections[2]).getAllByRole("button").map(button => within(button).getByText(/Problem/).textContent)).toEqual([
    "Problem no-roadmap", "Problem unknown", "Problem generic", "Problem prototype",
  ]);
  expect(screen.queryByText("Problem no-accepted")).toBeNull();
  expect(screen.queryByRole("heading", { name: copy.progressLearned })).toBeNull();
  expect(screen.getByRole("link", { name: copy.progressNav }).getAttribute("aria-current")).toBe("page");
});

test.each(["vi", "en"] as const)("learn rows show raw first-try counts, titles and dates in %s", async locale => {
  setLocale(locale);
  vi.mocked(api.getProgress).mockResolvedValue({ items: [
    learned("first", { created_at: "2020-10-02T12:00:00Z" }), learned("second", { quizzes: { first_try: 2, total: 3, done: 2 } }),
    learned("none", { quizzes: null }),
  ] });
  render(<Page />);
  const section = await screen.findByRole("region", { name: copy.progressLearned });
  expect(within(section).getAllByRole("button")).toHaveLength(2);
  expect(within(section).getByRole("button", { name: `Lesson first ${copy.progressQuizCount(3, 4)} ${locale === "vi" ? "2 thg 10" : "Oct 2"}` })).toBeTruthy();
  expect(within(section).getByText(copy.progressQuizCount(2, 3))).toBeTruthy();
  expect(screen.getAllByRole("region")).toHaveLength(1);
  expect(screen.queryByText(copy.progressEmpty)).toBeNull();
  expect(opened()).toEqual([]);
});

test("loaded empty page links home and does not track an impression", async () => {
  render(<Page />);
  expect(await screen.findByText(copy.progressEmpty)).toBeTruthy();
  expect(screen.getByRole("link", { name: copy.progressBack }).getAttribute("href")).toBe("/");
  expect(screen.queryByRole("region")).toBeNull();
  expect(opened()).toEqual([]);
});

test("loading is quiet, then tracks the loaded card count once under StrictMode and rerenders", async () => {
  let finish!: (value: { items: api.ProgressItem[] }) => void;
  vi.mocked(api.getProgress).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { rerender } = render(<StrictMode><Page /></StrictMode>);
  await waitFor(() => expect(api.getProgress).toHaveBeenCalledOnce());
  expect(screen.queryByText(copy.progressEmpty)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(opened()).toEqual([]);
  await act(async () => finish({ items: [item("one"), item("two"), learned("lesson")] }));
  rerender(<StrictMode><Page /></StrictMode>);
  expect(opened()).toEqual([["progress_opened", { place: "page", cards: 2 }]]);
});

test("fetch failure has retry instead of empty, and successful retry tracks once", async () => {
  vi.mocked(api.getProgress).mockRejectedValueOnce(Error("offline")).mockResolvedValue({ items: [item("retried")] });
  const { rerender } = render(<StrictMode><Page /></StrictMode>);
  expect((await screen.findByRole("alert")).textContent).toBe(copy.progressError);
  expect(screen.queryByText(copy.progressEmpty)).toBeNull();
  expect(opened()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: copy.progressRetry }));
  expect(await screen.findByRole("button", { name: "Problem retried" })).toBeTruthy();
  expect(api.getProgress).toHaveBeenCalledTimes(2);
  rerender(<StrictMode><Page /></StrictMode>);
  expect(opened()).toEqual([["progress_opened", { place: "page", cards: 1 }]]);
});

test.each([false, true])("card or learn row tracks history and awaits resume before navigating home (learn=%s)", async learn => {
  const data = learn ? learned("open") : item("open", { next: ["Next problem"] });
  let finish!: () => void;
  vi.mocked(api.resumeSession).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  vi.mocked(api.getProgress).mockResolvedValue({ items: [data] });
  render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: learn ? /Lesson open/ : "Problem open Tiếp theo: Next problem" }));
  expect(track).toHaveBeenCalledWith("history_session_viewed", { tabs: 3, age_days: 3 }, "session-open");
  expect(api.resumeSession).toHaveBeenCalledExactlyOnceWith("session-open");
  expect(assign).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(assign).toHaveBeenCalledExactlyOnceWith("/");
  expect(reload).not.toHaveBeenCalled();
});

test("resume failure keeps the card available without navigation", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: [item("unavailable")] });
  vi.mocked(api.resumeSession).mockRejectedValueOnce(Error("offline"));
  render(<Page />);
  const card = await screen.findByRole("button", { name: "Problem unavailable" });
  await act(async () => fireEvent.click(card));
  expect(assign).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Problem unavailable" })).toBe(card);
});

test("sidebar opens even the current session and returns home after resuming", async () => {
  vi.mocked(api.listSessions).mockResolvedValue({ sessions: [{
    id: "current", title: "Current session", current: true, done: true, tabs: [{ phase: "solve" }],
    created_at: new Date().toISOString(), last_active_at: new Date().toISOString(),
  }], next_before: null });
  render(<Page />);
  const button = await screen.findByRole("button", { name: /Current session/ });
  await act(async () => { fireEvent.click(button); });
  expect(api.resumeSession).toHaveBeenCalledExactlyOnceWith("current");
  expect(assign).toHaveBeenCalledExactlyOnceWith("/");
  expect(track).toHaveBeenCalledWith("history_session_viewed", { tabs: 1, age_days: 0 }, "current");
});

const session: NonNullable<Awaited<ReturnType<typeof api.currentSession>>> = {
  sessionId: "current", messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }],
  html: null, tabs: [], activeId: null, sheet: null,
};

test("new problem waits for ending the current session before navigating, and ignores repeat taps", async () => {
  let finish!: () => void;
  vi.mocked(api.currentSession).mockResolvedValue(session);
  vi.mocked(api.endSession).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<Page />);
  const button = screen.getByRole("button", { name: copy.newProblem });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(api.endSession).toHaveBeenCalledExactlyOnceWith("current", "new_problem"));
  expect(api.currentSession).toHaveBeenCalledOnce();
  expect(track).toHaveBeenCalledWith("new_problem_clicked", { turns_in_session: 1 }, "current");
  expect(assign).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(assign).toHaveBeenCalledExactlyOnceWith("/");
});

test("new problem navigates straight home when there is no current session", async () => {
  render(<Page />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.newProblem })));
  expect(api.endSession).not.toHaveBeenCalled();
  expect(assign).toHaveBeenCalledExactlyOnceWith("/");
});

test.each(["current", "end"])("a failed %s request stays on the page and permits a new-problem retry", async failure => {
  vi.mocked(api.currentSession).mockResolvedValue(session);
  if (failure === "current") vi.mocked(api.currentSession).mockRejectedValueOnce(Error("offline"));
  else vi.mocked(api.endSession).mockRejectedValueOnce(Error("offline"));
  render(<Page />);
  fireEvent.click(screen.getByRole("button", { name: copy.newProblem }));
  expect((await screen.findByRole("alert")).textContent).toBe(copy.progressNewFailed);
  expect(assign).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.newProblem })));
  expect(assign).toHaveBeenCalledExactlyOnceWith("/");
});

const treeNode = (id: string, level: api.TreeNode["level"], parent_id: string | null, extra: Partial<api.TreeNode> = {}): api.TreeNode => ({
  id, level, parent_id, name: `Node ${id}`, grades: [], attempts: 0, solo: 0, rate: null, unfinished: 0, learned: 0, last_seen: "2026-11-19T08:00:00Z", ...extra,
});
const treeWs = (id: string, node_id: string, extra: Partial<api.TreeWorkspace> = {}): api.TreeWorkspace => ({
  workspace_id: id, session_id: `session-${id}`, node_id, role: "primary", phase: "solve", title: `Tree ${id}`,
  created_at: new Date(Date.now() - 3.5 * 86_400_000).toISOString(), finished: true, solo: true, ...extra,
});
const sampleTree = (): api.TreeResponse => ({
  nodes: [
    treeNode("math", "subject", null, { name: "Toán", attempts: 4, solo: 2, rate: 0.5, learned: 1 }),
    treeNode("math.q", "topic", "math", { name: "Bậc hai", grades: [9], attempts: 4, solo: 2, rate: 0.5, unfinished: 1 }),
    treeNode("math.q.v", "type", "math.q", { name: "Viète", attempts: 2, solo: 2, rate: 1 }),
  ],
  workspaces: [treeWs("a", "math.q.v"), treeWs("b", "math.q", { finished: false, solo: null, created_at: new Date().toISOString() }), treeWs("c", "math", { phase: "learn", finished: null, solo: null })],
});

test("tree sits above the cards, tracks once with the node count, and shows counts, never a percentage", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: [item("card")] });
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  const { container } = render(<StrictMode><Page /></StrictMode>);
  const tree = await screen.findByRole("region", { name: copy.treeTitle });
  expect(tree.compareDocumentPosition(screen.getByText("Problem card")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(tree).getByText(`${copy.treeAttempts(4, 2)} · ${copy.treeLearned(1)}`)).toBeTruthy();
  expect(within(tree).getByText(`${copy.treeAttempts(4, 2)} · ${copy.treeUnfinished(1)}`)).toBeTruthy();
  expect(within(tree).getByText(copy.treeGrade([9]))).toBeTruthy();
  expect(tree.textContent).not.toMatch(/%|mastery|điểm/i);
  await waitFor(() => expect(vi.mocked(track).mock.calls.filter(([event]) => event === "tree_opened")).toEqual([["tree_opened", { nodes: 3 }]]));
  expect(container.querySelector("[aria-busy]")?.getAttribute("aria-busy")).toBe("false");
});

test("no tree nodes, or a tree that fails to load, leaves the page as before", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: [item("card")] });
  const { unmount } = render(<Page />);
  await screen.findByText("Problem card");
  expect(screen.queryByRole("region", { name: copy.treeTitle })).toBeNull();
  unmount();
  vi.mocked(api.getTree).mockRejectedValue(Error("404"));
  render(<Page />);
  await screen.findByText("Problem card");
  expect(screen.queryByRole("region", { name: copy.treeTitle })).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "tree_opened")).toEqual([]);
});

test("a tree alone is enough: no empty-state message next to it", async () => {
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  render(<Page />);
  await screen.findByRole("region", { name: copy.treeTitle });
  expect(screen.queryByText(copy.progressEmpty)).toBeNull();
});

test("tapping a node lists its subtree workspaces newest first, then a workspace resumes, activates its tab and goes home", async () => {
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  render(<Page />);
  const tree = await screen.findByRole("region", { name: copy.treeTitle });
  const topic = within(tree).getByRole("button", { name: /^Bậc hai/ });
  expect(topic.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(topic);
  expect(topic.getAttribute("aria-expanded")).toBe("true");
  expect(track).toHaveBeenCalledWith("tree_node_clicked", { node_id: "math.q", level: "topic" });
  const list = within(tree).getByRole("list", { name: copy.treeList("Bậc hai") });
  expect(within(list).getAllByRole("button").map(button => within(button).getByText(/Tree/).textContent)).toEqual(["Tree b", "Tree a"]);
  expect(within(list).getByText(copy.treeInProgress)).toBeTruthy();
  fireEvent.click(within(list).getByRole("button", { name: /Tree a/ }));
  expect(track).toHaveBeenCalledWith("tree_workspace_opened", { node_id: "math.q", workspace_id: "a" }, "session-a");
  await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith("/"));
  expect(api.resumeSession).toHaveBeenCalledExactlyOnceWith("session-a");
  expect(api.setActiveWorkspace).toHaveBeenCalledExactlyOnceWith("session-a", "a");
  expect(vi.mocked(track).mock.calls.some(([event]) => event === "history_session_viewed")).toBe(false);
  expect(vi.mocked(api.resumeSession).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.setActiveWorkspace).mock.invocationCallOrder[0]);
});

test("a failed resume keeps the tree on the page", async () => {
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  vi.mocked(api.resumeSession).mockRejectedValueOnce(Error("offline"));
  render(<Page />);
  const tree = await screen.findByRole("region", { name: copy.treeTitle });
  fireEvent.click(within(tree).getByRole("button", { name: /Viète/ }));
  fireEvent.click(within(tree).getByRole("button", { name: /Tree a/ }));
  await waitFor(() => expect(api.resumeSession).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(api.setActiveWorkspace).not.toHaveBeenCalled();
  expect(assign).not.toHaveBeenCalled();
  expect(within(tree).getByRole("button", { name: /Tree a/ })).toBeTruthy();
});

test("the chevron collapses and restores the child rows without opening the node", async () => {
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  render(<Page />);
  const tree = await screen.findByRole("region", { name: copy.treeTitle });
  const toggle = within(tree).getByRole("button", { name: copy.treeToggle("Bậc hai") });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(within(tree).getByRole("button", { name: /Viète/ })).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(within(tree).queryByRole("button", { name: /Viète/ })).toBeNull();
  expect(within(tree).getByRole("button", { name: /^Bậc hai/ }).getAttribute("aria-expanded")).toBe("false");
  expect(track).not.toHaveBeenCalledWith("tree_node_clicked", expect.anything());
  fireEvent.click(toggle);
  expect(within(tree).getByRole("button", { name: /Viète/ })).toBeTruthy();
});

test("a node with no counted solve (rate null) is a dashed hollow dot, rate 0 is a solid ring with a floor fill", async () => {
  vi.mocked(api.getTree).mockResolvedValue({
    nodes: [
      treeNode("s", "subject", null, { name: "Zero", attempts: 2, solo: 0, rate: 0 }),
      treeNode("t", "subject", null, { name: "Hollow", learned: 1, rate: null }),
    ],
    workspaces: [],
  });
  render(<Page />);
  const tree = await screen.findByRole("region", { name: copy.treeTitle });
  const dot = (name: string) => within(tree).getByRole("button", { name: new RegExp(`^${name}`) }).querySelector("span[aria-hidden]") as HTMLElement;
  expect(dot("Hollow").hasAttribute("data-hollow")).toBe(true);
  expect(dot("Hollow").style.getPropertyValue("--fill")).toBe("");
  expect(dot("Zero").hasAttribute("data-hollow")).toBe(false);
  expect(dot("Zero").style.getPropertyValue("--fill")).toBe("15%");
});
