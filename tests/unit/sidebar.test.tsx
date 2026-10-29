import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { copy, setLocale } from "@/lib/copy";
import { track } from "@/lib/track";
import type { SessionList, SessionSummary } from "@/lib/api";

vi.mock("@/lib/track", () => ({ track: vi.fn() }));
const fetchMock = vi.fn();
const side = { mode: "open" as const, drawerOpen: false, toggle: vi.fn(), openDrawer: vi.fn(), closeDrawer: vi.fn() };
let desktop = true;
let signedIn = false;
let enabled = true;
const row = (id: string, current = false): SessionSummary => ({ id, title: id, created_at: new Date().toISOString(), last_active_at: new Date().toISOString(), tabs: [{ phase: "learn" }, { phase: "solve" }], done: true, current });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let first: SessionList;
beforeEach(() => {
  vi.clearAllMocks(); setLocale("vi"); desktop = true; signedIn = false; enabled = true;
  first = { sessions: [row("first", true)], next_before: "cursor&x" };
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: desktop, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  fetchMock.mockImplementation(async (path: string) => {
    if (path === "/api/auth/methods") return json({ email: enabled, google: false });
    if (path === "/api/me") return json({ signed_in: signedIn, name: "Minh", email: "m@example.com" });
    if (path.includes("before=")) return json({ sessions: [row("second")], next_before: null });
    return json(first);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("groups sessions, marks current, renders metadata, and appends the next page", async () => {
  render(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="1" />);
  expect(await screen.findByText(copy.historyToday)).toBeDefined();
  const current = screen.getByRole("button", { name: /first/ });
  expect(current.getAttribute("aria-current")).toBe("true");
  expect(current.getAttribute("title")).toContain(copy.phaseLearn);
  expect(current.getAttribute("title")).toContain(copy.phaseSolve);
  expect(current.getAttribute("title")).toContain(new Date(first.sessions[0].last_active_at).toLocaleString("vi-VN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }));
  expect(screen.getByRole("button", { name: new RegExp(`first.*${copy.phaseLearn}.*${copy.phaseSolve}`) })).toBe(current);
  fireEvent.click(screen.getByRole("button", { name: copy.historyMore }));
  await screen.findByRole("button", { name: /second/ });
  expect(screen.getByRole("button", { name: /first/ })).toBeDefined();
  expect(fetchMock).toHaveBeenCalledWith("/api/sessions?limit=20&before=cursor%26x");
  expect(track).toHaveBeenCalledWith("history_opened", { sessions: 1 });
});
it.each([404, "network"])("quietly handles %s list failures", async (failure) => {
  fetchMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/sessions")) {
      if (failure === "network") throw Error("offline");
      return json({}, 404);
    }
    return json({ email: false, google: false, signed_in: false });
  });
  render(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="1" />);
  await screen.findByText(copy.historyEmpty);
  expect(screen.queryByRole("alert")).toBeNull();
});
it.each([[false, true, true], [true, true, false], [false, false, false]])("guest banner for signedIn=%s enabled=%s", async (signed, method, banner) => {
  signedIn = signed; enabled = method;
  render(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="1" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(!!screen.queryByText(copy.historyGuest)).toBe(banner);
  if (banner) {
    fireEvent.click(screen.getAllByRole("button", { name: copy.historyLogin })[0]);
    expect(screen.getByRole("dialog")).toBeDefined();
  }
});
it("rail has an accessible new-problem icon, no list fetch", async () => {
  const newProblem = vi.fn();
  render(<Sidebar side={{ ...side, mode: "rail" }} onNewProblem={newProblem} refreshKey="1" />);
  fireEvent.click(screen.getByRole("button", { name: copy.newProblem }));
  expect(newProblem).toHaveBeenCalledOnce();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("first")).toBeNull();
});
function Phone({ onOpen = vi.fn(), onNew = vi.fn() }) {
  const state = useSidebar();
  return <Sidebar side={state} onNewProblem={onNew} onOpenSession={onOpen} refreshKey="1" />;
}
it.each(["Escape", "scrim", "session", "new"])("phone closes via %s and restores focus", async (action) => {
  desktop = false;
  const onOpen = vi.fn(); const onNew = vi.fn();
  if (action === "session") first = { sessions: [row("first")], next_before: null }; // not the current one
  render(<Phone onOpen={onOpen} onNew={onNew} />);
  const menu = screen.getByRole("button", { name: copy.historyOpen });
  fireEvent.click(menu);
  await screen.findByRole("button", { name: /first/ });
  expect(document.activeElement).not.toBe(menu);
  if (action === "Escape") fireEvent.keyDown(document, { key: "Escape" });
  if (action === "scrim") fireEvent.click(screen.getByRole("button", { name: copy.historyClose }));
  if (action === "session") fireEvent.click(screen.getByRole("button", { name: /first/ }));
  if (action === "new") fireEvent.click(screen.getByRole("button", { name: copy.newProblem }));
  expect(screen.queryByRole("button", { name: /first/ })).toBeNull();
  expect(document.activeElement).toBe(menu);
  if (action === "session") expect(onOpen).toHaveBeenCalledWith("first");
  if (action === "new") expect(onNew).toHaveBeenCalledOnce();
});
it("choosing the current session only closes the drawer", async () => {
  desktop = false;
  const onOpen = vi.fn();
  render(<Phone onOpen={onOpen} />);
  fireEvent.click(screen.getByRole("button", { name: copy.historyOpen }));
  fireEvent.click(await screen.findByRole("button", { name: /first/ }));
  expect(onOpen).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: /first/ })).toBeNull();
});
it("disables new problem and every session while a turn is streaming", async () => {
  render(<Sidebar side={{ mode: "open", drawerOpen: false, toggle: vi.fn(), openDrawer: vi.fn(), closeDrawer: vi.fn() }} onNewProblem={vi.fn()} refreshKey="1" busy />);
  expect((await screen.findByRole("button", { name: /first/ }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: copy.newProblem }) as HTMLButtonElement).disabled).toBe(true);
});
it("refetches on refreshKey and ignores stale responses", async () => {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementation((path: string) => path.startsWith("/api/sessions")
    ? new Promise<Response>(r => { resolve = r; }) : Promise.resolve(json({ email: false, signed_in: false })));
  const { rerender } = render(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="1" />);
  const old = resolve;
  rerender(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="2" />);
  resolve(json({ sessions: [row("latest")], next_before: null }));
  await screen.findByText("latest");
  old(json(first));
  await waitFor(() => expect(screen.queryByText("first")).toBeNull());
});
it("tracks every phone opening with the first-page count and keeps focus inside", async () => {
  desktop = false;
  render(<Phone />);
  const menu = screen.getByRole("button", { name: copy.historyOpen });
  for (let i = 0; i < 2; i++) {
    fireEvent.click(menu);
    await screen.findByText("first");
    const drawer = screen.getByRole("dialog", { name: copy.historyLabel });
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(drawer.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
  }
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "history_opened")).toEqual([
    ["history_opened", { sessions: 1 }], ["history_opened", { sessions: 1 }],
  ]);
});
it("does not fetch while hidden, then fetches the latest refreshKey when expanded", async () => {
  const { rerender } = render(<Sidebar side={{ ...side, mode: "rail" }} onNewProblem={vi.fn()} refreshKey="1" />);
  rerender(<Sidebar side={{ ...side, mode: "rail" }} onNewProblem={vi.fn()} refreshKey="2" />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  rerender(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="2" />);
  await screen.findByText("first");
  expect(fetchMock.mock.calls.filter(([path]) => path.startsWith("/api/sessions"))).toHaveLength(1);
});
it("ignores stale pagination after refreshing the first page", async () => {
  let finish!: (response: Response) => void;
  const { rerender } = render(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="1" />);
  await screen.findByText("first");
  fetchMock.mockImplementation((path: string) => path.includes("before=")
    ? new Promise<Response>(r => { finish = r; }) : Promise.resolve(json({ sessions: [row("latest")], next_before: null })));
  fireEvent.click(screen.getByRole("button", { name: copy.historyMore }));
  rerender(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="2" />);
  await screen.findByText("latest");
  finish(json({ sessions: [row("stale")], next_before: null }));
  await waitFor(() => expect(screen.queryByText("stale")).toBeNull());
});
it("uses the untitled fallback and keeps the account sheet open for the first Escape", async () => {
  desktop = false;
  first = { sessions: [{ ...row("untitled"), title: null }], next_before: null };
  render(<Phone />);
  fireEvent.click(screen.getByRole("button", { name: copy.historyOpen }));
  await screen.findByText(copy.historyUntitled);
  fireEvent.click(screen.getAllByRole("button", { name: copy.historyLogin })[0]);
  expect(screen.getAllByRole("dialog")).toHaveLength(2);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("reveals a failed-login sheet inside the phone drawer and clears it when the drawer closes", async () => {
  desktop = false;
  window.history.replaceState(null, "", "/?login=failed");
  render(<Phone />);
  await screen.findByRole("alert");
  await screen.findByRole("dialog", { name: copy.historyLabel });
  expect(screen.getByRole("button", { name: copy.historyOpen }).getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: copy.historyClose }));
  fireEvent.click(screen.getByRole("button", { name: copy.historyOpen }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});
it("does not count refreshes inside an already open phone drawer as new openings", async () => {
  desktop = false;
  const openSide = { ...side, drawerOpen: true };
  const { rerender } = render(<Sidebar side={openSide} onNewProblem={vi.fn()} refreshKey="1" />);
  await screen.findByText("first");
  const openings = vi.mocked(track).mock.calls.length;
  rerender(<Sidebar side={openSide} onNewProblem={vi.fn()} refreshKey="2" />);
  await waitFor(() => expect(fetchMock.mock.calls.filter(([path]) => path.startsWith("/api/sessions"))).toHaveLength(2));
  await screen.findByText("first");
  expect(vi.mocked(track).mock.calls).toHaveLength(openings);
});

it("choosing another session resumes it then reloads; the current one does nothing", async () => {
  const reload = vi.fn();
  const realWindow = window;
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, key) {
      if (key === "location") return { href: target.location.href, reload };
      return Reflect.get(target, key);
    },
  }));
  first = { sessions: [row("here", true), row("older")], next_before: null };
  render(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="1" />);
  fireEvent.click(await screen.findByRole("button", { name: /here/ }));
  expect(fetchMock.mock.calls.some(([path]) => String(path).includes("/resume"))).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /older/ }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  const resume = fetchMock.mock.calls.find(([path]) => String(path) === "/api/sessions/older/resume");
  expect(resume?.[1]?.method).toBe("POST");
});
it("opening a past session tracks its tab count and age in whole days, but the current one does not", async () => {
  const old = new Date(Date.now() - 3.5 * 86_400_000).toISOString();
  first = { sessions: [row("first", true), { ...row("second"), created_at: old }], next_before: null };
  const onOpen = vi.fn();
  render(<Sidebar side={side} onNewProblem={vi.fn()} refreshKey="1" onOpenSession={onOpen} />);
  fireEvent.click(await screen.findByRole("button", { name: /second/ }));
  expect(onOpen).toHaveBeenCalledWith("second");
  expect(track).toHaveBeenCalledWith("history_session_viewed", { tabs: 2, age_days: 3 }, "second");
  fireEvent.click(screen.getByRole("button", { name: /first/ }));
  expect(track).toHaveBeenCalledTimes(1); // the past-session view only
});
