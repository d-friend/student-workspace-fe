import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProjectView, type ProjectViewProps } from "@/components/project/ProjectView";
import { copy, setLocale } from "@/lib/copy";
import { mathProject, mathReader, sessionsFixture, MATH } from "../../src/app/dev/fixtures/projects/projectsFixture";

vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const noop = () => {};
const mine = sessionsFixture.filter(s => s.project_id === MATH);
const props = (over: Partial<ProjectViewProps> = {}): ProjectViewProps => ({
  project: mathProject, tab: "map", onTab: noop,
  sessions: { sessions: mine, ready: true, failed: false, hasMore: false, loadingMore: false, more: noop }, onOpenSession: noop, openFailed: false,
  onNewSession: noop, newFailed: false, reader: { pages: mathReader, failed: false }, block: null, onLearnMore: noop, learnFailed: false, ...over,
});
beforeEach(() => {
  setLocale("vi");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("the project name is the heading, and the three tabs are labelled with the selected one marked", () => {
  render(<ProjectView {...props({ tab: "sessions" })} />);
  expect(screen.getByRole("heading", { level: 1, name: "Toán" })).toBeDefined();
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map(t => t.textContent)).toEqual(["Bản đồ", "Phiên học", "Nguồn"]);
  expect(tabs.map(t => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tabs[1].id);
});

test("clicking a tab, or the arrow keys, ask for that tab", () => {
  const onTab = vi.fn();
  render(<ProjectView {...props({ onTab })} />);
  fireEvent.click(screen.getByRole("tab", { name: "Nguồn" }));
  expect(onTab).toHaveBeenLastCalledWith("sources");
  fireEvent.keyDown(screen.getByRole("tab", { name: "Bản đồ" }), { key: "ArrowLeft" });
  expect(onTab).toHaveBeenLastCalledWith("sources"); // wraps
  fireEvent.keyDown(screen.getByRole("tab", { name: "Bản đồ" }), { key: "ArrowRight" });
  expect(onTab).toHaveBeenLastCalledWith("sessions");
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

test("Phiên học lists the sessions, opens one, and starts a new one in the project", () => {
  const onOpenSession = vi.fn(), onNewSession = vi.fn();
  render(<ProjectView {...props({ tab: "sessions", onOpenSession, onNewSession })} />);
  fireEvent.click(screen.getByRole("button", { name: /Hai vòi nước/ }));
  expect(onOpenSession).toHaveBeenCalledWith("s1");
  fireEvent.click(screen.getByRole("button", { name: copy.projectNewSession }));
  expect(onNewSession).toHaveBeenCalledTimes(1);
});

test("Phiên học shows the empty, failed and load-more states", () => {
  const more = vi.fn();
  const sessions = (over = {}) => ({ sessions: [], ready: true, failed: false, hasMore: false, loadingMore: false, more, ...over });
  const { rerender } = render(<ProjectView {...props({ tab: "sessions", sessions: sessions() })} />);
  expect(screen.getByText(copy.projectSessionsEmpty)).toBeDefined();
  rerender(<ProjectView {...props({ tab: "sessions", sessions: sessions({ failed: true }) })} />);
  expect(screen.getByRole("alert").textContent).toBe(copy.projectSessionsFailed);
  rerender(<ProjectView {...props({ tab: "sessions", sessions: sessions({ sessions: mine, hasMore: true }), openFailed: true, newFailed: true })} />);
  expect(screen.getAllByRole("alert").map(a => a.textContent)).toEqual([copy.projectNewFailed, copy.projectSessionOpenFailed]);
  fireEvent.click(screen.getByRole("button", { name: copy.historyMore }));
  expect(more).toHaveBeenCalledTimes(1);
});

test("Nguồn shows each photo with its passages, KaTeX included", () => {
  const { container } = render(<ProjectView {...props({ tab: "sources" })} />);
  const photos = screen.getAllByRole("img");
  expect(photos.map(p => p.getAttribute("alt"))).toEqual([copy.packPhotoAlt(1), copy.packPhotoAlt(2), copy.packPhotoAlt(3)]);
  expect(photos[0].getAttribute("src")).toMatch(/^\/api\/packs\/aaaaaaaa-.*\/files\/f1$/);
  expect(screen.getByRole("heading", { level: 3, name: "Phương trình bậc hai" })).toBeDefined();
  expect(container.querySelector(".katex")).not.toBeNull();
  expect(container.querySelector("#block-b5")).not.toBeNull();
});

test("tapping a passage offers Học thêm, which sends the passage with the heading above it", () => {
  const onLearnMore = vi.fn();
  const { container } = render(<ProjectView {...props({ tab: "sources", onLearnMore })} />);
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
  const { container } = render(<ProjectView {...props({ tab: "sources" })} />);
  fireEvent.keyDown(container.querySelector("#block-b2")!, { key: "Enter" });
  expect(screen.getByRole("button", { name: copy.packLearnMore })).toBeDefined();
});

test("Nguồn marks the passage 'Xem nguồn' points at, and scrolls to it", () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  const { container } = render(<ProjectView {...props({ tab: "sources", block: "b4" })} />);
  expect(container.querySelector("#block-b4")!.hasAttribute("data-highlight")).toBe(true);
  expect(scroll).toHaveBeenCalledTimes(1);
});

test("Nguồn shows loading, empty and failed states", () => {
  const { rerender, container } = render(<ProjectView {...props({ tab: "sources", reader: { pages: null, failed: false } })} />);
  expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
  rerender(<ProjectView {...props({ tab: "sources", reader: { pages: [], failed: false } })} />);
  expect(screen.getByText(copy.projectSourcesEmpty)).toBeDefined();
  rerender(<ProjectView {...props({ tab: "sources", reader: { pages: null, failed: true } })} />);
  expect(screen.getByRole("alert").textContent).toBe(copy.projectSourcesFailed);
});
