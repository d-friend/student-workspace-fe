import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PetLayer } from "@/components/pet/PetLayer";
import { useUnfold } from "@/hooks/useUnfold";
import type { Screen, WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const hook = (screen: Screen, exists = false) =>
  renderHook((p: { screen: Screen; exists: boolean }) => useUnfold(p.screen, p.exists), {
    initialProps: { screen, exists },
  });

describe("useUnfold", () => {
  it("(a) empty -> building with no workspace flies, then settles after 1050 ms", () => {
    const h = hook("empty");
    expect(h.result.current).toBe("entry");
    h.rerender({ screen: "building", exists: false });
    expect(h.result.current).toBe("flying");
    act(() => vi.advanceTimersByTime(1000));
    expect(h.result.current).toBe("flying");
    act(() => vi.advanceTimersByTime(50));
    expect(h.result.current).toBe("settled");
  });

  it("a photo send flies too, and the doc arriving mid-flight does not cut it short", () => {
    const h = hook("photo");
    h.rerender({ screen: "building", exists: false });
    h.rerender({ screen: "workspace", exists: true });
    expect(h.result.current).toBe("flying");
    act(() => vi.advanceTimersByTime(1050));
    expect(h.result.current).toBe("settled");
  });

  it("(b) a restore (first render on the workspace) never flies", () => {
    const h = hook("workspace", true);
    expect(h.result.current).toBe("settled");
    h.rerender({ screen: "building", exists: true });
    expect(h.result.current).toBe("settled");
  });

  it("(c) newProblem (workspace -> empty) returns to the entry without flying", () => {
    const h = hook("workspace", true);
    h.rerender({ screen: "empty", exists: false });
    expect(h.result.current).toBe("entry");
  });

  it("a build while a workspace exists (similar problem) does not fly", () => {
    const h = hook("empty", true);
    h.rerender({ screen: "building", exists: true });
    expect(h.result.current).toBe("settled");
  });

  it("(d) a failure while flying (building -> empty) returns to the entry at once", () => {
    const h = hook("empty");
    h.rerender({ screen: "building", exists: false });
    act(() => vi.advanceTimersByTime(300));
    h.rerender({ screen: "empty", exists: false });
    expect(h.result.current).toBe("entry");
    act(() => vi.advanceTimersByTime(2000));
    expect(h.result.current).toBe("entry");
  });

  it("(e) with reduced motion it settles without flying", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q }) as MediaQueryList);
    const h = hook("empty");
    h.rerender({ screen: "building", exists: false });
    expect(h.result.current).toBe("settled");
  });
});

describe("the pet's flight", () => {
  const state = {
    bubbles: [],
    busy: true,
    building: true,
    checking: 0,
    verdict: { seq: 0, state: null, done: false },
    taskDone: {},
    restateChips: false,
    offerChips: false,
    optChips: null,
    watching: false,
    hasMessages: true,
  } as unknown as WorkspaceState;
  const props = {
    state,
    inputRef: { current: null },
    entryInputRef: { current: null },
    onChatOpened: vi.fn(),
    onNewProblem: vi.fn(),
    onConfirmRestate: vi.fn(),
    onCorrectRestate: vi.fn(),
    onAcceptOffer: vi.fn(),
    onOfferLater: vi.fn(),
    onOpt: vi.fn(),
    composer: { value: "", onChange: vi.fn(), onSend: vi.fn(), onPickPhoto: vi.fn(), placeholder: "", photo: null },
  };

  it("is the same button moving from the entry place to the dock, happy while it flies", () => {
    const { container, rerender } = render(<PetLayer {...props} entry flying={false} />);
    const layer = container.firstElementChild as HTMLElement;
    const before = screen.getByRole("button", { name: copy.brand });
    expect(layer.dataset.place).toBe("entry");
    rerender(<PetLayer {...props} entry={false} flying />);
    const during = screen.getByRole("button", { name: copy.petOpen });
    expect(during).toBe(before);
    expect(layer.dataset.place).toBe("dock");
    expect(layer.dataset.fly).toBeDefined();
    expect(during.querySelector("[data-state]")?.getAttribute("data-state")).toBe("happy");
    rerender(<PetLayer {...props} entry={false} flying={false} />);
    expect(layer.dataset.fly).toBeUndefined();
    act(() => vi.advanceTimersByTime(1300));
    expect(screen.getByRole("button", { name: copy.petOpen })).toBe(before);
    expect(before.querySelector("[data-state]")?.getAttribute("data-state")).toBe("working");
  });

  it("a failure mid-flight puts the pet back on the entry", () => {
    const { container, rerender } = render(<PetLayer {...props} entry flying={false} />);
    const layer = container.firstElementChild as HTMLElement;
    rerender(<PetLayer {...props} entry={false} flying />);
    rerender(<PetLayer {...props} entry flying={false} />);
    expect(layer.dataset.place).toBe("entry");
    expect(layer.dataset.fly).toBeUndefined();
  });
});
