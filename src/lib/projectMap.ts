import type { MapItem, MapRole, Mastery, PackBlock, ReaderPage, TreeNode, TreeResponse } from "./api";

// The project map is drawn by the knowledge-tree component, so each map node is shown as a tree node. Roles stand in for levels:
// a chapter looks like a subject (bold), a lesson like a topic, a concept or detail like a type (the leaves that fold first).
const LEVEL: Record<MapRole, TreeNode["level"]> = { chapter: "subject", lesson: "topic", concept: "type", detail: "type" };

// Mastery tier as the dot's fill rate (the component turns it into 15 to 100 percent). null stays hollow: nothing seen yet, nothing inherited.
const RATE: Record<Mastery["tier"], number> = { beginner: 0.15, intermediate: 0.5, advanced: 1 };
export const masteryRate = (mastery: Mastery | null): number | null => mastery ? RATE[mastery.tier] : null;

export function mapAsTree(map: MapItem[]): TreeResponse {
  const nodes: TreeNode[] = [...map].sort((a, b) => a.ordinal - b.ordinal).map(item => ({
    id: item.id, level: LEVEL[item.role], parent_id: item.parent_id, name: item.name, grades: [],
    attempts: 0, solo: 0, rate: masteryRate(item.mastery), unfinished: 0, learned: 0, last_seen: "",
  }));
  return { nodes, workspaces: [] };
}

// The name a Học thêm message uses for a paragraph in the reader: the heading above it, else the subject.
export function headingAbove(pages: ReaderPage[], blockId: string, fallback: string): string {
  let heading = fallback;
  for (const page of pages) for (const block of page.blocks) {
    if (block.id === blockId) return heading;
    if (block.kind === "heading") heading = block.text.trim() || heading;
  }
  return fallback;
}

// 1-based number of a photo across the whole reader (the alt text and the page heading).
export function pageNumbers(pages: ReaderPage[]): Map<string, number> {
  return new Map(pages.map((page, i) => [page.file_id, i + 1]));
}

export function findBlock(pages: ReaderPage[], blockId: string): PackBlock | null {
  for (const page of pages) for (const block of page.blocks) if (block.id === blockId) return block;
  return null;
}

// The subject page shows the overview, or the map or the notes reader as a full page. ?tab=map|sources|review picks those; anything else (including the
// old ?tab=sessions) is the overview.
export const SCREENS = ["overview", "map", "sources", "review"] as const;
export type ProjectScreen = (typeof SCREENS)[number];
export const screenOf = (value: string | null): ProjectScreen => value === "map" || value === "sources" || value === "review" ? value : "overview";
// project_tab_viewed only knows map | sessions | sources: the overview reports as "sessions", and review has its own review_opened.
export const trackedTab = (screen: Exclude<ProjectScreen, "review">): "map" | "sessions" | "sources" => screen === "overview" ? "sessions" : screen;
