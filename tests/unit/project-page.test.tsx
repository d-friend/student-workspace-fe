import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProjectPage } from "@/app/projects/ProjectPage";
import * as api from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { readPhoto } from "@/lib/photo";
import { track } from "@/lib/track";
import { MATH, mapNodeView, mathProject, mathReader, projectsFixture, sessionsFixture } from "../../src/app/dev/fixtures/projects/projectsFixture";

// Next keeps useSearchParams in step with pushState and the back gesture; the mock does the same from the real jsdom history.
const nav = vi.hoisted(() => ({ search: "", listeners: new Set<() => void>() }));
const setSearch = (value: string) => { nav.search = value; nav.listeners.forEach(l => l()); };
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }),
    useSearchParams: () => {
      useSyncExternalStore(cb => { nav.listeners.add(cb); return () => { nav.listeners.delete(cb); }; }, () => nav.search, () => nav.search);
      return new URLSearchParams(nav.search);
    },
  };
});
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api", async original => ({
  ...await original<typeof import("@/lib/api")>(),
  createGuest: vi.fn(), getMe: vi.fn(), authMethods: vi.fn(), listSessions: vi.fn(), listProjects: vi.fn(), currentSession: vi.fn(),
  endSession: vi.fn(), resumeSession: vi.fn(), getProject: vi.fn(), getReader: vi.fn(), createPack: vi.fn(), getPack: vi.fn(),
  retryPack: vi.fn(), setPackSubject: vi.fn(), getMapNode: vi.fn(), getReview: vi.fn(), getReviewCount: vi.fn(), answerReview: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/photo", async original => ({ ...await original<typeof import("@/lib/photo")>(), readPhoto: vi.fn() }));

const realWindow = window;
const realPush = realWindow.history.pushState.bind(realWindow.history);
const onPop = () => setSearch(realWindow.location.search.slice(1));
let assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  realWindow.history.replaceState(null, "", "/");
  setSearch("");
  vi.spyOn(realWindow.history, "pushState").mockImplementation((state, unused, url) => { realPush(state, unused, url); onPop(); });
  realWindow.addEventListener("popstate", onPop);
  sessionStorage.clear();
  setLocale("vi");
  window.localStorage.setItem("df-sidebar", "open");
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: !query.includes("max-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  assign = vi.fn();
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, key) { return key === "location" ? { href: target.location.href, assign, reload: vi.fn() } : Reflect.get(target, key); },
  }));
  vi.mocked(api.createGuest).mockResolvedValue({ guestId: "g", created: false });
  vi.mocked(api.getMe).mockResolvedValue({ signed_in: false, profile_needed: false });
  vi.mocked(api.authMethods).mockResolvedValue({ google: false, email: false });
  vi.mocked(api.listSessions).mockResolvedValue({ sessions: sessionsFixture.filter(s => s.project_id === MATH), next_before: null });
  vi.mocked(api.listProjects).mockResolvedValue(projectsFixture);
  vi.mocked(api.getProject).mockResolvedValue(mathProject);
  vi.mocked(api.getReader).mockResolvedValue(mathReader);
  vi.mocked(api.getMapNode).mockImplementation(async id => mapNodeView(id)!);
  vi.mocked(api.getReviewCount).mockResolvedValue([]);
  vi.mocked(api.currentSession).mockResolvedValue(null);
  vi.mocked(api.endSession).mockResolvedValue(undefined);
  vi.mocked(api.resumeSession).mockResolvedValue(undefined);
  vi.mocked(readPhoto).mockResolvedValue({ data: "QUJD", bytes: 3, width: 1, height: 1, processMs: 1 });
});
afterEach(() => { cleanup(); realWindow.removeEventListener("popstate", onPop); vi.restoreAllMocks(); window.localStorage.removeItem("df-sidebar"); vi.unstubAllGlobals(); setLocale("vi"); });

