import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProjectPage } from "@/app/projects/ProjectPage";
import * as api from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { readPhoto } from "@/lib/photo";
import { track } from "@/lib/track";
import { MATH, mapNodeView, mathProject, mathReader, projectsFixture, sessionsFixture } from "../../src/app/dev/fixtures/projects/projectsFixture";

let search = "";
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "11111111-1111-4111-8111-111111111111" }), useSearchParams: () => new URLSearchParams(search) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/api", async original => ({
  ...await original<typeof import("@/lib/api")>(),
  createGuest: vi.fn(), getMe: vi.fn(), authMethods: vi.fn(), listSessions: vi.fn(), listProjects: vi.fn(), currentSession: vi.fn(),
  endSession: vi.fn(), resumeSession: vi.fn(), getProject: vi.fn(), getReader: vi.fn(), createPack: vi.fn(), getPack: vi.fn(),
  retryPack: vi.fn(), setPackSubject: vi.fn(), getMapNode: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/photo", async original => ({ ...await original<typeof import("@/lib/photo")>(), readPhoto: vi.fn() }));

let assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  search = "";
  setLocale("vi");
  window.localStorage.setItem("df-sidebar", "open");
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: !query.includes("max-width"), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  assign = vi.fn();
  const realWindow = window;
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
  vi.mocked(api.currentSession).mockResolvedValue(null);
  vi.mocked(api.endSession).mockResolvedValue(undefined);
  vi.mocked(api.resumeSession).mockResolvedValue(undefined);
  vi.mocked(readPhoto).mockResolvedValue({ data: "QUJD", bytes: 3, width: 1, height: 1, processMs: 1 });
});
afterEach(() => { cleanup(); window.localStorage.removeItem("df-sidebar"); vi.unstubAllGlobals(); setLocale("vi"); });

const uploadInput = () => screen.getByLabelText(copy.packUploadHint) as HTMLInputElement;
const files = (n: number) => Array.from({ length: n }, (_, i) => new File(["x"], `${i}.jpg`, { type: "image/jpeg" }));
const file = (id: string): api.Pack["files"][number] => ({ id, ordinal: 0, status: "ok", media_type: "image/jpeg" });
const readyPack = (extra: Partial<api.Pack> = {}): api.Pack => ({
  id: "p9", status: "ready", error: null, subject: { id: "math", name: "Toán", by: "student", confidence: null }, guesses: null, project_id: MATH,
  created_at: "2026-11-24T10:00:00Z", updated_at: "2026-11-24T10:00:00Z", photos: 1, concepts: 2,
  files: [file("f1")], blocks: [], nodes: [{ id: "n1", name: "Hệ thức Viète", role: "concept", created: true }, { id: "n2", name: "Biệt thức Δ", role: "concept", created: false }], ...extra,
});
const loaded = async () => { render(<ProjectPage />); await screen.findByRole("heading", { level: 1, name: "Toán" }); };

test("a project that does not exist, or fails to load, says so", async () => {
  vi.mocked(api.getProject).mockRejectedValueOnce(new api.ApiError(404, "not_found", "x"));
  render(<ProjectPage />);
  expect((await screen.findByRole("alert")).textContent).toBe(copy.projectNotFound);
  cleanup();
  vi.mocked(api.getProject).mockRejectedValueOnce(new api.ApiError(500, "x", "x"));
  render(<ProjectPage />);
  expect((await screen.findByRole("alert")).textContent).toBe(copy.projectLoadFailed);
});

test("the page opens on the map, reports each tab once it is shown, and loads a tab's data only then", async () => {
  await loaded();
  expect(track).toHaveBeenCalledWith("project_tab_viewed", { project_id: MATH, tab: "map" });
  expect(api.getReader).not.toHaveBeenCalled();
  expect(vi.mocked(api.listSessions).mock.calls.some(call => call[2] === MATH)).toBe(false);
  fireEvent.click(screen.getByRole("tab", { name: copy.projectTabs.sources }));
  await waitFor(() => expect(api.getReader).toHaveBeenCalledWith(MATH), { timeout: 3000 });
  expect(track).toHaveBeenCalledWith("project_tab_viewed", { project_id: MATH, tab: "sources" });
  fireEvent.click(screen.getByRole("tab", { name: copy.projectTabs.sessions }));
  await waitFor(() => expect(api.listSessions).toHaveBeenCalledWith(undefined, 20, MATH), { timeout: 3000 });
  fireEvent.click(screen.getByRole("tab", { name: copy.projectTabs.sources }));
  expect(api.getReader).toHaveBeenCalledTimes(1); // opening it again does not ask again
  expect(vi.mocked(track).mock.calls.filter(([event]) => event === "project_tab_viewed").map(([, props]) => (props as { tab: string }).tab)).toEqual(["map", "sources", "sessions", "sources"]);
});

