import { expect, test } from "vitest";
import type { MapItem, ReaderPage } from "@/lib/api";
import { headingAbove, mapAsTree, masteryRate, pageNumbers, screenOf, trackedTab } from "@/lib/projectMap";

const item = (id: string, parent_id: string | null, role: MapItem["role"], ordinal: number, over: Partial<MapItem> = {}): MapItem => ({
  id, parent_id, role, name: id, summary: "", block_ids: [], node_id: null, ordinal, mastery: null, mastery_node_id: null, ...over,
});

test("map nodes become tree nodes in ordinal order, roles standing in for levels", () => {
  const tree = mapAsTree([
    item("d", "k", "detail", 3), item("c", null, "chapter", 0), item("l", "c", "lesson", 1), item("k", "l", "concept", 2),
  ]);
  expect(tree.nodes.map(n => [n.id, n.level, n.parent_id])).toEqual([["c", "subject", null], ["l", "topic", "c"], ["k", "type", "l"], ["d", "type", "k"]]);
  expect(tree.workspaces).toEqual([]);
});

test("the mastery tier is the dot's fill, and no mastery stays hollow", () => {
  expect(masteryRate(null)).toBeNull();
  expect(masteryRate({ tier: "beginner", confidence: 0.5 })).toBe(0.15);
  expect(masteryRate({ tier: "intermediate", confidence: 0.5 })).toBe(0.5);
  expect(masteryRate({ tier: "advanced", confidence: 0.9 })).toBe(1);
  expect(mapAsTree([item("a", null, "chapter", 0, { mastery: { tier: "advanced", confidence: 0.9 } })]).nodes[0].rate).toBe(1);
});

const page = (file_id: string, blocks: ReaderPage["blocks"]): ReaderPage => ({ pack_id: "p", file_id, ordinal: 0, created_at: "", blocks });
const block = (id: string, kind: ReaderPage["blocks"][number]["kind"], text: string) => ({ id, file_id: "f", page: 1, ordinal: 0, kind, text });

test("a passage is named by the heading above it, across pages, else by the fallback", () => {
  const pages = [page("f1", [block("t0", "text", "trước"), block("h1", "heading", "Viète"), block("t1", "text", "x")]), page("f2", [block("t2", "text", "y"), block("h2", "heading", "  "), block("t3", "text", "z")])];
  expect(headingAbove(pages, "t0", "Toán")).toBe("Toán");
  expect(headingAbove(pages, "t1", "Toán")).toBe("Viète");
  expect(headingAbove(pages, "t2", "Toán")).toBe("Viète"); // carries over the page break
  expect(headingAbove(pages, "t3", "Toán")).toBe("Viète"); // a blank heading does not replace it
  expect(headingAbove(pages, "nope", "Toán")).toBe("Toán");
});

test("photos are numbered from one across the reader", () => {
  expect([...pageNumbers([page("a", []), page("b", [])])]).toEqual([["a", 1], ["b", 2]]);
});

test("?tab=map, ?tab=sources and ?tab=review open those pages; anything else, the old ?tab=sessions included, is the overview", () => {
  expect([screenOf("sources"), screenOf("map"), screenOf("review"), screenOf("sessions"), screenOf("x"), screenOf(null)]).toEqual(["sources", "map", "review", "overview", "overview", "overview"]);
});

test("project_tab_viewed knows map, sessions and sources: the overview reports as sessions", () => {
  expect(["overview", "map", "sources"].map(s => trackedTab(s as "overview" | "map" | "sources"))).toEqual(["sessions", "map", "sources"]);
});
