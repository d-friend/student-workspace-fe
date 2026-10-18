import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PetAnchorProvider, usePetAnchorRef, usePetScrollerRef } from "@/components/pet/PetAnchor";
import { PetLayer } from "@/components/pet/PetLayer";
import type { Rect } from "@/lib/pet-place";
import type { Bubble, WorkspaceState } from "@/hooks/useWorkspace";
import { FLY_MS } from "@/hooks/useUnfold";
import { copy } from "@/lib/copy";

afterEach(cleanup);

const agent = (id: number, text: string, extra: Partial<Extract<Bubble, { kind: "agent" }>> = {}): Bubble => ({
  id,
  turn: 1,
  kind: "agent",
  text,
  waiting: false,
  line: null,
  offer: false,
  restate: false,
  opts: null,
  ask: null,
  ...extra,
});

function setup(bubbles: Bubble[], extra: Partial<WorkspaceState> = {}, entry = false) {
  const state = {
    bubbles,
    busy: false,
    building: false,
    checking: 0,
    verdict: { seq: 0, state: null, done: false },
    taskDone: {},
    restateChips: false,
    offerChips: false,
    optChips: null,
    watching: false,
    hasMessages: bubbles.length > 0,
    ...extra,
  } as WorkspaceState;
  const props = {
    inputRef: { current: null } as { current: { focus: (reveal?: boolean) => void } | null },
    entryInputRef: { current: null } as { current: HTMLTextAreaElement | null },
    entry,
    onChatOpened: vi.fn(),
    onNewProblem: vi.fn(),
    onConfirmRestate: vi.fn(),
    onCorrectRestate: vi.fn(),
    onAcceptOffer: vi.fn(),
    onOfferLater: vi.fn(),
    onOpt: vi.fn(),
    composer: {
      value: "",
      onChange: vi.fn(),
      onSend: vi.fn(),
      onPickPhoto: vi.fn(),
      placeholder: "...",
      photo: null,
    },
  };
  return { state, props, ui: <PetLayer state={state} {...props} /> };
}

const pet = () => screen.getByRole("button", { name: copy.petOpen });