test("?tab= opens that tab straight away", async () => {
  search = "tab=sources";
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
  expect((screen.getByRole("button", { name: copy.projectUpdateNotes }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the project's packs are listed above the notes", async () => {
  search = "tab=sources";
  await loaded();
  await screen.findByText(copy.packListTitle);
  expect(screen.getAllByRole("link").filter(a => a.getAttribute("href")?.startsWith("/packs/")).map(a => a.getAttribute("href")))
    .toEqual(mathProject.packs.map(p => `/packs/${p.id}?via=list`));
});

test("a new session ends the open problem and starts on home in the project", async () => {
  search = "tab=sessions";
  vi.mocked(api.currentSession).mockResolvedValue({ sessionId: "old", messages: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] } as never);
  await loaded();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.projectNewSession })));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(api.endSession).toHaveBeenCalledWith("old", "new_problem");
  expect(assign).toHaveBeenCalledWith(`/?project=${MATH}`);
  expect(track).toHaveBeenCalledWith("new_problem_clicked", { turns_in_session: 1 }, "old");
});

test("a new session stays put and says so when the open problem cannot be ended", async () => {
  search = "tab=sessions";
  vi.mocked(api.currentSession).mockRejectedValue(Error("down"));
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: copy.projectNewSession }));
  expect((await screen.findByRole("alert")).textContent).toBe(copy.projectNewFailed);
  expect(assign).not.toHaveBeenCalled();
});

test("opening a session of the project resumes it and goes home; a failure says so", async () => {
  search = "tab=sessions";
  await loaded();
  const panel = await screen.findByRole("tabpanel");
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
  search = "tab=sources";
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
  search = "tab=sources";
  vi.mocked(api.currentSession).mockRejectedValue(Error("down"));
  await loaded();
  await screen.findByRole("img", { name: copy.packPhotoAlt(1) });
  fireEvent.click(document.getElementById("block-b5")!);
  fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore }));
  expect((await screen.findByRole("alert")).textContent).toBe(copy.packLearnMoreFailed);
  expect(assign).not.toHaveBeenCalled();
});

test("Xem nguồn on a map node opens the notes at its passage, marks it, and keeps the tab in the address", async () => {
  await loaded();
  fireEvent.click(screen.getByRole("treeitem", { name: "Hệ thức Viète" }));
  await act(async () => fireEvent.click(await screen.findByRole("button", { name: copy.packViewSource })));
  expect(screen.getByRole("tab", { name: copy.projectTabs.sources }).getAttribute("aria-selected")).toBe("true");
  await screen.findByRole("img", { name: copy.packPhotoAlt(2) });
  expect(document.getElementById("block-b5")!.hasAttribute("data-highlight")).toBe(true);
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  const url = new URL(window.location.href);
  expect([url.searchParams.get("tab"), url.searchParams.get("block")]).toEqual(["sources", "b5"]);
  expect(track).toHaveBeenCalledWith("project_tab_viewed", { project_id: MATH, tab: "sources" });
});

test("Học thêm on a map node hands the node's name, the project and the pack_learn_more start to home", async () => {
  await loaded();
  fireEvent.click(screen.getByRole("treeitem", { name: "Hệ thức Viète" }));
  await act(async () => {});
  await act(async () => fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore })));
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  const url = new URL(assign.mock.calls[0][0] as string, "http://x");
  expect([url.searchParams.get("via"), url.searchParams.get("project")]).toEqual(["pack_learn_more", MATH]);
  expect(url.searchParams.get("q")).toContain("Mình muốn hiểu kĩ hơn: Hệ thức Viète.");
});
