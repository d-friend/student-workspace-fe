import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProjectView, type ProjectViewProps } from "@/components/project/ProjectView";
import { copy, setLocale } from "@/lib/copy";
import { readPhoto } from "@/lib/photo";
import { mathProject, mathReader, sessionsFixture, MATH } from "../../src/app/dev/fixtures/projects/projectsFixture";

vi.mock("@/lib/track", () => ({ track: vi.fn() }));
vi.mock("@/lib/photo", async original => ({ ...await original<typeof import("@/lib/photo")>(), readPhoto: vi.fn() }));

const noop = () => {};
const mine = sessionsFixture.filter(s => s.project_id === MATH);
const props = (over: Partial<ProjectViewProps> = {}): ProjectViewProps => ({
  project: mathProject, screen: "map", onOpen: noop, onBack: noop,
  sessions: { sessions: mine, ready: true, failed: false, hasMore: false, loadingMore: false, more: noop }, onOpenSession: noop, openFailed: false,
  onSend: async () => false, sendError: null, reader: { pages: mathReader, failed: false }, block: null, onLearnMore: noop, learnFailed: false, onViewSource: noop, onUploaded: noop, ...over,
});
const wide = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
beforeEach(() => {
  setLocale("vi");
  vi.stubGlobal("matchMedia", wide);
  vi.mocked(readPhoto).mockReset().mockResolvedValue({ data: "QUJD", bytes: 3, width: 1, height: 1, processMs: 1 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const notePhotos = mathProject.packs.reduce((sum, pack) => sum + (pack.photos ?? 0), 0);
const overview = (over: Partial<ProjectViewProps> = {}) => render(<ProjectView {...props({ screen: "overview", ...over })} />);
const photoInput = (container: HTMLElement) => container.querySelector("input[type=file]:not([capture])") as HTMLInputElement;
const attach = (container: HTMLElement, n = 1) => fireEvent.change(photoInput(container), { target: { files: Array.from({ length: n }, (_, i) => new File(["x"], `p${i}.jpg`, { type: "image/jpeg" })) } });
const box = () => screen.getByRole("textbox", { name: copy.inputLabel }) as HTMLTextAreaElement;

test("the overview: the subject name is the heading, with a line counting sessions and note photos, and no tabs", () => {
  overview();
  expect(screen.getByRole("heading", { level: 1, name: "Toán" })).toBeDefined();
  expect(screen.getByText(`${mine.length} phiên · ${notePhotos} ảnh vở`)).toBeDefined();
  expect(screen.queryByRole("tab")).toBeNull();
});

const desktop = () => vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("min-width: 800px"), addEventListener: vi.fn(), removeEventListener: vi.fn() })));

