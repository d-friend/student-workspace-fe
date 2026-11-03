import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpBar } from "@/workspace/HelpBar";
import { copy } from "@/lib/copy";

afterEach(cleanup);

const idea = () => screen.getByRole("button", { name: copy.idea });

describe("HelpBar idea button", () => {
  it("is disabled while pending and sends nothing", () => {
    const onIdea = vi.fn();
    render(<HelpBar level={0} onHint={() => {}} onIdea={onIdea} ideaPending />);
    expect((idea() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(idea());
    expect(onIdea).not.toHaveBeenCalled();
  });

  it("two clicks in the same tick send one request", () => {
    const onIdea = vi.fn();
    render(<HelpBar level={0} onHint={() => {}} onIdea={onIdea} ideaPending={false} />);
    act(() => {
      fireEvent.click(idea());
      fireEvent.click(idea());
    });
    expect(onIdea).toHaveBeenCalledTimes(1);
  });

  it("stays blocked through the gap before the workspace turn starts, and works again after the reply", () => {
    const onIdea = vi.fn();
    const { rerender } = render(<HelpBar level={0} onHint={() => {}} onIdea={onIdea} ideaPending={false} />);
    fireEvent.click(idea());
    fireEvent.click(idea()); // still not pending: the event is batched for 800 ms before the turn starts
    expect(onIdea).toHaveBeenCalledTimes(1);
    rerender(<HelpBar level={0} onHint={() => {}} onIdea={onIdea} ideaPending />);
    expect((idea() as HTMLButtonElement).disabled).toBe(true);
    rerender(<HelpBar level={0} onHint={() => {}} onIdea={onIdea} ideaPending={false} />);
    expect((idea() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(idea());
    expect(onIdea).toHaveBeenCalledTimes(2);
  });
});
