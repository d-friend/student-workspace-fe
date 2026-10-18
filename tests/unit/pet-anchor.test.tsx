import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { PetAnchorProvider, usePetAnchor } from "@/components/pet/PetAnchor";
import { copy } from "@/lib/copy";
import { renderBlock } from "@/workspace/blocks";
import type { Block, BlockCtx, Phase, Workspace } from "@/workspace/types";
import { WorkspaceView } from "@/workspace/WorkspaceView";

afterEach(cleanup);

const steps: Block = { type: "steps", id: "s1", problem_id: "p1", input: "math" };
const scaffolded: Block = { ...(steps as Extract<Block, { type: "steps" }>), scaffold: [{ kind: "blank", template: "y = ___" }, { kind: "blank", template: "z = ___" }] };
const mk = (done = false): BlockCtx => ({
  workspaceId: "w",
  phase: "solve",
  report: vi.fn(),
  check: vi.fn(async () => ({ ok: true, state: "ok" as const, done })),
  overrides: {},
  hintCount: 0,
  onSolved: vi.fn(),
  help: null,
});

const seen: ReturnType<typeof usePetAnchor> = { anchor: null, scroller: null };
function Probe() {
  const v = usePetAnchor();
  useEffect(() => void Object.assign(seen, v));
  return null;
}
const within = (node: React.ReactNode) => (
  <PetAnchorProvider>
    {node}
    <Probe />
  </PetAnchorProvider>
);

test("the anchor is the active row in scaffold mode and in free mode, null once done", async () => {
  const c = mk(true);
  const { container } = render(within(renderBlock(scaffolded, c)));
  const row = container.querySelector("[data-pet-anchor]");
  expect(row).toBeTruthy();
  expect(seen.anchor).toBe(row);
  fireEvent.click(screen.getByRole("button", { name: copy.otherWay }));
  expect(seen.anchor).toBe(container.querySelector("[data-pet-anchor]"));
  expect(seen.anchor).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: copy.check }));
  });
  expect(c.onSolved).toHaveBeenCalled();
  expect(seen.anchor).toBeNull();
});

test("a steps block inside a hidden ancestor does not register", () => {
  render(within(<div hidden>{renderBlock(steps, mk())}</div>));
  expect(seen.anchor).toBeNull();
});

test("the anchor is removed when the block unmounts", () => {
  const { rerender } = render(within(renderBlock(steps, mk())));
  expect(seen.anchor).toBeTruthy();
  rerender(within(null));
  expect(seen.anchor).toBeNull();
});

const ws = (phase: Phase): Workspace => ({
  id: phase,
  doc: { v: 1, phase, title: phase, blocks: [{ ...steps, id: `s-${phase}` }], sources: [] } as unknown as Workspace["doc"],
});

test("switching phases moves the anchor to the visible doc; the column and scroller are exposed", () => {
  const ws2 = { learn: ws("learn"), solve: ws("solve") };
  const view = (phase: Phase) =>
    within(<WorkspaceView workspaces={ws2} phase={phase} onPhase={() => {}} makeCtx={(w) => ({ ...mk(), workspaceId: w.id })} />);
  const { container, rerender } = render(view("learn"));
  const owner = (p: Phase) => container.querySelector(`[data-phase="${p}"] [data-pet-anchor]`);
  expect(seen.anchor).toBe(owner("learn"));
  rerender(view("solve"));
  expect(seen.anchor).toBe(owner("solve"));
  rerender(view("learn"));
  expect(seen.anchor).toBe(owner("learn"));
  expect(container.querySelector("[data-pet-column]")).toBeTruthy();
  expect(seen.scroller).toBe(container.querySelector("[data-pet-column]")!.parentElement);
});