const uploadInput = () => screen.getByLabelText(copy.packUploadHint) as HTMLInputElement;
const files = (n: number) => Array.from({ length: n }, (_, i) => new File(["x"], `${i}.jpg`, { type: "image/jpeg" }));
const file = (id: string): api.Pack["files"][number] => ({ id, ordinal: 0, status: "ok", media_type: "image/jpeg" });
const readyPack = (extra: Partial<api.Pack> = {}): api.Pack => ({
  id: "p9", status: "ready", error: null, subject: { id: "math", name: "Toán", by: "student", confidence: null }, guesses: null, project_id: MATH,
  created_at: "2026-11-24T10:00:00Z", updated_at: "2026-11-24T10:00:00Z", photos: 1, concepts: 2,
  files: [file("f1")], blocks: [], nodes: [{ id: "n1", name: "Hệ thức Viète", role: "concept", created: true }, { id: "n2", name: "Biệt thức Δ", role: "concept", created: false }], ...extra,
});
const loaded = async () => {
  render(<ProjectPage />);
  await screen.findByRole("heading", { level: 1 });
  await waitFor(() => expect(screen.queryByRole("status", { name: copy.loadingProject })).toBeNull()); // a slow load holds its skeleton for 300 ms
};

test("a project that does not exist, or fails to load, says so", async () => {
  vi.mocked(api.getProject).mockRejectedValueOnce(new api.ApiError(404, "not_found", "x"));
  render(<ProjectPage />);
  expect((await screen.findByRole("alert")).textContent).toBe(copy.projectNotFound);
  cleanup();
  vi.mocked(api.getProject).mockRejectedValueOnce(new api.ApiError(500, "x", "x"));
  render(<ProjectPage />);
  expect((await screen.findByRole("alert")).textContent).toBe(copy.projectLoadFailed);
});

test("the page opens on the overview: it reports it as sessions, loads the sessions at once and the notes reader only when it is opened", async () => {
  await loaded();
  expect(track).toHaveBeenCalledWith("project_tab_viewed", { project_id: MATH, tab: "sessions" });
  await waitFor(() => expect(api.listSessions).toHaveBeenCalledWith(undefined, 20, MATH));
  expect(api.getReader).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: new RegExp(copy.projectNotesRow) }));
  await waitFor(() => expect(api.getReader).toHaveBeenCalledWith(MATH));
  expect(track).toHaveBeenCalledWith("project_tab_viewed", { project_id: MATH, tab: "sources" });
  fireEvent.click(screen.getByRole("button", { name: copy.projectBack("Toán") }));
  await screen.findByRole("heading", { level: 1, name: "Toán" });
  fireEvent.click(screen.getByRole("button", { name: new RegExp(copy.projectNotesRow) }));
  await screen.findByRole("heading", { level: 1, name: copy.projectNotesRow });
  expect(api.getReader).toHaveBeenCalledTimes(1); // opening it again does not ask again
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "project_tab_viewed").map(([, props]) => (props as { tab: string }).tab)).toEqual(["sessions", "sources", "sessions", "sources"]);
});

test("Xem opens the map and pushes a history entry, so the back gesture returns to the overview", async () => {
  await loaded();
  const before = realWindow.history.length;
  fireEvent.click(screen.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }));
  await screen.findByRole("heading", { level: 1, name: copy.projectMapRow });
  expect(realWindow.history.length).toBe(before + 1);
  expect(realWindow.location.search).toBe("?tab=map");
  expect(track).toHaveBeenCalledWith("project_tab_viewed", { project_id: MATH, tab: "map" });
  await act(async () => { realWindow.history.back(); });
  await screen.findByRole("heading", { level: 1, name: "Toán" });
  expect(realWindow.location.search).toBe("");
  expect(screen.getByRole("heading", { level: 2, name: copy.projectRecent })).toBeDefined();
});

test("← subject lands on the overview even after map > Xem nguồn, going back past both entries", async () => {
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }));
  fireEvent.click(await screen.findByRole("treeitem", { name: "Hệ thức Viète" }));
  await act(async () => fireEvent.click(await screen.findByRole("button", { name: copy.packViewSource })));
  await screen.findByRole("heading", { level: 1, name: copy.projectNotesRow });
  expect(realWindow.history.state?.subjectDepth).toBe(2);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.projectBack("Toán") })));
  await screen.findByRole("heading", { level: 1, name: "Toán" });
  expect(realWindow.location.search).toBe("");
  expect(realWindow.history.state?.subjectDepth ?? 0).toBe(0);
});

test("a link straight to ?tab=map has no overview entry behind it: ← subject replaces it instead of going back out of the page", async () => {
  realWindow.history.replaceState(null, "", "/?tab=map");
  setSearch("tab=map");
  await loaded();
  await screen.findByRole("heading", { level: 1, name: copy.projectMapRow });
  const before = realWindow.history.length;
  fireEvent.click(screen.getByRole("button", { name: copy.projectBack("Toán") }));
  expect(realWindow.location.search).toBe("");
  setSearch("");
  await screen.findByRole("heading", { level: 2, name: copy.projectRecent });
  expect(realWindow.history.length).toBe(before);
});

