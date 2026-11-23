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
    id: "current", title: "Current session", current: true, done: true, project_id: null, tabs: [{ phase: "solve" }],
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
  id, level, parent_id, name: `Node ${id}`, grades: [], attempts: 0, solo: 0, rate: null, unfinished: 0, learned: 0, packs: 0, last_seen: "2026-11-19T08:00:00Z", ...extra,
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
    treeNode("space", "subject", null, { name: "Thiên văn học", learned: 1 }),
  ],
  workspaces: [treeWs("a", "math.q.v"), treeWs("b", "math.q"), treeWs("c", "math", { phase: "learn" }), treeWs("d", "space", { phase: "learn" })],
});
// Progress items that match sampleTree's workspaces: a and b are cards, c and d are lessons.
const sampleItems = () => [item("a"), item("b"), learned("c"), learned("d")];
const treeitem = (name: string) => screen.getByRole("treeitem", { name });
const cardTitles = () => screen.queryAllByText(/^Problem /).map(el => el.textContent);

test("the map and the activity list sit side by side, track once with the node count, and show no percentage", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: sampleItems() });
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  const { container } = render(<StrictMode><Page /></StrictMode>);
  const tree = await screen.findByRole("region", { name: copy.treeTitle });
  expect(within(tree).getByRole("tree", { name: copy.treeRoot })).toBeTruthy();
  expect(within(tree).getAllByRole("treeitem").map(el => el.textContent)).toEqual([copy.treeRoot, "Toán", "Bậc hai", "Viète", "Thiên văn học"]);
  expect(tree.compareDocumentPosition(screen.getByText("Problem a")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(cardTitles()).toEqual(["Problem a", "Problem b"]);
  expect(screen.queryByText(/Đang xem/)).toBeNull();
  expect(tree.textContent).not.toMatch(/%|mastery|điểm/i);
  await waitFor(() => expect(vi.mocked(track).mock.calls.filter(([event]) => event === "tree_opened")).toEqual([["tree_opened", { nodes: 4 }]]));
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

test("selecting a node narrows cards and lessons to its subtree, shows its counts, and the cross clears it", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: sampleItems() });
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  render(<Page />);
  await screen.findByRole("region", { name: copy.treeTitle });
  expect(screen.getByRole("heading", { name: copy.progressLearned })).toBeTruthy();
  fireEvent.click(treeitem("Bậc hai"));
  expect(track).toHaveBeenCalledWith("tree_node_clicked", { node_id: "math.q", level: "topic" });
  expect(screen.getByText(copy.treeViewing("Bậc hai"))).toBeTruthy();
  expect(screen.getByText(`${copy.treeAttempts(4, 2)} · ${copy.treeUnfinished(1)}`)).toBeTruthy();
  expect(cardTitles()).toEqual(["Problem a", "Problem b"]);
  expect(screen.queryByRole("heading", { name: copy.progressLearned })).toBeNull();
  expect(treeitem("Bậc hai").getAttribute("aria-selected")).toBe("true");
  fireEvent.click(treeitem("Viète"));
  expect(cardTitles()).toEqual(["Problem a"]);
  fireEvent.click(treeitem("Toán"));
  expect(screen.getByText("Lesson c")).toBeTruthy();
  expect(screen.queryByText("Lesson d")).toBeNull();
  fireEvent.click(treeitem("Thiên văn học"));
  expect(cardTitles()).toEqual([]);
  expect(screen.getByText("Lesson d")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: copy.treeClear }));
  expect(screen.queryByText(/Đang xem/)).toBeNull();
  expect(cardTitles()).toEqual(["Problem a", "Problem b"]);
  expect(screen.getByText("Lesson c")).toBeTruthy();
  expect(screen.getByText("Lesson d")).toBeTruthy();
});

test("clicking the root clears the selection, and a node without work says so", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: [item("a")] });
  const tree = sampleTree();
  tree.nodes.push(treeNode("void", "subject", null, { name: "Trống" }));
  vi.mocked(api.getTree).mockResolvedValue(tree);
  render(<Page />);
  await screen.findByRole("region", { name: copy.treeTitle });
  fireEvent.click(treeitem("Trống"));
  expect(screen.getByText(copy.treeNoneHere)).toBeTruthy();
  fireEvent.click(treeitem(copy.treeRoot));
  expect(screen.queryByText(copy.treeNoneHere)).toBeNull();
  expect(screen.queryByText(/Đang xem/)).toBeNull();
  expect(cardTitles()).toEqual(["Problem a"]);
});

