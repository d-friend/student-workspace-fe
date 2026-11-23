import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TreeNode, TreeResponse } from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";
import { track } from "@/lib/track";
import { KnowledgeTree } from "@/workspace/KnowledgeTree";

vi.mock("@/lib/track", () => ({ track: vi.fn() }));

const node = (id: string, level: TreeNode["level"], parent_id: string | null, extra: Partial<TreeNode> = {}): TreeNode => ({
  id, level, parent_id, name: id, grades: [], attempts: 0, solo: 0, rate: null, unfinished: 0, learned: 0, packs: 0, last_seen: "2026-11-19T08:00:00Z", ...extra,
});
const data = (): TreeResponse => ({
  nodes: [
    node("math", "subject", null, { name: "Toán" }),
    node("math.q", "topic", "math", { name: "Bậc hai" }),
    node("math.q.v", "type", "math.q", { name: "Viète", attempts: 2, solo: 2, rate: 1 }),
    node("math.q.w", "type", "math.q", { name: "Lập phương trình", attempts: 1, rate: 0 }),
    node("math.r", "topic", "math", { name: "Căn bậc hai", learned: 1 }),
    node("space", "subject", null, { name: "Thiên văn học", learned: 1 }),
  ],
  workspaces: [],
});
const names = () => screen.getAllByRole("treeitem").map(el => el.textContent);
const item = (name: string) => screen.getByRole("treeitem", { name });
const transform = () => (screen.getByRole("tree").firstElementChild as HTMLElement).style.transform;

beforeEach(() => { vi.mocked(track).mockReset(); setLocale("vi"); });
afterEach(cleanup);

test("renders root, subjects, topics and types as a labelled tree with levels, and the synthetic root is the selected item when nothing is", () => {
  render(<KnowledgeTree data={data()} selected={null} onSelect={() => {}} />);
  expect(screen.getByRole("tree", { name: copy.treeRoot })).toBeTruthy();
  expect(names()).toEqual([copy.treeRoot, "Toán", "Bậc hai", "Viète", "Lập phương trình", "Căn bậc hai", "Thiên văn học"]);
  expect(screen.getAllByRole("treeitem").map(el => el.getAttribute("aria-level"))).toEqual(["1", "2", "3", "4", "4", "3", "2"]);
  expect(item(copy.treeRoot).getAttribute("aria-selected")).toBe("true");
  expect(item("Toán").getAttribute("aria-selected")).toBe("false");
  expect(item("Viète").hasAttribute("aria-expanded")).toBe(false);
  expect(item("Toán").getAttribute("aria-expanded")).toBe("true");
});

test("clicking a label selects the node and tracks it; clicking the root clears the selection without an event", () => {
  const onSelect = vi.fn();
  const { rerender } = render(<KnowledgeTree data={data()} selected={null} onSelect={onSelect} />);
  fireEvent.click(item("Bậc hai"));
  expect(onSelect).toHaveBeenLastCalledWith("math.q");
  expect(track).toHaveBeenCalledExactlyOnceWith("tree_node_clicked", { node_id: "math.q", level: "topic" });
  rerender(<KnowledgeTree data={data()} selected="math.q" onSelect={onSelect} />);
  expect(item("Bậc hai").getAttribute("aria-selected")).toBe("true");
  expect(item(copy.treeRoot).getAttribute("aria-selected")).toBe("false");
  fireEvent.click(item(copy.treeRoot));
  expect(onSelect).toHaveBeenLastCalledWith(null);
  expect(track).toHaveBeenCalledTimes(1);
});

test("the toggle folds a node's children, shows how many are hidden, and does not select or track", () => {
  const onSelect = vi.fn();
  render(<KnowledgeTree data={data()} selected={null} onSelect={onSelect} />);
  const toggle = screen.getByRole("button", { name: copy.treeToggle("Bậc hai") });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(toggle.textContent).toBe("");
  fireEvent.click(toggle);
  expect(names()).toEqual([copy.treeRoot, "Toán", "Bậc hai", "Căn bậc hai", "Thiên văn học"]);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).toBe("2");
  expect(item("Bậc hai").getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: copy.treeToggle("Toán") }));
  expect(names()).toEqual([copy.treeRoot, "Toán", "Thiên văn học"]);
  expect(screen.getByRole("button", { name: copy.treeToggle("Toán") }).textContent).toBe("2");
  fireEvent.click(screen.getByRole("button", { name: copy.treeToggle("Toán") }));
  expect(names()).toContain("Bậc hai");
  expect(onSelect).not.toHaveBeenCalled();
  expect(track).not.toHaveBeenCalled();
});

test("a tree of more than 30 leaves opens with its types folded", () => {
  const nodes = [node("s", "subject", null, { name: "Môn" })];
  for (let i = 0; i < 16; i++) nodes.push(node(`s.t${i}`, "topic", "s", { name: `Chủ đề ${i}` }), node(`s.t${i}.a`, "type", `s.t${i}`, { name: `Dạng ${i}a` }), node(`s.t${i}.b`, "type", `s.t${i}`, { name: `Dạng ${i}b` }));
  render(<KnowledgeTree data={{ nodes, workspaces: [] }} selected={null} onSelect={() => {}} />);
  expect(screen.getAllByRole("treeitem")).toHaveLength(1 + 1 + 16); // root, subject, topics: no types
  expect(item("Chủ đề 3").getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: copy.treeToggle("Chủ đề 3") }));
  expect(screen.getAllByRole("treeitem")).toHaveLength(20);
});