test("opened straight on the map, then Xem nguồn: ← subject still shows the overview, by replacing the entry (there is none behind)", async () => {
  realWindow.history.replaceState(null, "", "/?tab=map");
  setSearch("tab=map");
  await loaded();
  fireEvent.click(await screen.findByRole("treeitem", { name: "Hệ thức Viète" }));
  await act(async () => fireEvent.click(await screen.findByRole("button", { name: copy.packViewSource })));
  await screen.findByRole("heading", { level: 1, name: copy.projectNotesRow });
  const before = realWindow.history.length;
  fireEvent.click(screen.getByRole("button", { name: copy.projectBack("Toán") }));
  expect(realWindow.location.search).toBe("");
  setSearch("");
  await screen.findByRole("heading", { level: 2, name: copy.projectRecent });
  expect(realWindow.history.length).toBe(before); // nothing was pushed, and it did not go back out of the page
});

test("the old ?tab=sessions link shows the overview", async () => {
  setSearch("tab=sessions");
  await loaded();
  expect(screen.getByRole("heading", { level: 2, name: copy.projectRecent })).toBeDefined();
});

test("?tab=sources opens the notes straight away", async () => {
  setSearch("tab=sources");
  await loaded();
  await screen.findByRole("img", { name: copy.packPhotoAlt(1) });
  expect(track).toHaveBeenCalledWith("project_tab_viewed", { project_id: MATH, tab: "sources" });
});

test("Cập nhật vở uploads into the project, opens the sheet without asking for a subject, and reloads the project when it settles", async () => {
  vi.mocked(api.createPack).mockResolvedValue(readyPack());
  await loaded();
  expect(api.getProject).toHaveBeenCalledTimes(1);
  fireEvent.change(uploadInput(), { target: { files: files(2) } });
  await screen.findByRole("dialog");
  expect(api.createPack).toHaveBeenCalledWith(["QUJD", "QUJD"], MATH);
  expect(screen.queryByText(copy.packAskSubject)).toBeNull();
  await waitFor(() => expect(api.getProject).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("status").textContent).toBe(copy.packDone(1, 1));
});

test("inside the project the finished sheet does not offer to open the subject it is already in, nor announce it", async () => {
  vi.mocked(api.createPack).mockResolvedValue(readyPack());
  await loaded();
  fireEvent.change(uploadInput(), { target: { files: files(1) } });
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe(copy.packDone(1, 1)));
  expect(screen.queryByRole("link", { name: copy.packOpenProject })).toBeNull();
  expect(screen.queryByText(/Đã xếp vào môn/)).toBeNull();
  expect(screen.getByRole("button", { name: copy.packClose })).toBeDefined();
});

test("more than ten photos are refused before anything is read; an unreadable one is named", async () => {
  await loaded();
  fireEvent.change(uploadInput(), { target: { files: files(11) } });
  expect((await screen.findByRole("alert")).textContent).toBe(copy.packTooMany(10));
  expect(readPhoto).not.toHaveBeenCalled();
  vi.mocked(readPhoto).mockRejectedValueOnce(Error("decode"));
  fireEvent.change(uploadInput(), { target: { files: files(2) } });
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(copy.packUnreadablePhotos));
  expect(api.createPack).not.toHaveBeenCalled();
});