test("on a phone the subject name is the heading in the top band, one truncating line, and the counts open the content", () => {
  overview();
  const h1 = screen.getByRole("heading", { level: 1, name: "Toán" });
  const band = document.querySelector("[class*=topBand]")!;
  expect(band.contains(h1)).toBe(true);
  const counts = screen.getByText(`${mine.length} phiên · ${notePhotos} ảnh vở`);
  expect(band.contains(counts)).toBe(false);
  expect(counts.compareDocumentPosition(box()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // above the composer
});

test("on desktop the subject name and its counts are in the panel's top bar, and the content starts with the composer", () => {
  desktop();
  overview();
  const h1 = screen.getByRole("heading", { level: 1, name: "Toán" });
  const bar = h1.parentElement!;
  expect(within(bar).getByText(`${mine.length} phiên · ${notePhotos} ảnh vở`)).toBeDefined();
  expect(screen.getAllByText(`${mine.length} phiên · ${notePhotos} ảnh vở`)).toHaveLength(1);
  expect(document.querySelector("[data-panel-header]")!.contains(h1)).toBe(true);
  expect(document.querySelector("[data-panel-header]")!.hasAttribute("data-flush")).toBe(true); // starts at the content's edge, not the doc column's
  const body = document.querySelector("[data-screen]")!;
  expect(body.firstElementChild!.contains(box())).toBe(true);
});

test("the count line leaves out a part that is 0, and the sessions while they load; a long history gets a +", () => {
  const sessions = (over = {}) => ({ sessions: mine, ready: true, failed: false, hasMore: false, loadingMore: false, more: noop, ...over });
  const { rerender } = overview({ project: { ...mathProject, packs: [] } });
  expect(screen.getByText(`${mine.length} phiên`)).toBeDefined();
  rerender(<ProjectView {...props({ screen: "overview", sessions: sessions({ sessions: [], ready: false }) })} />);
  expect(screen.getByText(`${notePhotos} ảnh vở`)).toBeDefined();
  rerender(<ProjectView {...props({ screen: "overview", sessions: sessions({ hasMore: true }) })} />);
  expect(screen.getByText(`${mine.length}+ phiên · ${notePhotos} ảnh vở`)).toBeDefined();
  rerender(<ProjectView {...props({ screen: "overview", project: { ...mathProject, packs: [] }, sessions: sessions({ sessions: [], ready: true }) })} />);
  expect(document.querySelector("[class*=summary]")).toBeNull();
});

test("on the overview the composer comes first, then the notes and map rows, then Gần đây: upload and the map are not under the history", () => {
  overview();
  const composer = box();
  const notes = screen.getByText(copy.projectNotesRow);
  const map = screen.getByText(copy.projectMapRow);
  const recent = screen.getByRole("heading", { level: 2, name: copy.projectRecent });
  const before = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  expect(before(composer, notes) && before(notes, map) && before(map, recent)).toBe(true);
  expect(composer.placeholder).toBe(copy.projectPlaceholder("Toán"));
});

test("Gần đây lists the sessions and opens one; there is no new-session button, the composer does that", () => {
  const onOpenSession = vi.fn();
  overview({ onOpenSession });
  fireEvent.click(screen.getByRole("button", { name: /Hai vòi nước/ }));
  expect(onOpenSession).toHaveBeenCalledWith("s1");
  expect(screen.queryByRole("button", { name: /Phiên mới trong môn này/ })).toBeNull();
});

test("Gần đây shows the empty, failed and load-more states", () => {
  const more = vi.fn();
  const sessions = (over = {}) => ({ sessions: [], ready: true, failed: false, hasMore: false, loadingMore: false, more, ...over });
  const { rerender } = overview({ sessions: sessions() });
  expect(screen.getByText(copy.projectSessionsEmpty)).toBeDefined();
  rerender(<ProjectView {...props({ screen: "overview", sessions: sessions({ failed: true }) })} />);
  expect(screen.getByRole("alert").textContent).toBe(copy.projectSessionsFailed);
  rerender(<ProjectView {...props({ screen: "overview", sessions: sessions({ sessions: mine, hasMore: true }), openFailed: true })} />);
  expect(screen.getByRole("alert").textContent).toBe(copy.projectSessionOpenFailed);
  fireEvent.click(screen.getByRole("button", { name: copy.historyMore }));
  expect(more).toHaveBeenCalledTimes(1);
});

test("the Vở & sách row opens the notes; Thêm uploads and is a different control", () => {
  const onOpen = vi.fn();
  const { container } = overview({ onOpen });
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`${copy.projectNotesRow}.*${notePhotos} ảnh`) }));
  expect(onOpen).toHaveBeenLastCalledWith("sources");
  const add = screen.getByRole("button", { name: copy.projectAddLabel });
  expect(add.textContent).toBe(copy.projectAdd);
  expect(onOpen).toHaveBeenCalledTimes(1); // Thêm did not open anything
  expect(container.querySelector("input[type=file][multiple]:not([capture])")).not.toBeNull();
});

