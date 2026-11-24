import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NodePanel } from "@/components/pack/NodePanel";
import { ProjectView, type ProjectViewProps } from "@/components/project/ProjectView";
import * as api from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { track } from "@/lib/track";
import { mapNodeView, mathMap, mathProject, mathReader, sessionsFixture, MATH } from "../../src/app/dev/fixtures/projects/projectsFixture";

vi.mock("@/lib/api", async original => ({ ...await original<typeof import("@/lib/api")>(), getMapNode: vi.fn() }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const node = (id: string) => mathMap.find(n => n.id === id)!;
const panel = (over: Partial<Parameters<typeof NodePanel>[0]> = {}) => {
  const handlers = { onViewSource: vi.fn(), onLearnMore: vi.fn(), onClose: vi.fn() };
  const view = render(<NodePanel node={node("k-vieta")} learnFailed={false} {...handlers} {...over} />);
  return { ...handlers, ...view };
};
beforeEach(() => {
  vi.resetAllMocks();
  setLocale("vi");
  vi.mocked(api.getMapNode).mockImplementation(async id => mapNodeView(id)!);
});
afterEach(cleanup);

test("the node's name and summary show at once, with KaTeX, and the passages are fetched for it", async () => {
  const { container } = panel();
  expect(screen.getByText("Hệ thức Viète")).toBeDefined();
  expect(container.querySelector(".katex")).not.toBeNull(); // x_1 + x_2 = -b/a
  await waitFor(() => expect(api.getMapNode).toHaveBeenCalledWith("k-vieta"));
});

test("Xem nguồn opens the reader at the node's first passage and counts as a source view", async () => {
  const { onViewSource } = panel();
  await waitFor(() => expect(api.getMapNode).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: copy.packViewSource }));
  expect(onViewSource).toHaveBeenCalledWith("b5");
  await waitFor(() => expect(track).toHaveBeenCalledWith("node_source_viewed", { node_id: "k-vieta", pack_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
});

test("Xem nguồn works before the passages arrive, using the block id the map already holds", () => {
  vi.mocked(api.getMapNode).mockReturnValue(new Promise(() => {}));
  const { onViewSource } = panel();
  fireEvent.click(screen.getByRole("button", { name: copy.packViewSource }));
  expect(onViewSource).toHaveBeenCalledWith("b5");
  expect(track).not.toHaveBeenCalled(); // the event names a pack, which only the fetch knows
});

test("Học thêm sends the node's name with what the notes say, and counts as a tap", async () => {
  const { onLearnMore } = panel();
  await act(async () => {}); // the passages arrive
  fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore }));
  expect(onLearnMore).toHaveBeenCalledTimes(1);
  const [text] = onLearnMore.mock.calls[0];
  expect(text).toContain("Mình muốn hiểu kĩ hơn: Hệ thức Viète.");
  expect(text).toContain("Viète: $x_1 + x_2"); // the passage text, not just the summary
  await waitFor(() => expect(track).toHaveBeenCalledWith("learn_more_tapped", expect.objectContaining({ node_id: "k-vieta" })));
});

test("a failed fetch says so but leaves the summary and both actions working", async () => {
  vi.mocked(api.getMapNode).mockRejectedValue(new api.ApiError(500, "x", "x"));
  const { onLearnMore } = panel();
  expect((await screen.findByRole("alert")).textContent).toBe(copy.packNodeFailed);
  fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore }));
  expect(onLearnMore.mock.calls[0][0]).toContain("Hệ thức Viète");
});

test("a node with no notes asks nothing of the server and offers no actions", () => {
  panel({ node: node("c-function") });
  expect(api.getMapNode).not.toHaveBeenCalled();
  expect(screen.getByText(copy.projectNodeEmpty)).toBeDefined();
  expect(screen.queryByRole("button", { name: copy.packLearnMore })).toBeNull();
  expect(screen.queryByRole("button", { name: copy.packViewSource })).toBeNull();
});

test("a node with a summary but no passages can still start Học thêm, without a source link", () => {
  const { onLearnMore } = panel({ node: { ...node("c-function"), summary: "Hàm số là quy tắc cho mỗi $x$ một $y$." } });
  expect(screen.queryByRole("button", { name: copy.packViewSource })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: copy.packLearnMore }));
  expect(onLearnMore.mock.calls[0][0]).toContain("Hàm số là quy tắc");
});

test("switching node shows the new node, never the previous one's failure", async () => {
  vi.mocked(api.getMapNode).mockRejectedValueOnce(new api.ApiError(500, "x", "x"));
  const { rerender } = panel();
  await screen.findByRole("alert");
  rerender(<NodePanel node={node("k-delta")} learnFailed={false} onViewSource={vi.fn()} onLearnMore={vi.fn()} onClose={vi.fn()} />);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Biệt thức Δ")).toBeDefined();
});

test("the close button and a learn-more failure", () => {
  const { onClose, rerender } = panel();
  fireEvent.click(screen.getByRole("button", { name: copy.treeClear }));
  expect(onClose).toHaveBeenCalledTimes(1);
  rerender(<NodePanel node={node("k-vieta")} learnFailed onViewSource={vi.fn()} onLearnMore={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByText(copy.packLearnMoreFailed)).toBeDefined();
});

const noop = () => {};
const viewProps = (over: Partial<ProjectViewProps> = {}): ProjectViewProps => ({
  project: mathProject, screen: "map", onOpen: noop, onBack: noop,
  sessions: { sessions: sessionsFixture.filter(s => s.project_id === MATH), ready: true, failed: false, hasMore: false, loadingMore: false, more: noop }, onOpenSession: noop, openFailed: false,
  onSend: async () => false, sendError: null, reader: { pages: mathReader, failed: false }, block: null, onLearnMore: noop, learnFailed: false, onViewSource: noop, onUploaded: noop, ...over,
});

test("picking a node on the map opens its panel; the close button and picking the root close it", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(<ProjectView {...viewProps()} />);
  expect(screen.queryByRole("region", { name: copy.packFromNotes })).toBeNull();
  fireEvent.click(screen.getByRole("treeitem", { name: "Hệ thức Viète" }));
  expect(await screen.findByRole("region", { name: copy.packFromNotes })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: copy.treeClear }));
  expect(screen.queryByRole("region", { name: copy.packFromNotes })).toBeNull();
  fireEvent.click(screen.getByRole("treeitem", { name: "Căn bậc hai số học" }));
  await screen.findByRole("region", { name: copy.packFromNotes });
  fireEvent.click(screen.getByRole("treeitem", { name: "Toán" })); // the synthetic root clears the selection
  expect(screen.queryByRole("region", { name: copy.packFromNotes })).toBeNull();
  vi.unstubAllGlobals();
});
