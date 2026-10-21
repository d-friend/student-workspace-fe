import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { copy } from "@/lib/copy";
import { customFrames } from "@/lib/frame";
import { Custom } from "@/workspace/blocks/Custom";
import type { BlockCtx } from "@/workspace/types";

afterEach(cleanup);

const ctx: BlockCtx = {
  workspaceId: "w1",
  phase: "learn",
  report: vi.fn(),
  check: vi.fn(),
  overrides: {},
  hintCount: 0,
  onSolved: vi.fn(),
  help: null,
  simulationPending: { "w1:sim1": true },
  simulationVersions: {},
};

const custom = (html: string | null, height: number | null) => ({
  type: "custom" as const,
  id: "sim1",
  reason: "Mô phỏng",
  html,
  height,
});

test("shows the live skeleton, then remounts the iframe for each simulation update", () => {
  const view = render(<Custom block={custom(null, null)} ctx={ctx} />);
  expect(screen.getByText(copy.simulationBuilding)).toBeTruthy();
  expect(view.container.querySelector("iframe")).toBeNull();

  view.rerender(<Custom block={custom("<p>lần 1</p>", 360)} ctx={{ ...ctx, simulationPending: {} }} />);
  const first = view.container.querySelector("iframe");
  expect(first).toBeTruthy();
  const firstWindow = first?.contentWindow;
  expect(firstWindow && customFrames.has(firstWindow)).toBe(true);
  view.rerender(<Custom block={custom("<p>lần 2</p>", 420)} ctx={{
    ...ctx,
    simulationPending: {},
    simulationVersions: { "w1:sim1": 1 },
  }} />);
  const second = view.container.querySelector("iframe");
  expect(second).not.toBe(first);
  expect(firstWindow && customFrames.has(firstWindow)).toBe(false);
  expect(second?.contentWindow && customFrames.has(second.contentWindow)).toBe(true);
});

test("shows a quiet failure note when the turn is no longer active", () => {
  render(<Custom block={custom(null, null)} ctx={{ ...ctx, simulationPending: {} }} />);
  expect(screen.getByText(copy.simulationFailed)).toBeTruthy();
});