test("arrow keys walk the visible items, expand and collapse, and Home and End jump; one item is the tab stop", () => {
  render(<KnowledgeTree data={data()} selected={null} onSelect={() => {}} />);
  const key = (name: string, k: string) => fireEvent.keyDown(item(name), { key: k });
  expect(screen.getAllByRole("treeitem").filter(el => el.tabIndex === 0)).toEqual([item(copy.treeRoot)]);
  item(copy.treeRoot).focus();
  key(copy.treeRoot, "ArrowDown");
  expect(document.activeElement).toBe(item("Toán"));
  expect(screen.getAllByRole("treeitem").filter(el => el.tabIndex === 0)).toEqual([item("Toán")]);
  key("Toán", "ArrowRight"); // expanded: goes to the first child
  expect(document.activeElement).toBe(item("Bậc hai"));
  key("Bậc hai", "ArrowLeft"); // expanded: collapses
  expect(item("Bậc hai").getAttribute("aria-expanded")).toBe("false");
  expect(names()).not.toContain("Viète");
  key("Bậc hai", "ArrowLeft"); // collapsed: goes to the parent
  expect(document.activeElement).toBe(item("Toán"));
  key("Toán", "ArrowDown");
  key("Bậc hai", "ArrowRight"); // collapsed: expands, focus stays
  expect(item("Bậc hai").getAttribute("aria-expanded")).toBe("true");
  expect(document.activeElement).toBe(item("Bậc hai"));
  key("Bậc hai", "End");
  expect(document.activeElement).toBe(item("Thiên văn học"));
  key("Thiên văn học", "ArrowDown"); // nothing below
  expect(document.activeElement).toBe(item("Thiên văn học"));
  key("Thiên văn học", "Home");
  expect(document.activeElement).toBe(item(copy.treeRoot));
  key(copy.treeRoot, "ArrowUp");
  expect(document.activeElement).toBe(item(copy.treeRoot));
});

test("tree items are real buttons, so Enter and Space select them natively", () => {
  render(<KnowledgeTree data={data()} selected={null} onSelect={() => {}} />);
  expect(item("Toán").tagName).toBe("BUTTON");
});

test("collapsing the focused item's ancestor leaves a tab stop (the root)", () => {
  render(<KnowledgeTree data={data()} selected={null} onSelect={() => {}} />);
  item("Viète").focus();
  fireEvent.click(screen.getByRole("button", { name: copy.treeToggle("Toán") }));
  expect(screen.getAllByRole("treeitem").filter(el => el.tabIndex === 0)).toHaveLength(1);
});

test("a node with no counted solve is a dashed hollow dot, rate 0 a solid ring with the floor fill, and a root has no dot", () => {
  render(<KnowledgeTree data={data()} selected={null} onSelect={() => {}} />);
  const dot = (name: string) => item(name).querySelector("span[aria-hidden]") as HTMLElement | null;
  expect(dot("Căn bậc hai")!.hasAttribute("data-hollow")).toBe(true);
  expect(dot("Căn bậc hai")!.style.getPropertyValue("--fill")).toBe("");
  expect(dot("Lập phương trình")!.hasAttribute("data-hollow")).toBe(false);
  expect(dot("Lập phương trình")!.style.getPropertyValue("--fill")).toBe("15%");
  expect(dot("Viète")!.style.getPropertyValue("--fill")).toBe("100%");
  expect(dot(copy.treeRoot)).toBeNull();
});

test("zoom buttons change the scale within limits and Fit is available", () => {
  render(<KnowledgeTree data={data()} selected={null} onSelect={() => {}} />);
  const scale = () => Number(/scale\(([\d.]+)\)/.exec(transform())![1]);
  expect(scale()).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: copy.treeZoomIn }));
  expect(scale()).toBeCloseTo(1.25);
  for (let i = 0; i < 30; i++) fireEvent.click(screen.getByRole("button", { name: copy.treeZoomIn }));
  expect(scale()).toBe(2);
  for (let i = 0; i < 60; i++) fireEvent.click(screen.getByRole("button", { name: copy.treeZoomOut }));
  expect(scale()).toBe(0.2);
  expect(screen.getByRole("button", { name: copy.treeFit })).toBeTruthy();
});

test("dragging pans the map but a plain click does not", () => {
  render(<KnowledgeTree data={data()} selected={null} onSelect={() => {}} />);
  const tree = screen.getByRole("tree");
  const before = transform();
  fireEvent.pointerDown(tree, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(tree, { pointerId: 1, clientX: 101, clientY: 101 });
  fireEvent.pointerUp(tree, { pointerId: 1, clientX: 101, clientY: 101 });
  expect(transform()).toBe(before);
  fireEvent.pointerDown(tree, { pointerId: 2, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(tree, { pointerId: 2, clientX: 140, clientY: 130 });
  fireEvent.pointerMove(tree, { pointerId: 2, clientX: 160, clientY: 150 });
  fireEvent.pointerUp(tree, { pointerId: 2, clientX: 160, clientY: 150 });
  expect(transform()).not.toBe(before);
  expect(/translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(transform())!.slice(1).map(Number)).toEqual([24 + 60, 24 + 50]);
});

test("labels and the toggle name follow the locale", () => {
  setLocale("en");
  render(<KnowledgeTree data={data()} selected={null} onSelect={() => {}} />);
  expect(within(screen.getByRole("region", { name: copy.treeTitle })).getByRole("tree", { name: "My knowledge tree" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Zoom in" })).toBeTruthy();
});

test("a project map names the root after the subject and keeps its clicks out of tree analytics", () => {
  const onSelect = vi.fn();
  render(<KnowledgeTree data={data()} selected={null} onSelect={onSelect} rootLabel="Toán học" trackClicks={false} />);
  expect(screen.getByRole("tree", { name: "Toán học" })).toBeTruthy();
  expect(names()[0]).toBe("Toán học");
  fireEvent.click(item("Viète"));
  expect(onSelect).toHaveBeenCalledWith("math.q.v");
  expect(track).not.toHaveBeenCalled();
});
