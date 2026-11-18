import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PhaseSwitch } from "@/workspace/PhaseSwitch";
import type { Workspace } from "@/workspace/types";

afterEach(cleanup);

const tab = (id: string, phase: "solve" | "learn", title: string) =>
  ({ id, phase, doc: { title, blocks: [] } }) as unknown as Workspace & { phase: "solve" | "learn" };

it("renders its tabs inside the top bar slot when one is given", () => {
  const slot = document.body.appendChild(document.createElement("div"));
  const tabs = [tab("a", "solve", "Bài 1"), tab("b", "learn", "Bài 2")];
  render(<PhaseSwitch tabs={tabs} activeId="a" onActive={vi.fn()} barTarget={slot} />);
  const list = within(slot).getByRole("tablist");
  expect(list.hasAttribute("data-in-bar")).toBe(true);
  expect(within(list).getAllByRole("tab")).toHaveLength(2);
  slot.remove();
});

it("renders in place without a slot, and nothing for one tab", () => {
  const tabs = [tab("a", "solve", "Bài 1"), tab("b", "learn", "Bài 2")];
  const { container, rerender } = render(<PhaseSwitch tabs={tabs} activeId="a" onActive={vi.fn()} />);
  expect(container.querySelector("[role=tablist]")).not.toBeNull();
  expect(container.querySelector("[data-in-bar]")).toBeNull();
  rerender(<PhaseSwitch tabs={tabs.slice(0, 1)} activeId="a" onActive={vi.fn()} />);
  expect(screen.queryByRole("tablist")).toBeNull();
});