describe("PetLayer", () => {
  it("(a) the pet is a button labelled petOpen", () => {
    render(setup([]).ui);
    expect(pet().tagName).toBe("BUTTON");
  });

  it("(b) opens a dialog with the composer focused; Escape closes and focus returns to the pet", () => {
    render(setup([]).ui);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(pet());
    expect(screen.getByRole("dialog", { name: copy.drawerLabel })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(copy.inputLabel));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(pet());
  });

  it("(c) the bubble shows the text once when closed; with the drawer open only the log has it", () => {
    render(setup([agent(1, "Xin chào")]).ui);
    expect(within(screen.getByRole("status")).getByText("Xin chào")).toBeTruthy();
    expect(screen.getAllByText("Xin chào")).toHaveLength(1);
    fireEvent.click(pet());
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByText("Xin chào")).toHaveLength(1);
    expect(within(screen.getByRole("log")).getByText("Xin chào")).toBeTruthy();
  });

  it("(d) the close button hides the bubble and shows the unread cue; opening clears it", () => {
    render(setup([agent(1, "Xin chào")]).ui);
    expect(screen.queryByText(copy.petUnread)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.bubbleClose }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(copy.petUnread)).toBeTruthy();
    fireEvent.click(pet());
    expect(screen.queryByText(copy.petUnread)).toBeNull();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByText(copy.petUnread)).toBeNull();
  });

  it("a newer agent bubble brings a dismissed bubble back", () => {
    const first = setup([agent(1, "Một")]);
    const { rerender } = render(first.ui);
    fireEvent.click(screen.getByRole("button", { name: copy.bubbleClose }));
    const next = setup([agent(1, "Một"), agent(2, "Hai")]);
    rerender(next.ui);
    expect(within(screen.getByRole("status")).getByText("Hai")).toBeTruthy();
  });

  it("(e) an error bubble is an alert", () => {
    render(setup([{ id: 1, turn: 1, kind: "error", text: "Lỗi mạng" }]).ui);
    expect(within(screen.getByRole("alert")).getByText("Lỗi mạng")).toBeTruthy();
  });

  it("(f) restate chips live in the bubble when closed and in the drawer when open, never both", () => {
    const s = setup([agent(1, "Mình đọc đề là: x", { restate: true })], { restateChips: true });
    render(s.ui);
    expect(screen.getAllByRole("button", { name: copy.restateYes })).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: copy.restateYes }));
    expect(s.props.onConfirmRestate).toHaveBeenCalledTimes(1);
    fireEvent.click(pet());
    const chips = screen.getAllByRole("button", { name: copy.restateYes });
    expect(chips).toHaveLength(1);
    expect(screen.getByRole("dialog").contains(chips[0])).toBe(true);
  });

  it("the bubble has no reply button; the pet itself opens the conversation", () => {
    render(setup([agent(1, "Em thử bước này nhé?")]).ui);
    expect(screen.queryByRole("button", { name: "Trả lời" })).toBeNull();
    fireEvent.click(pet());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  describe("fading away", () => {
    const FADE = 8000 + 400;
    const bubble = () => screen.queryByRole("status");
    const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
    const timed = (fn: () => void) => () => {
      vi.useFakeTimers();
      try {
        fn();
      } finally {
        vi.useRealTimers();
      }
    };

    it("a finished message fades after 8 s and is gone, without an unread cue", timed(() => {
      render(setup([agent(1, "Xin chào")]).ui);
      wait(7900);
      expect(bubble()).toBeTruthy();
      wait(FADE - 7900);
      expect(bubble()).toBeNull();
      expect(screen.queryByText(copy.petUnread)).toBeNull();
    }));

    it("new words restart the clock and bring a faded bubble back", timed(() => {
      const first = setup([agent(1, "Một")]);
      const { rerender } = render(first.ui);
      wait(6000);
      rerender(setup([agent(1, "Một hai")]).ui);
      wait(6000);
      expect(bubble()).toBeTruthy();
      wait(FADE);
      expect(bubble()).toBeNull();
      rerender(setup([agent(1, "Một hai"), agent(2, "Mới nữa")]).ui);
      expect(within(screen.getByRole("status")).getByText("Mới nữa")).toBeTruthy();
    }));

    it("stays while the pointer is over it, then fades after it leaves", timed(() => {
      render(setup([agent(1, "Xin chào")]).ui);
      fireEvent.pointerEnter(screen.getByRole("status"));
      wait(20000);
      expect(bubble()).toBeTruthy();
      fireEvent.pointerLeave(screen.getByRole("status"));
      wait(FADE);
      expect(bubble()).toBeNull();
    }));

    it("stays while the agent is still writing or building", timed(() => {
      render(setup([agent(1, "đang nghĩ", { waiting: true })], { busy: true, building: true, status: copy.statusPlanning }).ui);
      wait(20000);
      expect(bubble()).toBeTruthy();
    }));

    it("an error stays until it is closed", timed(() => {
      render(setup([{ id: 1, turn: 1, kind: "error", text: "Lỗi mạng" }]).ui);
      wait(20000);
      expect(screen.getByRole("alert")).toBeTruthy();
    }));

    it("a bubble asking the student to choose (chips) stays until answered", timed(() => {
      render(setup([agent(1, "Mình đọc đề là: x", { restate: true })], { restateChips: true }).ui);
      wait(20000);
      expect(screen.getByRole("button", { name: copy.restateYes })).toBeTruthy();
    }));

    it("an offer's chips keep the bubble too, and it fades once they are gone", timed(() => {
      const { rerender } = render(setup([agent(1, "Thử bài tương tự?", { offer: true })], { offerChips: true }).ui);
      wait(20000);
      expect(screen.getByRole("button", { name: copy.offerYes })).toBeTruthy();
      rerender(setup([agent(1, "Thử bài tương tự?", { offer: true })], { offerChips: false }).ui);
      wait(FADE);
      expect(bubble()).toBeNull();
    }));

    it("the entry keeps its message, where it can be the only place an instruction shows", timed(() => {
      render(setup([agent(1, "Không đọc được ảnh này")], {}, true).ui);
      wait(20000);
      expect(bubble()).toBeTruthy();
    }));
  });

  describe("answer choices", () => {
    const opts = (extra: Partial<Extract<Bubble, { kind: "agent" }>> = {}) =>
      setup([agent(1, "Em chọn nhé", { opts: ["A", "B"], ...extra })], { optChips: ["A", "B"] });

    it("bubble shows opts and Tự nhắn", () => {
      const s = opts();
      render(s.ui);
      const bubble = screen.getByRole("status");
      expect(within(bubble).getByRole("button", { name: "B" })).toBeTruthy();
      expect(within(bubble).getByRole("button", { name: copy.writeOwn })).toBeTruthy();
      fireEvent.click(within(bubble).getByRole("button", { name: "A" }));
      expect(s.props.onOpt).toHaveBeenCalledWith("A");
    });

    it("Tự nhắn opens the drawer with the composer focused", () => {
      const s = opts();
      render(s.ui);
      fireEvent.click(screen.getByRole("button", { name: copy.writeOwn }));
      expect(screen.getByRole("dialog")).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByLabelText(copy.inputLabel));
      expect(s.props.onChatOpened).toHaveBeenCalledTimes(1);
    });

    it("drawer shows opts without Tự nhắn and the bubble is gone", () => {
      render(opts().ui);
      fireEvent.click(pet());
      const chips = screen.getAllByRole("button", { name: "A" });
      expect(chips).toHaveLength(1);
      expect(screen.getByRole("dialog").contains(chips[0])).toBe(true);
      expect(screen.queryByRole("button", { name: copy.writeOwn })).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("a why question does not fade; a plain message does", () => {
      vi.useFakeTimers();
      try {
        const q = render(setup([agent(1, "Vì sao em chọn bước này?", { ask: "why" })]).ui);
        act(() => void vi.advanceTimersByTime(10000));
        expect(screen.queryByRole("status")).toBeTruthy();
        q.unmount();
        render(setup([agent(1, "Xin chào", { ask: null })]).ui);
        act(() => void vi.advanceTimersByTime(10000));
        expect(screen.queryByRole("status")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("a waiting bubble shows no text, only the typing dots", () => {
    render(setup([agent(1, "đang nghĩ", { waiting: true })], { busy: true }).ui);
    expect(screen.queryByText("đang nghĩ")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows every message of the turn, with the dots under the announce while the reply is awaited", () => {
    const student: Bubble = { id: 1, turn: 1, kind: "student", text: "x", photo: null };
    render(setup([student, agent(3, "Mình dựng nhé."), agent(2, "đang nghĩ", { waiting: true })], { busy: true }).ui);
    const bubble = screen.getByRole("status");
    expect(within(bubble).getByText("Mình dựng nhé.")).toBeTruthy();
    expect(within(bubble).queryByText("đang nghĩ")).toBeNull();
    expect(within(bubble).queryByRole("button", { name: "Trả lời" })).toBeNull();
  });

  it("shows only the latest turn, not the earlier replies", () => {
    render(setup([agent(1, "Cũ một", { turn: 1 }), agent(2, "Cũ hai", { turn: 2 }), agent(3, "Mới", { turn: 3 })]).ui);
    const bubble = screen.getByRole("status");
    expect(within(bubble).getByText("Mới")).toBeTruthy();
    expect(within(bubble).queryByText("Cũ một")).toBeNull();
    expect(within(bubble).queryByText("Cũ hai")).toBeNull();
  });

  it("Bài mới sends the pet hopping back to the entry, then it settles", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(setup([agent(1, "Xin chào")], { newProblemCount: 0 }).ui);
    const layer = () => container.querySelector<HTMLElement>("[data-place]")!;
    expect(layer().dataset.fly).toBeUndefined();
    rerender(setup([], { newProblemCount: 1 }, true).ui);
    expect(layer().dataset.place).toBe("entry");
    expect(layer().dataset.fly).toBeDefined(); // on the very first frame of the entry
    act(() => void vi.advanceTimersByTime(FLY_MS));
    expect(layer().dataset.fly).toBeUndefined();
    vi.useRealTimers();
  });

  it("landing on the entry any other way (a failed first send) does not make the pet hop", () => {
    const { container, rerender } = render(setup([agent(1, "Xin chào")], { newProblemCount: 0 }).ui);
    rerender(setup([], { newProblemCount: 0 }, true).ui);
    expect(container.querySelector<HTMLElement>("[data-place]")!.dataset.fly).toBeUndefined();
  });

  it("reports the build in the bubble, once, even before the agent has said anything", () => {
    const s = setup([], { busy: true, building: true, status: copy.statusPlanning });
    render(s.ui);
    expect(within(screen.getByRole("status")).getByText(copy.statusPlanning)).toBeTruthy();
    expect(screen.getAllByText(copy.statusPlanning)).toHaveLength(1);
  });

  it("falls back to the building label when no stage has been reported", () => {
    render(setup([agent(1, "đang nghĩ", { waiting: true })], { busy: true, building: true, status: null }).ui);
    expect(within(screen.getByRole("status")).getByText(copy.building)).toBeTruthy();
  });

  it("focusInput without reveal leaves a closed drawer closed (the bubble keeps the reply)", () => {
    const s = setup([agent(1, "Xin chào")]);
    render(s.ui);
    act(() => s.props.inputRef.current!.focus());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(screen.getByRole("status")).getByText("Xin chào")).toBeTruthy();
  });

  it("focusInput(true) opens a closed drawer and focuses its composer", () => {
    const s = setup([]);
    render(s.ui);
    act(() => s.props.inputRef.current!.focus(true));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText(copy.inputLabel));
  });

  it("focusInput with the drawer open focuses the drawer composer", () => {
    const s = setup([]);
    render(s.ui);
    fireEvent.click(pet());
    (document.activeElement as HTMLElement).blur();
    act(() => s.props.inputRef.current!.focus());
    expect(document.activeElement).toBe(screen.getByLabelText(copy.inputLabel));
  });

  describe("on the entry", () => {
    const withEntry = (extra: Partial<WorkspaceState> = {}, bubbles: Bubble[] = []) => {
      const s = setup(bubbles, extra, true);
      const ui = (
        <>
          <textarea aria-label="entry" ref={s.props.entryInputRef as never} />
          <PetLayer state={s.state} {...s.props} />
        </>
      );
      return { ...s, ui };
    };
    const entryPet = () => screen.getByRole("button", { name: "D-Friend" });

    it("focusInput focuses the entry composer, with or without reveal, and opens no drawer", () => {
      const s = withEntry();
      render(s.ui);
      act(() => s.props.inputRef.current!.focus());
      expect(document.activeElement).toBe(screen.getByLabelText("entry"));
      (document.activeElement as HTMLElement).blur();
      act(() => s.props.inputRef.current!.focus(true));
      expect(document.activeElement).toBe(screen.getByLabelText("entry"));
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("the pet is labelled D-Friend, tapping it celebrates and opens nothing", () => {
      render(withEntry().ui);
      expect(screen.queryByRole("button", { name: copy.petOpen })).toBeNull();
      expect(entryPet().querySelector("[data-state]")?.getAttribute("data-state")).toBe("idle");
      fireEvent.click(entryPet());
      expect(entryPet().querySelector("[data-state]")?.getAttribute("data-state")).toBe("happy");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("picking a photo celebrates", () => {
      const s = withEntry();
      const { rerender } = render(s.ui);
      expect(entryPet().querySelector("[data-state]")?.getAttribute("data-state")).toBe("idle");
      const next = withEntry();
      next.props.composer.photo = { src: "data:x", onRemove: vi.fn() } as never;
      rerender(
        <>
          <textarea aria-label="entry" ref={next.props.entryInputRef as never} />
          <PetLayer state={next.state} {...next.props} />
        </>,
      );
      expect(entryPet().querySelector("[data-state]")?.getAttribute("data-state")).toBe("happy");
    });

    it("shows a text-only reply on the entry as a status bubble (no unread badge), and an error as an alert", () => {
      const a = withEntry({}, [agent(1, "Xin chào")]);
      const { unmount } = render(a.ui);
      expect(within(screen.getByRole("status")).getByText("Xin chào")).toBeTruthy();
      expect(screen.queryByText(copy.petUnread)).toBeNull();
      unmount();
      render(withEntry({}, [{ id: 1, turn: 1, kind: "error", text: "Lỗi mạng" }]).ui);
      expect(within(screen.getByRole("alert")).getByText("Lỗi mạng")).toBeTruthy();
    });

    it("shows nothing on a fresh entry", () => {
      render(withEntry({}, []).ui);
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("tapping the pet on the entry brings a dismissed reply back", () => {
      render(withEntry({}, [agent(1, "Mình đọc đề là: x")]).ui);
      fireEvent.click(screen.getByRole("button", { name: copy.bubbleClose }));
      expect(screen.queryByText("Mình đọc đề là: x")).toBeNull();
      fireEvent.click(entryPet());
      expect(screen.getByText("Mình đọc đề là: x")).toBeTruthy();
    });

    it("closing an error bubble on the entry leaves no unread badge", () => {
      render(withEntry({}, [{ id: 1, turn: 1, kind: "error", text: "Lỗi mạng" }]).ui);
      fireEvent.click(screen.getByRole("button", { name: copy.bubbleClose }));
      expect(screen.queryByText(copy.petUnread)).toBeNull();
    });

    it("the pet element is the same node when the entry gives way to the workspace", () => {
      const s = withEntry();
      const { rerender } = render(s.ui);
      const node = entryPet();
      rerender(
        <>
          <textarea aria-label="entry" ref={s.props.entryInputRef as never} />
          <PetLayer state={s.state} {...s.props} entry={false} />
        </>,
      );
      expect(pet()).toBe(node);
    });
  });

  it("shows the problem recap from the restatement and Bài mới only once there are messages", () => {
    const s = setup([agent(1, "Mình đọc đề là: x", { restate: true })]);
    render(s.ui);
    fireEvent.click(pet());
    expect(within(screen.getByRole("dialog")).getByText(copy.problemRecap)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: copy.newProblem }));
    expect(s.props.onNewProblem).toHaveBeenCalledTimes(1);
  });
});

describe("PetLayer chat_opened", () => {
  it("fires once per open with the unread flag, and not on the entry's pet tap", () => {
    const s = setup([agent(1, "Chào em")]);
    render(s.ui);
    fireEvent.click(pet());
    expect(s.props.onChatOpened).toHaveBeenCalledTimes(1);
    expect(s.props.onChatOpened).toHaveBeenLastCalledWith(false);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.click(pet());
    expect(s.props.onChatOpened).toHaveBeenCalledTimes(2);
    cleanup();

    const u = setup([agent(1, "Chào em")]);
    render(u.ui);
    fireEvent.click(screen.getByRole("button", { name: copy.bubbleClose }));
    fireEvent.click(pet());
    expect(u.props.onChatOpened).toHaveBeenCalledTimes(1);
    expect(u.props.onChatOpened).toHaveBeenLastCalledWith(true);
    cleanup();

    const e = setup([], {}, true);
    render(e.ui);
    fireEvent.click(screen.getByRole("button", { name: copy.brand }));
    expect(e.props.onChatOpened).not.toHaveBeenCalled();
  });
});

describe("PetLayer in the lane", () => {
  const rect = (r: Rect) => ({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON() {} }) as DOMRect;
  const R: Record<"layer" | "scroller" | "column" | "anchor", Rect> = {
    layer: { left: 0, top: 0, right: 1700, bottom: 900 },
    scroller: { left: 0, top: 0, right: 1700, bottom: 900 },
    column: { left: 312, top: 0, right: 1128, bottom: 900 },
    anchor: { left: 400, top: 300, right: 1000, bottom: 340 },
  };
  const rects = () => structuredClone(R);
  let live = rects();
  let queue: FrameRequestCallback[] = [];
  const frame = () => act(() => void queue.splice(0).forEach((cb) => cb(0)));

  const mockRects = (setup: () => void) => {
    live = rects();
    setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const key = this.hasAttribute("data-place")
        ? "layer"
        : this.hasAttribute("data-testid")
          ? "scroller"
          : this.hasAttribute("data-pet-column")
            ? "column"
            : this.hasAttribute("data-pet-anchor")
              ? "anchor"
              : null;
      return rect(key ? live[key] : { left: 0, top: 0, right: 0, bottom: 0 });
    });
    queue = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => queue.push(cb));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  };
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function Doc({ active, scroller }: { active: boolean; scroller: boolean }) {
    const setScroller = usePetScrollerRef();
    const anchorRef = usePetAnchorRef(active);
    return (
      <div data-testid="scroller" ref={scroller ? (el) => setScroller?.(el) : undefined}>
        <div data-pet-column>
          <div ref={anchorRef} data-pet-anchor />
        </div>
      </div>
    );
  }
  function ui(extra: Partial<WorkspaceState> = {}, bubbles: Bubble[] = [], o: { active?: boolean; scroller?: boolean; flying?: boolean } = {}) {
    const s = setup(bubbles, extra);
    return (
      <PetAnchorProvider>
        <Doc active={o.active ?? true} scroller={o.scroller ?? true} />
        <PetLayer state={s.state} {...s.props} flying={o.flying} />
      </PetAnchorProvider>
    );
  }
  const layer = (c: HTMLElement) => c.querySelector<HTMLElement>("[data-place]")!;
  const scroller = () => screen.getByTestId("scroller");

  it("(a) with an anchor and a wide stage the pet is placed beside the line, right of the column", () => {
    mockRects(() => {});
    const { container } = render(ui());
    expect(layer(container).hasAttribute("data-lane")).toBe(true);
    expect(pet().style.left).toBe("1152px"); // column.right 1128 + 24
    expect(pet().style.top).toBe("276px"); // level with the line's middle (320) minus half the pet
    expect(parseFloat(pet().style.left)).toBeGreaterThan(R.column.right); // never over the doc column, so never over the input or Kiểm tra
  });

  it("(b) without an anchor, or a scroller, or room in the lane, it keeps the dock styles", () => {
    mockRects(() => {});
    const a = render(ui({}, [], { active: false }));
    expect(pet().style.top).toBe("");
    expect(pet().style.left).toBe("");
    expect(layer(a.container).hasAttribute("data-lane")).toBe(false);
    a.unmount();
    const b = render(ui({}, [], { scroller: false }));
    expect(pet().style.top).toBe("");
    b.unmount();
    mockRects(() => (live.column.right = 1600));
    render(ui());
    expect(pet().style.top).toBe("");
  });

  it("(c) scrolling moves the pet on the next frame, with the spring off until the scroll stops", () => {
    vi.useFakeTimers();
    mockRects(() => {});
    render(ui());
    expect(pet().dataset.moving).toBeUndefined();
    live.anchor = { ...live.anchor, top: 500, bottom: 540 };
    fireEvent.scroll(scroller());
    expect(pet().style.top).toBe("276px"); // not before the frame
    expect(pet().dataset.moving).toBe("scroll");
    frame();
    expect(pet().style.top).toBe("476px");
    act(() => void vi.advanceTimersByTime(119));
    expect(pet().dataset.moving).toBe("scroll");
    act(() => void vi.advanceTimersByTime(2));
    expect(pet().dataset.moving).toBeUndefined();
  });

  it("an anchor scrolled out of sight clamps to the edge of the scroller", () => {
    mockRects(() => {});
    render(ui());
    live.anchor = { ...live.anchor, top: -900, bottom: -860 };
    fireEvent.scroll(scroller());
    frame();
    expect(pet().style.top).toBe("8px");
    live.anchor = { ...live.anchor, top: 4000, bottom: 4040 };
    fireEvent.scroll(scroller());
    frame();
    expect(pet().style.top).toBe(`${900 - 88 - 8}px`);
  });

  it("(d) losing the anchor (another phase tab) docks the pet again and gives the scroller its padding back", () => {
    mockRects(() => {});
    const { rerender, container } = render(ui());
    expect(pet().style.top).toBe("276px");
    expect(scroller().style.getPropertyValue("--pet-clear")).toBe("0px");
    rerender(ui({}, [], { active: false }));
    expect(pet().style.top).toBe("");
    expect(layer(container).hasAttribute("data-lane")).toBe(false);
    expect(scroller().style.getPropertyValue("--pet-clear")).toBe("");
  });

  it("(e) under reduced motion the lane sets no transition; otherwise the stylesheet's applies", () => {
    mockRects(() => {});
    const a = render(ui());
    expect(pet().style.transition).toBe("");
    a.unmount();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    render(ui());
    expect(pet().style.top).toBe("276px");
    expect(pet().style.transition).toBe("none");
  });

  it("the lane is ignored while the drawer is open, on the entry and during the flight", () => {
    mockRects(() => {});
    const a = render(ui());
    const petNow = () => layer(a.container).querySelector<HTMLElement>("button")!;
    expect(pet().style.top).toBe("276px");
    fireEvent.click(pet());
    expect(petNow().style.top).toBe("");
    expect(scroller().style.getPropertyValue("--pet-clear")).toBe("");
    a.unmount();
    render(ui({}, [], { flying: true }));
    expect(pet().style.top).toBe("");
  });

  it("a resize of the stage re-places the pet", () => {
    mockRects(() => {});
    const resizes: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: ResizeObserverCallback) {
          resizes.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    render(ui());
    live.column = { ...live.column, right: 1650 }; // the lane is now too narrow
    act(() => resizes.forEach((cb) => cb([], null as never)));
    frame();
    expect(pet().style.top).toBe("");
  });

  describe("bubble side", () => {
    const say = [agent(1, "Em thử bước này nhé?")];
    const bubble = () => screen.getByRole("status");

    it("with room (lane >= 316) the bubble opens to the right of the pet, aligned to its top", () => {
      mockRects(() => {});
      render(ui({}, say));
      expect(bubble().dataset.side).toBe("right");
      expect(bubble().dataset.flip).toBeUndefined();
      expect(bubble().style.left).toBe(`${1152 + 88 + 12}px`);
      expect(bubble().style.top).toBe("276px");
    });

    it("in the lower part of the stage the bubble opens upward, aligned to the pet's bottom", () => {
      mockRects(() => (live.anchor = { ...live.anchor, top: 700, bottom: 740 }));
      render(ui({}, say));
      expect(bubble().dataset.flip).toBeDefined();
      expect(bubble().style.bottom).toBe(`${900 - (720 - 44 + 88)}px`);
      expect(bubble().style.top).toBe("");
    });

    it("in a narrow lane the bubble sits above the pet, right-aligned, within the viewport width", () => {
      mockRects(() => (live.layer = live.scroller = { left: 0, top: 0, right: 1440, bottom: 900 }));
      render(ui({}, say));
      expect(bubble().dataset.side).toBe("above");
      expect(bubble().style.right).toBe(`${1440 - (1152 + 88)}px`);
      expect(bubble().style.bottom).toBe(`${900 - 276 + 8}px`);
    });

    it("without a lane the bubble keeps its docked place", () => {
      mockRects(() => {});
      render(ui({}, say, { active: false }));
      expect(bubble().dataset.side).toBeUndefined();
      expect(bubble().style.left).toBe("");
    });

    it("the answer chips and Tự nhắn are inside the bubble and its right edge stays in the stage", () => {
      mockRects(() => {});
      render(ui({ optChips: ["A", "B"] }, [agent(1, "Em chọn nhé", { opts: ["A", "B"] })]));
      expect(bubble().dataset.side).toBe("right");
      expect(within(bubble()).getByRole("button", { name: "A" })).toBeTruthy();
      expect(within(bubble()).getByRole("button", { name: copy.writeOwn })).toBeTruthy();
      const max = /min\(300px, [^,]*, (\d+)px\)/.exec(bubble().style.maxWidth);
      const width = Math.min(300, Number(max?.[1] ?? 300));
      expect(parseFloat(bubble().style.left) + width).toBeLessThanOrEqual(R.layer.right);
    });
  });
});