test("the Bản đồ row opens the map with Xem; with no map it says to upload notes and offers nothing to open", () => {
  const onOpen = vi.fn();
  const { rerender } = overview({ onOpen });
  fireEvent.click(screen.getByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) }));
  expect(onOpen).toHaveBeenLastCalledWith("map");
  expect(screen.getByText(copy.projectMapItems(mathProject.map.length))).toBeDefined();
  rerender(<ProjectView {...props({ screen: "overview", project: { ...mathProject, map: [], packs: [] } })} />);
  expect(screen.getByText(copy.projectMapNone)).toBeDefined();
  expect(screen.queryByRole("button", { name: copy.projectViewLabel(copy.projectMapRow) })).toBeNull();
  expect(screen.queryByRole("button", { name: new RegExp(copy.projectNotesRow) })).toBeNull(); // no notes to read yet; Thêm remains
  expect(screen.getByRole("button", { name: copy.projectAddLabel })).toBeDefined();
});

test("Gửi sends the text, trimmed, and keeps the composer busy while the page navigates", async () => {
  let finish!: (navigating: boolean) => void;
  const onSend = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  overview({ onSend });
  fireEvent.change(box(), { target: { value: "  Tính góc A  " } });
  fireEvent.click(screen.getByRole("button", { name: copy.send }));
  expect(onSend).toHaveBeenCalledWith("Tính góc A", []);
  await waitFor(() => expect((screen.getByRole("button", { name: copy.send }) as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(screen.getByRole("button", { name: copy.send }));
  expect(onSend).toHaveBeenCalledTimes(1);
  finish(false); // it stayed on the page: the text is still there, and sending works again
  await waitFor(() => expect((screen.getByRole("button", { name: copy.send }) as HTMLButtonElement).disabled).toBe(false));
  expect(box().value).toBe("  Tính góc A  ");
});

test("nothing is sent from an empty composer; photos alone are enough", async () => {
  const onSend = vi.fn(async () => true);
  const { container } = overview({ onSend });
  fireEvent.click(screen.getByRole("button", { name: copy.send }));
  expect(onSend).not.toHaveBeenCalled();
  attach(container);
  await waitFor(() => expect(screen.getAllByRole("img", { name: copy.photoChip })).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: copy.send }));
  expect(onSend).toHaveBeenCalledWith("", ["QUJD"]);
});

test("the + attaches problem photos: up to the chat's limit, an unreadable one is skipped with a note, and a photo can be removed", async () => {
  const { container } = overview();
  attach(container, 5);
  await waitFor(() => expect(screen.getAllByRole("img", { name: copy.photoChip })).toHaveLength(4));
  expect(screen.getByRole("alert").textContent).toBe(copy.photoLimit(4));
  fireEvent.click(screen.getAllByRole("button", { name: copy.removePhoto })[0]);
  expect(screen.getAllByRole("img", { name: copy.photoChip })).toHaveLength(3);
  expect(screen.queryByRole("alert")).toBeNull();
  vi.mocked(readPhoto).mockRejectedValueOnce(Error("decode"));
  attach(container);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(copy.photoUnreadable));
  expect(screen.getAllByRole("img", { name: copy.photoChip })).toHaveLength(3);
});

test("a send error from the page shows under the composer", () => {
  overview({ sendError: copy.projectPhotoSaveFailed });
  expect(screen.getByRole("alert").textContent).toBe(copy.projectPhotoSaveFailed);
});

test("the map and the notes are full pages with a way back to the overview, named for the subject", () => {
  const onBack = vi.fn();
  const { rerender } = render(<ProjectView {...props({ screen: "map", onBack })} />);
  expect(screen.getByRole("heading", { level: 1, name: copy.projectMapRow })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: copy.projectBack("Toán") }));
  expect(onBack).toHaveBeenCalledTimes(1);
  rerender(<ProjectView {...props({ screen: "sources", onBack })} />);
  expect(screen.getByRole("heading", { level: 1, name: copy.projectNotesRow })).toBeDefined();
  expect(screen.getByRole("button", { name: copy.projectBack("Toán") })).toBeDefined();
  expect(screen.queryByRole("textbox")).toBeNull(); // the composer belongs to the overview
  const band = document.querySelector("[class*=topBand]")!; // the back control and the view name sit in the bar, like the overview's title
  expect(band.contains(screen.getByRole("button", { name: copy.projectBack("Toán") }))).toBe(true);
  expect(band.contains(screen.getByRole("heading", { level: 1 }))).toBe(true);
});