test("a selected node also lists workspaces the cards and lessons skip (learn without quizzes, unfinished solve), newest first, and they resume", async () => {
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const tree = sampleTree();
  tree.workspaces.push(
    treeWs("e", "math.q", { phase: "learn", finished: null, solo: null, title: "Learn e", created_at: day(5) }),
    treeWs("f", "math.q.v", { phase: "solve", finished: false, solo: null, title: "Solve f", created_at: day(1) }),
    treeWs("g", "space", { phase: "practice", title: "Practice g" }),
  );
  // Only a and c have progress items. b, e and f have none; d and g sit outside the selected subtree.
  vi.mocked(api.getProgress).mockResolvedValue({ items: [item("a"), learned("c")] });
  vi.mocked(api.getTree).mockResolvedValue(tree);
  render(<Page />);
  await screen.findByRole("region", { name: copy.treeTitle });
  expect(screen.queryByText("Solve f")).toBeNull(); // the unfiltered view stays as it was
  expect(screen.queryByRole("heading", { name: copy.treeRest })).toBeNull();
  fireEvent.click(treeitem("Bậc hai"));
  const rest = screen.getByRole("heading", { name: copy.treeRest }).closest("section")!;
  expect(within(rest).getAllByRole("button").map(button => within(button).getByText(/^(Solve|Learn|Tree) /).textContent)).toEqual(["Solve f", "Tree b", "Learn e"]);
  expect(within(rest).getByText(copy.treeInProgress)).toBeTruthy();
  expect(within(rest).getAllByText(copy.treeKind.solve)).toHaveLength(2); // f and b
  expect(within(rest).getByText(copy.treeKind.learn)).toBeTruthy();
  expect(cardTitles()).toEqual(["Problem a"]); // b has no progress item either, so it is a row above
  expect(screen.queryByText(copy.treeNoneHere)).toBeNull();
  expect(screen.queryByText("Practice g")).toBeNull();
  fireEvent.click(within(rest).getByText("Solve f"));
  expect(track).toHaveBeenCalledWith("tree_workspace_opened", { node_id: "math.q", workspace_id: "f" }, "session-f");
  await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith("/"));
  expect(api.setActiveWorkspace).toHaveBeenCalledExactlyOnceWith("session-f", "f");
  fireEvent.click(screen.getByRole("button", { name: copy.treeClear }));
  expect(screen.queryByText("Solve f")).toBeNull();
});

test("with a node selected a card resumes its session, activates its tab and tracks the tree event, not history_session_viewed", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: sampleItems() });
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  render(<Page />);
  await screen.findByRole("region", { name: copy.treeTitle });
  fireEvent.click(treeitem("Bậc hai"));
  fireEvent.click(screen.getByText("Problem a"));
  expect(track).toHaveBeenCalledWith("tree_workspace_opened", { node_id: "math.q", workspace_id: "a" }, "session-a");
  await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith("/"));
  expect(api.resumeSession).toHaveBeenCalledExactlyOnceWith("session-a");
  expect(api.setActiveWorkspace).toHaveBeenCalledExactlyOnceWith("session-a", "a");
  expect(vi.mocked(track).mock.calls.some(([event]) => event === "history_session_viewed")).toBe(false);
  expect(vi.mocked(api.resumeSession).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.setActiveWorkspace).mock.invocationCallOrder[0]);
});

test("with nothing selected a card opens as before", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: sampleItems() });
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  render(<Page />);
  await screen.findByRole("region", { name: copy.treeTitle });
  fireEvent.click(screen.getByText("Problem a"));
  await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith("/"));
  expect(api.setActiveWorkspace).not.toHaveBeenCalled();
  expect(vi.mocked(track).mock.calls.some(([event]) => event === "tree_workspace_opened")).toBe(false);
  expect(vi.mocked(track).mock.calls.some(([event]) => event === "history_session_viewed")).toBe(true);
});

test("a failed resume keeps the page and the selection", async () => {
  vi.mocked(api.getProgress).mockResolvedValue({ items: sampleItems() });
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  vi.mocked(api.resumeSession).mockRejectedValueOnce(Error("offline"));
  render(<Page />);
  await screen.findByRole("region", { name: copy.treeTitle });
  fireEvent.click(treeitem("Viète"));
  fireEvent.click(screen.getByText("Problem a"));
  await waitFor(() => expect(api.resumeSession).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(api.setActiveWorkspace).not.toHaveBeenCalled();
  expect(assign).not.toHaveBeenCalled();
  expect(screen.getByText("Problem a")).toBeTruthy();
  expect(treeitem("Viète").getAttribute("aria-selected")).toBe("true");
});

test("on a phone the map comes first and tapping a node scrolls to the filtered list", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.mocked(api.getProgress).mockResolvedValue({ items: sampleItems() });
  vi.mocked(api.getTree).mockResolvedValue(sampleTree());
  render(<Page />);
  const tree = await screen.findByRole("region", { name: copy.treeTitle });
  expect(tree.compareDocumentPosition(screen.getByText("Problem a")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(treeitem("Viète"));
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(cardTitles()).toEqual(["Problem a"]);
  fireEvent.click(screen.getByRole("button", { name: copy.treeClear }));
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});