test("a server that has no pack models disables the upload with a short message", async () => {
  vi.mocked(api.createPack).mockRejectedValue(new api.ApiError(503, "packs_unavailable", "off"));
  await loaded();
  fireEvent.change(uploadInput(), { target: { files: files(1) } });
  expect((await screen.findByRole("alert")).textContent).toBe(copy.packUnavailable);
  expect((screen.getByRole("button", { name: copy.projectAddLabel }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the project's packs are listed above the notes", async () => {
  setSearch("tab=sources");
  await loaded();
  await screen.findByText(copy.packListTitle);
  expect(screen.getAllByRole("link").filter(a => a.getAttribute("href")?.startsWith("/packs/")).map(a => a.getAttribute("href")))
    .toEqual(mathProject.packs.map(p => `/packs/${p.id}?via=list`));
});

const typeIn = (value: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value } });
const send = () => act(async () => fireEvent.click(screen.getByRole("button", { name: copy.send })));
const attachPhotos = async (n: number) => {
  const input = document.querySelector("input[type=file]:not([capture])") as HTMLInputElement;
  fireEvent.change(input, { target: { files: files(n) } });
  await waitFor(() => expect(screen.getAllByRole("img", { name: copy.photoChip })).toHaveLength(n));
};

test("Gửi ends the open problem and starts on home in the project with the text", async () => {
  vi.mocked(api.currentSession).mockResolvedValue({ sessionId: "old", messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] } as never);
  await loaded();
  typeIn("Tính góc A & B");
  await send();
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(api.endSession).toHaveBeenCalledWith("old", "new_problem");
  const url = new URL(assign.mock.calls[0][0] as string, "http://x");
  expect([url.pathname, url.searchParams.get("project"), url.searchParams.get("q"), url.searchParams.get("via")]).toEqual(["/", MATH, "Tính góc A & B", null]);
  expect(track).toHaveBeenCalledWith("new_problem_clicked", { turns_in_session: 1 }, "old");
  expect(sessionStorage.getItem("dfriend.handoff.photos")).toBeNull();
});

test("Gửi with photos stores them for home and sends them with the text; photos alone send no q", async () => {
  await loaded();
  await attachPhotos(2);
  await send(); // photos alone
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(JSON.parse(sessionStorage.getItem("dfriend.handoff.photos")!)).toEqual(["data:image/jpeg;base64,QUJD", "data:image/jpeg;base64,QUJD"]);
  const alone = new URL(assign.mock.calls[0][0] as string, "http://x");
  expect([alone.searchParams.get("project"), alone.searchParams.has("q")]).toEqual([MATH, false]);
});

test("Gửi with text and a photo sends both", async () => {
  await loaded();
  await attachPhotos(1);
  typeIn("Giải giúp mình");
  await send();
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(new URL(assign.mock.calls[0][0] as string, "http://x").searchParams.get("q")).toBe("Giải giúp mình");
  expect(JSON.parse(sessionStorage.getItem("dfriend.handoff.photos")!)).toHaveLength(1);
});

test("if the browser refuses the photos, nothing navigates and the composer keeps the text and the photos", async () => {
  vi.mocked(api.currentSession).mockResolvedValue({ sessionId: "old", messages: [] } as never);
  await loaded();
  await attachPhotos(2);
  typeIn("Bài này khó");
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
  await send();
  expect((await screen.findByRole("alert")).textContent).toBe(copy.projectPhotoSaveFailed);
  expect(assign).not.toHaveBeenCalled();
  expect(api.endSession).not.toHaveBeenCalled(); // the open problem is still there
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Bài này khó");
  expect(screen.getAllByRole("img", { name: copy.photoChip })).toHaveLength(2);
  expect((screen.getByRole("button", { name: copy.send }) as HTMLButtonElement).disabled).toBe(false);
});

test("Gửi stays put, says so, keeps the composer and leaves no photos behind when the open problem cannot be ended", async () => {
  vi.mocked(api.currentSession).mockRejectedValue(Error("down"));
  await loaded();
  await attachPhotos(1);
  typeIn("Bài mới");
  await send();
  expect((await screen.findByRole("alert")).textContent).toBe(copy.projectNewFailed);
  expect(assign).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("dfriend.handoff.photos")).toBeNull(); // the next visit to home must not send them
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Bài mới");
  expect(screen.getAllByRole("img", { name: copy.photoChip })).toHaveLength(1);
});

test("opening a session of the project resumes it and goes home; a failure says so", async () => {
  await loaded();
  const panel = await screen.findByRole("heading", { level: 2, name: copy.projectRecent }).then(h => h.parentElement!);
  await within(panel).findByRole("button", { name: /Hai vòi nước/ });
  const row = (title: RegExp) => within(panel).getAllByRole("button").find(b => title.test(b.textContent ?? ""))!;
  await act(async () => fireEvent.click(row(/^Tìm/)));
  await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  expect(api.resumeSession).toHaveBeenCalledWith("s4");
  vi.mocked(api.resumeSession).mockRejectedValueOnce(Error("x"));
  assign.mockClear();
  await act(async () => fireEvent.click(row(/^Hai vòi nước/)));
  expect((await screen.findAllByRole("alert")).some(a => a.textContent === copy.projectSessionOpenFailed)).toBe(true);
  expect(assign).not.toHaveBeenCalled();
});

