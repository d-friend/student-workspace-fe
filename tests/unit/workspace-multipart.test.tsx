import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { PetAnchorProvider } from "@/components/pet/PetAnchor";
import { copy } from "@/lib/copy";
import { fixtures } from "@/workspace/fixtures";
import type { BlockCtx, StudentWork, Workspace } from "@/workspace/types";
import { WorkspaceView } from "@/workspace/WorkspaceView";

afterEach(cleanup);
const doc = fixtures["solve-multipart.json"];
const done = (n: number) => ({
  type: "steps" as const, done: true, free: false,
  entries: Array.from({ length: n }, (_, item) => ({ text: `line ${item}`, item, state: "ok" as const, tries: 1, hint: 0 })),
});

function setup(state?: StudentWork, taskDone: string[] = [], source = doc) {
  const w: Workspace = { id: "w", doc: source, ...(state && { state, restored: true }) };
  const ctx: BlockCtx = {
    workspaceId: "w", phase: "solve", report: vi.fn(), overrides: {}, hintCount: 0, onSolved: vi.fn(), help: null,
    check: vi.fn(async (blockId, _answer, _previous, item) => ({
      ok: true, state: "ok" as const,
      done: item === (blockId === "s3" ? 1 : 2),
    })),
  };
  const { container } = render(<PetAnchorProvider>
    <WorkspaceView tabs={[{ ...w, phase: "solve" }]} activeId="w" onActive={vi.fn()} makeCtx={() => ctx} taskDone={{ w: taskDone }} />
  </PetAnchorProvider>);
  const part = (id: string) => container.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
  return { ctx, container, part };
}
const headings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent).filter((t) => t?.startsWith("Câu"));
const pick = async (block: HTMLElement) => {
  const before = block.querySelectorAll("li").length;
  fireEvent.click(block.querySelector<HTMLButtonElement>('[role="group"] button')!);
  await waitFor(() => expect(block.querySelectorAll("li").length).toBe(before + 1));
};

test("only the first part is open; later parts show their label as locked", () => {
  const { part } = setup();
  expect(headings()).toEqual(["Câu a", `Câu b${copy.partLater}`, `Câu c${copy.partLater}`]);
  expect(part("s1").querySelector('[role="group"]')).toBeTruthy();
  for (const id of ["s2", "s3"]) expect(part(id).querySelector("button")).toBeNull();
});

test("a finished part stays visible above the next one, which the hints and progress follow", async () => {
  const { ctx, part, container } = setup();
  for (let i = 0; i < 3; i++) await pick(part("s1"));
  await waitFor(() => expect(part("s2").querySelector('[role="group"]')).toBeTruthy());
  expect(headings()).toEqual([`Câu a${copy.partDone}`, "Câu b", `Câu c${copy.partLater}`]);
  expect(part("s1").querySelectorAll("li")).toHaveLength(3);
  const counts = container.querySelectorAll(`[aria-label="${copy.stepProgress(1, 3)}"]`);
  expect(counts).toHaveLength(1); // one progress row, the active part's, in the sticky header
  expect(counts[0].closest('[data-block-id="p1"]')?.textContent).toContain("Câu b");
  fireEvent.click(screen.getByRole("button", { name: copy.hint }));
  expect(ctx.report).toHaveBeenCalledWith("help_requested", { block_id: "s2", level: 1 });
  expect(vi.mocked(ctx.report).mock.calls.some(([type]) => type === "task_completed")).toBe(false);
});

test("completion waits for every part and then keeps all of them, with stage rows per part", async () => {
  const { ctx, part } = setup({ blocks: { s1: done(3), s2: done(3) } });
  await pick(part("s3"));
  await pick(part("s3"));
  await screen.findByText(copy.doneLabel);
  expect(document.querySelector('[data-block-id="p1"]')!.textContent).not.toContain("Câu c"); // no part header over the result
  expect(screen.queryByLabelText(copy.stepProgress(2, 2))).toBeNull();
  expect(vi.mocked(ctx.report).mock.calls.filter(([type]) => type === "task_completed")).toHaveLength(1);
  const card = screen.getByText(copy.doneLabel).closest<HTMLElement>('[role="status"]')!;
  expect([...card.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Câu a", "Câu b", "Câu c"]);
});

test("a part the master completed out of order is shown, and the first unfinished one stays active", () => {
  const { part } = setup(undefined, ["s2"]);
  expect(headings()).toEqual(["Câu a", `Câu b${copy.partDone}`, `Câu c${copy.partLater}`]);
  expect(part("s1").querySelector('[role="group"]')).toBeTruthy();
});

test("two parts behave the same way", () => {
  const two = { ...doc, blocks: doc.blocks.filter((b) => b.id !== "s3") };
  const { part } = setup({ blocks: { s1: done(3) } }, [], two);
  expect(headings()).toEqual([`Câu a${copy.partDone}`, "Câu b"]);
  expect(part("s2").querySelector('[role="group"]')).toBeTruthy();
});

test("the building preview opens the first part and labels the rest", () => {
  const blocks = doc.blocks.map((b) => b.type === "steps" ? { ...b, pending: false } : b);
  const { container } = render(<BuildingSkeleton preview={{ phase: "solve", title: doc.title, blocks }} />);
  expect(headings()).toEqual(["Câu a", `Câu b${copy.partLater}`, `Câu c${copy.partLater}`]);
  expect(container.querySelectorAll('[role="group"]')).toHaveLength(1);
});

test("hints used on an earlier part do not mark the next part's first line as retried", async () => {
  const { ctx, part } = setup();
  fireEvent.click(screen.getByRole("button", { name: copy.hint }));
  for (let i = 0; i < 3; i++) await pick(part("s1"));
  await waitFor(() => expect(part("s2").querySelector('[role="group"]')).toBeTruthy());
  await pick(part("s2"));
  expect(vi.mocked(ctx.report).mock.calls.filter(([type]) => type === "line_checked").at(-1)![1]).toMatchObject({ block_id: "s2", retried: false });
});