test("on desktop a full page also has its back control and view name in the panel's top bar", () => {
  desktop();
  render(<ProjectView {...props({ screen: "map" })} />);
  const header = document.querySelector("[data-panel-header]")!;
  expect(header.contains(screen.getByRole("button", { name: copy.projectBack("Toán") }))).toBe(true);
  expect(header.contains(screen.getByRole("heading", { level: 1, name: copy.projectMapRow }))).toBe(true);
});

test("Bản đồ draws the map as a tree rooted at the subject, with chapters, lessons, concepts and details", () => {
  render(<ProjectView {...props()} />);
  const tree = screen.getByRole("tree", { name: "Toán" });
  const names = within(tree).getAllByRole("treeitem").map(el => el.textContent);
  expect(names).toContain("Toán");
  expect(names).toEqual(expect.arrayContaining(["Phương trình bậc hai", "Công thức nghiệm", "Biệt thức Δ", "Hệ thức Viète", "Hàm số"]));
  // chapter 1, lesson 2, concept 3 under the root at level 1
  const level = (name: string) => within(tree).getByRole("treeitem", { name }).getAttribute("aria-level");
  expect([level("Toán"), level("Phương trình bậc hai"), level("Công thức nghiệm"), level("Hệ thức Viète")]).toEqual(["1", "2", "3", "4"]);
});

test("a map node with no mastery draws a hollow dot; one with mastery draws a filled one", () => {
  const { container } = render(<ProjectView {...props()} />);
  const dot = (name: string) => screen.getByRole("treeitem", { name }).querySelector("span[aria-hidden]") as HTMLElement;
  expect(dot("Hàm số").hasAttribute("data-hollow")).toBe(true);
  expect(dot("Hệ thức Viète").hasAttribute("data-hollow")).toBe(false);
  expect(dot("Hệ thức Viète").getAttribute("style")).toContain("--fill: 100%");
  expect(dot("Căn bậc hai số học").getAttribute("style")).toContain("--fill: 28%");
  expect(container.querySelector("[data-hollow]")).not.toBeNull();
});

test("an empty map says so", () => {
  render(<ProjectView {...props({ project: { ...mathProject, map: [] } })} />);
  expect(screen.getByText(copy.projectMapEmpty)).toBeDefined();
  expect(screen.queryByRole("tree")).toBeNull();
});

test("Nguồn shows each photo with its passages, KaTeX included", () => {
  const { container } = render(<ProjectView {...props({ screen: "sources" })} />);
  const photos = screen.getAllByRole("img");
  expect(photos.map(p => p.getAttribute("alt"))).toEqual([copy.packPhotoAlt(1), copy.packPhotoAlt(2), copy.packPhotoAlt(3)]);
  expect(photos[0].getAttribute("src")).toMatch(/^\/api\/packs\/aaaaaaaa-.*\/files\/f1$/);
  expect(screen.getByRole("heading", { level: 3, name: "Phương trình bậc hai" })).toBeDefined();
  expect(container.querySelector(".katex")).not.toBeNull();
  expect(container.querySelector("#block-b5")).not.toBeNull();
});

