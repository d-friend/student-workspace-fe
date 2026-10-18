import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PetLayer } from "@/components/pet/PetLayer";
import type { Bubble, WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";

afterEach(cleanup);

const agent = (id: number, text: string, extra: Partial<Extract<Bubble, { kind: "agent" }>> = {}): Bubble => ({
  id,
  kind: "agent",
  text,
  waiting: false,
  line: null,
  offer: false,
  restate: false,
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
    render(setup([{ id: 1, kind: "error", text: "Lỗi mạng" }]).ui);
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

  it("Trả lời opens the drawer", () => {
    render(setup([agent(1, "Em thử bước này nhé?")]).ui);
    fireEvent.click(screen.getByRole("button", { name: copy.reply }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("a waiting bubble shows no text, only the typing dots", () => {
    render(setup([agent(1, "đang nghĩ", { waiting: true })], { busy: true }).ui);
    expect(screen.queryByText("đang nghĩ")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("shows every message of the turn, with the dots under the announce while the reply is awaited", () => {
    const student: Bubble = { id: 1, kind: "student", text: "x", photo: null };
    render(setup([student, agent(3, "Mình dựng nhé."), agent(2, "đang nghĩ", { waiting: true })], { busy: true }).ui);
    const bubble = screen.getByRole("status");
    expect(within(bubble).getByText("Mình dựng nhé.")).toBeTruthy();
    expect(within(bubble).queryByText("đang nghĩ")).toBeNull();
    expect(within(bubble).queryByText(copy.reply)).toBeNull();
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
      render(withEntry({}, [{ id: 1, kind: "error", text: "Lỗi mạng" }]).ui);
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
      render(withEntry({}, [{ id: 1, kind: "error", text: "Lỗi mạng" }]).ui);
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
