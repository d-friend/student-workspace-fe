import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Page from "@/app/progress/page";
import * as api from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { readPhoto } from "@/lib/photo";
import { track } from "@/lib/track";

vi.mock("@/lib/api", async original => ({
  ...await original<typeof import("@/lib/api")>(),
  createGuest: vi.fn(), getProgress: vi.fn(), getMe: vi.fn(), authMethods: vi.fn(), listSessions: vi.fn(), currentSession: vi.fn(),
  endSession: vi.fn(), resumeSession: vi.fn(), getTree: vi.fn(), setActiveWorkspace: vi.fn(),
  listPacks: vi.fn(), createPack: vi.fn(), getPack: vi.fn(), getNodeView: vi.fn(), retryPack: vi.fn(), setPackSubject: vi.fn(),
}));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/photo", async original => ({ ...await original<typeof import("@/lib/photo")>(), readPhoto: vi.fn() }));

let assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  setLocale("vi");
  window.localStorage.setItem("df-sidebar", "open");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  assign = vi.fn();
  const realWindow = window;
  vi.stubGlobal("window", new Proxy(realWindow, {
    get(target, key) { return key === "location" ? { href: target.location.href, assign, reload: vi.fn() } : Reflect.get(target, key); },
  }));
  vi.mocked(api.createGuest).mockResolvedValue({ guestId: "g", created: false });
  vi.mocked(api.getProgress).mockResolvedValue({ items: [] });
  vi.mocked(api.getMe).mockResolvedValue({ signed_in: false, profile_needed: false });
  vi.mocked(api.authMethods).mockResolvedValue({ google: false, email: false });
  vi.mocked(api.listSessions).mockResolvedValue({ sessions: [], next_before: null });
  vi.mocked(api.currentSession).mockResolvedValue(null);
  vi.mocked(api.endSession).mockResolvedValue(undefined);
  vi.mocked(api.getTree).mockResolvedValue({ nodes: [], workspaces: [] });
  vi.mocked(api.listPacks).mockResolvedValue([]);
  vi.mocked(readPhoto).mockResolvedValue({ data: "QUJD", bytes: 3, width: 1, height: 1, processMs: 1 });
});
afterEach(() => { cleanup(); window.localStorage.removeItem("df-sidebar"); vi.unstubAllGlobals(); setLocale("vi"); });

const treeNode = (id: string, level: api.TreeNode["level"], parent_id: string | null, extra: Partial<api.TreeNode> = {}): api.TreeNode => ({
  id, level, parent_id, name: `Node ${id}`, grades: [], attempts: 0, solo: 0, rate: null, unfinished: 0, learned: 0, packs: 0, last_seen: "2026-11-19T08:00:00Z", ...extra,
});
const packTree = (): api.TreeResponse => ({
  nodes: [
    treeNode("phys", "subject", null, { name: "Vật lí", packs: 1 }),
    treeNode("phys.ohm", "topic", "phys", { name: "Định luật Ôm", packs: 1 }),
    treeNode("math", "subject", null, { name: "Toán", packs: 1 }),
  ],
  workspaces: [],
});
const summary = (id: string, subject: string, name: string, extra: Partial<api.PackSummary> = {}): api.PackSummary => ({
  id, status: "ready", error: null, subject: { id: subject, name, by: "auto", confidence: 0.9 }, guesses: null, project_id: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), photos: 2, concepts: 3, ...extra,
});
const file = (id: string): api.Pack["files"][number] => ({ id, ordinal: 0, status: "ok", media_type: "image/jpeg" });
const readyPack = (): api.Pack => ({ ...summary("p9", "phys", "Vật lí"), files: [file("f1")], blocks: [], nodes: [] });
const uploadInput = () => screen.getByLabelText(copy.packUploadHint) as HTMLInputElement;
const files = (n: number) => Array.from({ length: n }, (_, i) => new File(["x"], `${i}.jpg`, { type: "image/jpeg" }));

test("the empty state offers the upload; a photo goes up, the sheet opens, and finishing reloads the tree and the list", async () => {
  vi.mocked(api.createPack).mockResolvedValue(readyPack());
  render(<Page />);
  await screen.findByText(copy.progressEmpty);
  fireEvent.change(uploadInput(), { target: { files: files(2) } });
  await screen.findByRole("dialog");
  expect(api.createPack).toHaveBeenCalledWith(["QUJD", "QUJD"]);
  await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2));
  expect(api.listPacks).toHaveBeenCalledTimes(3); // first load, after the upload, after it settled
});

test("with a tree the upload sits in the header, and the sheet outlives the layout change", async () => {
  vi.mocked(api.getTree).mockResolvedValueOnce({ nodes: [], workspaces: [] }).mockResolvedValue(packTree());
  vi.mocked(api.createPack).mockResolvedValue(readyPack());
  render(<Page />);
  await screen.findByText(copy.progressEmpty);
  fireEvent.change(uploadInput(), { target: { files: files(1) } });
  await screen.findByRole("dialog");
  await screen.findByRole("region", { name: copy.treeTitle }); // the tree arrives after the pack settles
  expect(screen.queryByRole("dialog")).not.toBeNull();
  expect(screen.getAllByRole("button", { name: copy.packUpload })).toHaveLength(1);
});

