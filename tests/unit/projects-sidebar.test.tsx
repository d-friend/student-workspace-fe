import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ProjectList } from "@/components/sidebar/ProjectList";
import { SessionList } from "@/components/sidebar/SessionList";
import type { ProjectSummary, SessionSummary } from "@/lib/api";
import { copy, setLocale } from "@/lib/copy";

vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const project = (n: number): ProjectSummary => ({ id: `p${n}`, subject_node_id: `s${n}`, name: `Môn ${n}`, sessions: n, packs: 0, map_nodes: 0, last_active_at: "2026-11-24T10:00:00Z" });
const many = (n: number) => Array.from({ length: n }, (_, i) => project(i + 1));
beforeEach(() => setLocale("vi"));
afterEach(cleanup);

test("each subject links to its project page and reports the open", () => {
  const onOpen = vi.fn();
  render(<ProjectList projects={many(2)} onOpen={onOpen} />);
  const link = screen.getByRole("link", { name: /Môn 2/ });
  expect(link.getAttribute("href")).toBe("/projects/p2");
  expect(screen.getByRole("heading", { name: copy.projectsTitle })).toBeDefined();
  fireEvent.click(link);
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }));
});

test("nothing renders without projects", () => {
  const { container } = render(<ProjectList projects={[]} onOpen={vi.fn()} />);
  expect(container.firstChild).toBeNull();
});

test("past five subjects the list folds, and the open one always shows", () => {
  render(<ProjectList projects={many(8)} activeId="p7" onOpen={vi.fn()} />);
  expect(screen.getAllByRole("link").map(a => a.textContent)).toEqual(
    ["Môn 1", "Môn 2", "Môn 3", "Môn 4", "Môn 5", "Môn 7"].map(name => expect.stringContaining(name)),
  );
  expect(screen.getByRole("link", { name: /Môn 7/ }).getAttribute("aria-current")).toBe("page");
  fireEvent.click(screen.getByRole("button", { name: copy.projectsMore }));
  expect(screen.getAllByRole("link")).toHaveLength(8);
  fireEvent.click(screen.getByRole("button", { name: copy.projectsLess }));
  expect(screen.getAllByRole("link")).toHaveLength(6);
});

test("five or fewer subjects have no fold button", () => {
  render(<ProjectList projects={many(5)} onOpen={vi.fn()} />);
  expect(screen.queryByRole("button")).toBeNull();
});

const row = (id: string, project_id: string | null): SessionSummary => ({
  id, title: `Bài ${id}`, created_at: new Date().toISOString(), last_active_at: new Date().toISOString(), tabs: [{ phase: "solve" }], done: false, current: false, project_id,
});

test("a filed session shows its project; an unfiled one, or one with an unknown project, shows nothing extra", () => {
  render(<SessionList sessions={[row("a", "p1"), row("b", null), row("c", "gone")]} onChoose={vi.fn()} projectNames={new Map([["p1", "Toán"]])} />);
  expect(screen.getAllByText("Toán")).toHaveLength(1); // the visible tag; the screen-reader line is a longer string
  expect(screen.getByRole("button", { name: new RegExp(`Bài a.*${copy.sessionInProject("Toán")}`) })).toBeDefined();
  expect(screen.getByRole("button", { name: /^Bài b/ }).textContent).not.toContain("Môn");
});

test("a subject with cards due shows a small count that links to the subject; none shows at 0 or with no counts", () => {
  const onReview = vi.fn();
  const { rerender } = render(<ProjectList projects={many(3)} onOpen={vi.fn()} due={{ p2: 4, p3: 0 }} onReview={onReview} />);
  const badge = screen.getByRole("link", { name: copy.reviewDueLabel("Môn 2", 4) });
  expect(badge.getAttribute("href")).toBe("/projects/p2");
  expect(badge.textContent).toBe("4");
  expect(screen.getAllByRole("link").filter(l => l.getAttribute("href") === "/projects/p2" && l.textContent === "4")).toHaveLength(1);
  fireEvent.click(badge);
  expect(onReview).toHaveBeenCalledWith(expect.objectContaining({ id: "p2" }));
  rerender(<ProjectList projects={many(3)} onOpen={vi.fn()} />);
  expect(screen.queryByRole("link", { name: /Ôn tập/ })).toBeNull();
});
