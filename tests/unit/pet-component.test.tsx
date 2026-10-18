import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Pet } from "@/components/pet/Pet";
import type { PetMood } from "@/lib/pet";

const moods: PetMood[] = ["idle", "listening", "thinking", "typing", "talking", "happy", "doubt"];

afterEach(cleanup);

describe("Pet", () => {
  it.each(moods)("renders %s as a decorative root with its state", (mood) => {
    const { container } = render(<Pet mood={mood} />);
    const root = container.firstElementChild!;
    expect(root.getAttribute("data-state")).toBe(mood);
    expect(root.getAttribute("aria-hidden")).toBe("true");
  });

  it("remounts the body group when celebrateKey changes, so the jump replays", () => {
    const body = (c: HTMLElement) => c.querySelector("svg > g")!;
    const { container, rerender } = render(<Pet mood="happy" celebrateKey={1} />);
    const first = body(container);
    rerender(<Pet mood="happy" celebrateKey={1} />);
    expect(body(container)).toBe(first);
    rerender(<Pet mood="happy" celebrateKey={2} />);
    expect(body(container)).not.toBe(first);
  });
});