test("more than ten photos are refused before anything is read; an unreadable one is named", async () => {
  render(<Page />);
  await screen.findByText(copy.progressEmpty);
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
  render(<Page />);
  await screen.findByText(copy.progressEmpty);
  fireEvent.change(uploadInput(), { target: { files: files(1) } });
  expect((await screen.findByRole("alert")).textContent).toBe(copy.packUnavailable);
  expect((screen.getByRole("button", { name: copy.packUpload }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the pack list follows the subject on screen", async () => {
  vi.mocked(api.getTree).mockResolvedValue(packTree());
  vi.mocked(api.listPacks).mockResolvedValue([summary("p1", "phys", "Vật lí"), summary("p2", "math", "Toán", { status: "needs_subject" })]);
  render(<Page />);
  const row = (name: string) => screen.queryAllByRole("link").filter(a => a.getAttribute("href")?.startsWith("/packs/") && a.textContent?.includes(name));
  await screen.findByText(copy.packListTitle);
  expect([row("Vật lí").length, row("Toán").length]).toEqual([1, 1]);
  expect(row("Toán")[0].textContent).toContain(copy.packStatus.needs_subject);
  vi.mocked(api.getNodeView).mockResolvedValue({ id: "phys.ohm", level: "topic", name: "Định luật Ôm", path: [], summaries: [], workspaces: [] });
  fireEvent.click(screen.getByRole("treeitem", { name: "Định luật Ôm" }));
  expect([row("Vật lí").length, row("Toán").length]).toEqual([1, 0]);
  expect(row("Vật lí")[0].getAttribute("href")).toBe("/packs/p1?via=list");
});

const ohmView = (): api.NodeView => ({
  id: "phys.ohm", level: "topic", name: "Định luật Ôm", path: [{ id: "phys", name: "Vật lí" }, { id: "phys.ohm", name: "Định luật Ôm" }],
  summaries: [{ pack_id: "p1", created_at: "2026-11-20T08:00:00Z", summary: "Công thức $I = U/R$.", blocks: [
    { id: "b1", file_id: "f1", page: 1, ordinal: 0, kind: "heading", text: "Định luật Ôm" },
    { id: "b2", file_id: "f1", page: 1, ordinal: 1, kind: "text", text: "I tỉ lệ với U" },
  ] }], workspaces: [],
});

test("a node with notes shows them with KaTeX, a link to the source, and Học thêm", async () => {
  vi.mocked(api.getTree).mockResolvedValue(packTree());
  vi.mocked(api.getNodeView).mockResolvedValue(ohmView());
  const { container } = render(<Page />);
  fireEvent.click(await screen.findByRole("treeitem", { name: "Định luật Ôm" }));
  await screen.findByText(copy.packFromNotes, { selector: "strong" });
  expect(api.getNodeView).toHaveBeenCalledWith("phys.ohm");
  expect(container.querySelector(".katex")).not.toBeNull();
  const source = screen.getByRole("link", { name: copy.packViewSource });
  expect(source.getAttribute("href")).toBe("/packs/p1?via=node_source&block=b1");
  fireEvent.click(source);
  expect(track).toHaveBeenCalledWith("node_source_viewed", { node_id: "phys.ohm", pack_id: "p1" });
});

test("a subject node has no notes of its own, so nothing is fetched for it when it holds no packs", async () => {
  vi.mocked(api.getTree).mockResolvedValue({ nodes: [treeNode("x", "subject", null, { name: "Sử", learned: 1 })], workspaces: [] });
  render(<Page />);
  fireEvent.click(await screen.findByRole("treeitem", { name: "Sử" }));
  await screen.findByText(/Đang xem/);
  expect(api.getNodeView).not.toHaveBeenCalled();
});

test("Học thêm ends the open problem and hands the message to home as a pack_learn_more start, without counting a new problem", async () => {
  vi.mocked(api.getTree).mockResolvedValue(packTree());
  vi.mocked(api.getNodeView).mockResolvedValue(ohmView());
  vi.mocked(api.currentSession).mockResolvedValue({ sessionId: "old", messages: [] } as never);
  render(<Page />);
  fireEvent.click(await screen.findByRole("treeitem", { name: "Định luật Ôm" }));
  const learnMore = await screen.findByRole("button", { name: copy.packLearnMore });
  await act(async () => fireEvent.click(learnMore));
  expect(track).toHaveBeenCalledWith("learn_more_tapped", { node_id: "phys.ohm", pack_id: "p1" });
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(api.endSession).toHaveBeenCalledWith("old", "new_problem");
  const url = new URL(assign.mock.calls[0][0] as string, "http://x");
  expect(url.pathname).toBe("/");
  expect(url.searchParams.get("via")).toBe("pack_learn_more");
  expect(url.searchParams.get("q")).toBe("Mình muốn hiểu kĩ hơn: Định luật Ôm. Vở của mình ghi: «Định luật Ôm I tỉ lệ với U»");
  expect(vi.mocked(track).mock.calls.some(([event]) => event === "new_problem_clicked")).toBe(false);
});

test("Học thêm stays put and says so when the open problem cannot be ended", async () => {
  vi.mocked(api.getTree).mockResolvedValue(packTree());
  vi.mocked(api.getNodeView).mockResolvedValue(ohmView());
  vi.mocked(api.currentSession).mockRejectedValue(Error("down"));
  render(<Page />);
  fireEvent.click(await screen.findByRole("treeitem", { name: "Định luật Ôm" }));
  fireEvent.click(await screen.findByRole("button", { name: copy.packLearnMore }));
  expect((await screen.findByRole("alert")).textContent).toBe(copy.packLearnMoreFailed);
  expect(assign).not.toHaveBeenCalled();
});