test("tapping a passage offers Học thêm, which sends the passage with the heading above it", () => {
  const onLearnMore = vi.fn();
  const { container } = render(<ProjectView {...props({ screen: "sources", onLearnMore })} />);
  expect(screen.queryByRole("button", { name: copy.packLearnMore })).toBeNull();
  fireEvent.click(container.querySelector("#block-b5")!);
  fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore }));
  const [text] = onLearnMore.mock.calls[0];
  expect(text).toContain("Mình muốn hiểu kĩ hơn: Phương trình bậc hai."); // the heading before block b5
  expect(text).toContain("Viète");
  fireEvent.click(container.querySelector("#block-b5")!); // a second tap closes the offer
  expect(screen.queryByRole("button", { name: copy.packLearnMore })).toBeNull();
});

test("Enter on a focused passage opens the offer", () => {
  const { container } = render(<ProjectView {...props({ screen: "sources" })} />);
  fireEvent.keyDown(container.querySelector("#block-b2")!, { key: "Enter" });
  expect(screen.getByRole("button", { name: copy.packLearnMore })).toBeDefined();
});

test("Nguồn marks the passage 'Xem nguồn' points at, and scrolls to it", () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const { container } = render(<ProjectView {...props({ screen: "sources", block: "b4" })} />);
  expect(container.querySelector("#block-b4")!.hasAttribute("data-highlight")).toBe(true);
  expect(scroll).toHaveBeenCalledTimes(1);
});

test("Nguồn shows loading, empty and failed states", () => {
  const { rerender, container } = render(<ProjectView {...props({ screen: "sources", reader: { pages: null, failed: false } })} />);
  expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
  rerender(<ProjectView {...props({ screen: "sources", project: { ...mathProject, packs: [] }, reader: { pages: [], failed: false } })} />);
  expect(screen.getByText(copy.projectSourcesEmpty)).toBeDefined();
  rerender(<ProjectView {...props({ screen: "sources", reader: { pages: [], failed: false } })} />); // packs with no readable page still list
  expect(screen.queryByText(copy.projectSourcesEmpty)).toBeNull();
  expect(screen.getByText(copy.packListTitle)).toBeDefined();
  rerender(<ProjectView {...props({ screen: "sources", reader: { pages: null, failed: true } })} />);
  expect(screen.getByRole("alert").textContent).toBe(copy.projectSourcesFailed);
});

// Below 640px the map is an outline (the mind map cannot be read there); tapping a name opens the same node panel under its row.
const phone = () => vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: query.includes("max-width: 639px"), addEventListener: vi.fn(), removeEventListener: vi.fn() })));

test("on a phone the map is a collapsible outline, not the mind map: chapters open, deeper levels fold", () => {
  phone();
  render(<ProjectView {...props()} />);
  expect(screen.queryByRole("tree")).toBeNull();
  const outline = screen.getByRole("navigation", { name: copy.projectOutlineLabel });
  expect(within(outline).getByRole("button", { name: "Phương trình bậc hai" })).toBeDefined();
  expect(within(outline).queryByRole("button", { name: "Biệt thức Δ" })).toBeNull(); // a concept under a closed lesson
  fireEvent.click(within(outline).getByRole("button", { name: copy.treeToggle("Công thức nghiệm") }));
  expect(within(outline).getByRole("button", { name: "Biệt thức Δ" })).toBeDefined();
  fireEvent.click(within(outline).getByRole("button", { name: copy.treeToggle("Công thức nghiệm") }));
  expect(within(outline).queryByRole("button", { name: "Biệt thức Δ" })).toBeNull();
});

test("on a phone, tapping an outline row opens the node panel under that row", () => {
  phone();
  render(<ProjectView {...props()} />);
  const row = screen.getByRole("button", { name: "Công thức nghiệm" });
  fireEvent.click(row);
  const notes = screen.getByRole("region", { name: copy.packFromNotes });
  expect(within(notes).getByText("Công thức nghiệm")).toBeDefined();
  expect(row.getAttribute("aria-current")).toBe("true");
  expect(row.closest("li")!.contains(notes)).toBe(true);
  fireEvent.click(within(notes).getByRole("button", { name: copy.treeClear }));
  expect(screen.queryByRole("region", { name: copy.packFromNotes })).toBeNull();
});
