import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { copy } from "@/lib/copy";
import { SelectionAsk } from "@/workspace/SelectionAsk";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup(text = "selected text", target = "passage", coarse = false) {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: coarse })));
  const ref = createRef<HTMLDivElement>();
  const onAsk = vi.fn();
  render(<div ref={ref}><section id="panel-w"><div data-block-id="b1"><p data-sel="prompt" data-item="2" data-testid="passage">selected text</p><span data-sel="option" data-testid="option">answer</span><input data-testid="input" /><div data-action-bar data-testid="bar">action</div></div></section><SelectionAsk scroller={ref} activeId="w" onAsk={onAsk} /></div>);
  const node = screen.getByTestId(target);
  const range = { startContainer: node, endContainer: node, getClientRects: () => [{ left: 20, bottom: 40 }, { left: 80, bottom: 120 }] };
  vi.spyOn(window, "getSelection").mockReturnValue({ isCollapsed: false, rangeCount: 1, toString: () => text, getRangeAt: () => range } as unknown as Selection);
  act(() => { document.dispatchEvent(new Event("selectionchange")); vi.advanceTimersByTime(250); });
  return { onAsk };
}

it("positions below the last rect and returns the selected metadata", () => {
  const { onAsk } = setup("  selected text  ");
  const button = screen.getByRole("button", { name: copy.selectionAsk });
  expect(button.style.top).toBe("126px");
  expect(button.style.left).toBe("80px");
  fireEvent.click(button);
  expect(onAsk).toHaveBeenCalledWith({ text: "selected text", where: "prompt", block_id: "b1", item: 2 });
});

it.each([["x", "passage"], ["x".repeat(301), "passage"], ["valid", "bar"], ["valid", "input"]])("ignores invalid selection %s in %s", (text, target) => {
  setup(text, target);
  expect(screen.queryByRole("button", { name: copy.selectionAsk })).toBeNull();
});

it("hides on scroll", () => {
  setup();
  fireEvent.scroll(window);
  expect(screen.queryByRole("button", { name: copy.selectionAsk })).toBeNull();
});

it("skips option selection on coarse pointers", () => {
  setup("answer", "option", true);
  expect(screen.queryByRole("button", { name: copy.selectionAsk })).toBeNull();
});