test("Học thêm on a passage ends the open problem and hands the message and the project to home, without counting a new problem", async () => {
  setSearch("tab=sources");
  vi.mocked(api.currentSession).mockResolvedValue({ sessionId: "old", messages: [] } as never);
  await loaded();
  await screen.findByRole("img", { name: copy.packPhotoAlt(1) });
  fireEvent.click(document.getElementById("block-b5")!);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore })));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(api.endSession).toHaveBeenCalledWith("old", "new_problem");
  const url = new URL(assign.mock.calls[0][0] as string, "http://x");
  expect(url.pathname).toBe("/");
  expect(url.searchParams.get("via")).toBe("pack_learn_more");
  expect(url.searchParams.get("project")).toBe(MATH);
  expect(url.searchParams.get("q")).toContain("Mình muốn hiểu kĩ hơn: Phương trình bậc hai.");
  expect(vi.mocked(track).mock.calls.some(([event]) => event === "new_problem_clicked")).toBe(false);
});

test("Học thêm stays put and says so when the open problem cannot be ended", async () => {
  setSearch("tab=sources");
  vi.mocked(api.currentSession).mockRejectedValue(Error("down"));
  await loaded();
  await screen.findByRole("img", { name: copy.packPhotoAlt(1) });
  fireEvent.click(document.getElementById("block-b5")!);
  fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore }));
  expect((await screen.findByRole("alert")).textContent).toBe(copy.packLearnMoreFailed);
  expect(assign).not.toHaveBeenCalled();
});

test("Xem nguồn on a map node opens the notes at its passage, marks it, and keeps the tab in the address", async () => {
  setSearch("tab=map");
  await loaded();
  fireEvent.click(screen.getByRole("treeitem", { name: "Hệ thức Viète" }));
  await act(async () => fireEvent.click(await screen.findByRole("button", { name: copy.packViewSource })));
  await screen.findByRole("heading", { level: 1, name: copy.projectNotesRow });
  await screen.findByRole("img", { name: copy.packPhotoAlt(2) });
  expect(document.getElementById("block-b5")!.hasAttribute("data-highlight")).toBe(true);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  const url = new URL(window.location.href);
  expect([url.searchParams.get("tab"), url.searchParams.get("block")]).toEqual(["sources", "b5"]);
  expect(track).toHaveBeenCalledWith("project_tab_viewed", { project_id: MATH, tab: "sources" });
});

test("Học thêm on a map node hands the node's name, the project and the pack_learn_more start to home", async () => {
  setSearch("tab=map");
  await loaded();
  fireEvent.click(screen.getByRole("treeitem", { name: "Hệ thức Viète" }));
  await act(async () => {});
  await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore })));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  const url = new URL(assign.mock.calls[0][0] as string, "http://x");
  expect([url.searchParams.get("via"), url.searchParams.get("project")]).toEqual(["pack_learn_more", MATH]);
  expect(url.searchParams.get("q")).toContain("Mình muốn hiểu kĩ hơn: Hệ thức Viète.");
});

test("review: the project button starts a review session in the subject, with the due count under it", async () => {
  vi.mocked(api.getReviewCount).mockResolvedValue([{ project_id: MATH, due: 3, exam_tomorrow: false }]);
  render(<ProjectPage />);
  const button = await screen.findByRole("button", { name: new RegExp(copy.reviewProjectButton) });
  await waitFor(() => expect(button.textContent).toContain(copy.reviewProjectDue(3)));
  fireEvent.click(button);
  await waitFor(() => expect(assign).toHaveBeenCalled());
  const url = new URL(assign.mock.calls[0][0], "http://x");
  expect(url.pathname).toBe("/");
  expect([url.searchParams.get("via"), url.searchParams.get("project"), url.searchParams.get("q")]).toEqual(["review", MATH, copy.reviewProjectMessage("Toán")]);
});

test("review: with nothing due the button has no count line, and the sidebar badge goes to the project page", async () => {
  render(<ProjectPage />);
  const button = await screen.findByRole("button", { name: new RegExp(copy.reviewProjectButton) });
  expect(button.textContent).toBe(copy.reviewProjectButton + copy.reviewProjectGo);
  cleanup();
  vi.mocked(api.getReviewCount).mockResolvedValue([{ project_id: MATH, due: 2, exam_tomorrow: false }]);
  render(<ProjectPage />);
  const badge = await screen.findByRole("link", { name: copy.reviewDueLabel("Toán", 2) });
  expect(badge.getAttribute("href")).toBe(`/projects/${MATH}`);
});
