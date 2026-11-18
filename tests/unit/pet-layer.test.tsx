import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PetAnchorProvider, usePetAnchorRef } from "@/components/pet/PetAnchor";
import { PetLayer } from "@/components/pet/PetLayer";
import type { Bubble } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type AgentBubble = Extract<Bubble, { kind: "agent" }>;
const agent = (id: number, text: string, extra: Partial<AgentBubble> = {}): AgentBubble => ({
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

type State = Parameters<typeof PetLayer>[0]["state"];

function Doc({ active = true, inline = true, slots = true, done = false }: {
  active?: boolean;
  inline?: boolean;
  slots?: boolean;
  done?: boolean;
}) {
  const ref = usePetAnchorRef(active && !done);
  const doneRef = usePetAnchorRef(active && done);
  return (
    <div data-block-id="steps-1">
      <div key={done ? "done" : "question"} ref={done ? doneRef : ref} data-pet-anchor data-pet-done={done || undefined} data-pet-inline={inline || undefined} data-n={done ? undefined : "1"}>
        {inline && slots && <><div data-pet-slot /><div data-pet-spoken-slot /></>}
      </div>
    </div>
  );
}

function ui(extra: Partial<State> = {}, bubbles: Bubble[] = [], {
  offerOnCard, onWriteOwn = vi.fn(), ...doc
}: Parameters<typeof Doc>[0] & { offerOnCard?: boolean; onWriteOwn?: () => void } = {}) {
  const state: State = {
    bubbles, busy: false, building: false, checking: 0, status: null, verdict: { seq: 0, state: null, done: false },
    taskDone: {}, restateChips: false, offerChips: false, optChips: null, optChipKind: "answer", optChipSeed: 0,
    ...extra,
  };
  const actions = {
    onConfirmRestate: vi.fn(), onCorrectRestate: vi.fn(), onAcceptOffer: vi.fn(), onOfferLater: vi.fn(), onOpt: vi.fn(),
  };
  return (
    <PetAnchorProvider>
      <Doc {...doc} />
      <PetLayer state={state} actions={actions} offerOnCard={offerOnCard} onWriteOwn={onWriteOwn} />
    </PetAnchorProvider>
  );
}

describe("inline pet", () => {
  it.each([{ active: false }, { inline: false }, { slots: false }, { done: true, slots: false }])("is absent without an active inline slot: %j", (doc) => {
    const { container } = render(ui({}, [agent(1, "Thử thay x vào nhé")], doc));
    expect(container.querySelector("[data-state]")).toBeNull();
    expect(container.querySelector("[data-bubble]")).toBeNull();
  });

  it("portals one pet and the latest exchange into the active row", () => {
    const onWriteOwn = vi.fn();
    const { container, rerender } = render(ui({}, []));
    const words = [agent(1, "Tin cũ", { turn: 1 }), agent(2, "Chọn một đáp án", { turn: 2 })];
    rerender(ui({ optChips: ["A", "B"] }, words, { onWriteOwn }));
    const spoken = within(container.querySelector<HTMLElement>("[data-pet-spoken-slot]")!);
    expect(container.querySelectorAll("[data-state]")).toHaveLength(1);
    expect(container.querySelector("[data-pet-slot] [data-state]")).toBeTruthy();
    expect(container.querySelectorAll("[data-bubble]")).toHaveLength(1);
    expect(spoken.getByText("Chọn một đáp án")).toBeTruthy();
    expect(spoken.queryByText("Tin cũ")).toBeNull();
    expect(spoken.getByRole("button", { name: "A" })).toBeTruthy();
    fireEvent.click(spoken.getByRole("button", { name: copy.writeOwn }));
    expect(onWriteOwn).toHaveBeenCalledOnce();
  });

  it("leaves offer options on the done card when it already displays them", () => {
    const offer: Partial<State> = { optChipKind: "offer", optChips: ["Bài tương tự"] };
    const words = [agent(1, "Bài tiếp theo?")];
    const { rerender } = render(ui(offer, words, { done: true }));
    expect(screen.getByRole("button", { name: "Bài tương tự" })).toBeTruthy();
    rerender(ui(offer, words, { done: true, offerOnCard: true }));
    expect(screen.queryByRole("button", { name: "Bài tương tự" })).toBeNull();
    expect(screen.getByText("Bài tiếp theo?")).toBeTruthy();
  });

  it("shows new speech after the inline row registers", async () => {
    const announce = agent(1, "Mình dựng nhé.", { turn: 4 });
    const completed = agent(2, "Xong rồi.", { turn: 4 });
    const { rerender } = render(ui({}, [announce], { slots: false }));
    await act(async () => { rerender(ui({}, [announce])); });
    rerender(ui({}, [announce, completed]));
    expect(screen.queryByRole("status")).toBeNull();
    rerender(ui({}, [announce, completed, agent(3, "Thử thay x vào nhé", { turn: 5 })]));
    expect(screen.getByText("Thử thay x vào nhé")).toBeTruthy();
  });

  it("shows typing dots and then the build status in the same inline slot", () => {
    const { container, rerender } = render(ui());
    const words = [agent(1, "Mình dựng nhé."), agent(2, copy.thinking, { waiting: true })];
    rerender(ui({ busy: true }, words));
    const spoken = within(container.querySelector<HTMLElement>("[data-pet-spoken-slot]")!);
    expect(spoken.getByText("Mình dựng nhé.")).toBeTruthy();
    expect(spoken.queryByText(copy.thinking)).toBeNull();
    rerender(ui({ busy: true, building: true, status: copy.statusPlanning }, words));
    expect(spoken.getByText(copy.statusPlanning)).toBeTruthy();
  });

  it("fades a finished reply but keeps a pending question until answered", () => {
    vi.useFakeTimers();
    const { rerender } = render(ui());
    rerender(ui({}, [agent(1, "Em nghĩ sao?", { ask: "how" })]));
    act(() => { vi.advanceTimersByTime(8400); });
    expect(screen.getByText("Em nghĩ sao?")).toBeTruthy();
    rerender(ui({}, [agent(2, "Đúng rồi.", { turn: 2 })]));
    act(() => { vi.advanceTimersByTime(8400); });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps errors until dismissed and shows a new reply afterwards", () => {
    vi.useFakeTimers();
    const { rerender } = render(ui());
    rerender(ui({}, [{ kind: "error", id: 1, turn: 1, text: "Mất kết nối" }]));
    act(() => { vi.advanceTimersByTime(8400); });
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: copy.bubbleClose }));
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(ui({}, [agent(2, "Xin chào", { turn: 2 })]));
    expect(screen.getByText("Xin chào")).toBeTruthy();
  });

  it("hides the old speech on a data-n change alone and shows the next reply", async () => {
    const { container, rerender } = render(ui({}, []));
    const old = agent(1, "Thử thay x vào nhé");
    rerender(ui({}, [old]));
    const spoken = container.querySelector<HTMLElement>("[data-pet-spoken-slot]")!;
    expect(within(spoken).getByText("Thử thay x vào nhé")).toBeTruthy();
    await act(async () => { container.querySelector<HTMLElement>("[data-pet-anchor]")!.dataset.n = "2"; });
    expect(within(spoken).queryByRole("status")).toBeNull();
    const continuation = agent(2, "Đúng hướng rồi", { turn: 1 });
    rerender(ui({}, [old, continuation]));
    expect(within(spoken).queryByRole("status")).toBeNull();
    rerender(ui({}, [old, continuation, agent(3, "Giờ rút gọn nhé", { turn: 2 })]));
    expect(within(spoken).getByText("Giờ rút gọn nhé")).toBeTruthy();
  });

  it.each([
    { optChips: ["A", "B"] },
    { offerChips: true },
    { restateChips: true },
  ])("keeps pending chips on an item change: %j", async (extra) => {
    const { container } = render(ui(extra, [agent(1, "Em chọn nhé")]));
    const spoken = container.querySelector<HTMLElement>("[data-pet-spoken-slot]")!;
    await act(async () => { container.querySelector<HTMLElement>("[data-pet-anchor]")!.dataset.n = "2"; });
    expect(within(spoken).getByText("Em chọn nhé")).toBeTruthy();
    expect(within(spoken).getAllByRole("button").length).toBeGreaterThan(1);
  });

  it.each([
    { optChips: ["A", "B"] },
    { offerChips: true },
    { restateChips: true },
  ])("shows pending chips arriving later in the stale build turn: %j", async (extra) => {
    const announce = agent(1, "Mình dựng nhé.", { turn: 4 });
    const { container, rerender } = render(ui({}, [announce], { slots: false }));
    await act(async () => { rerender(ui({}, [announce])); });
    const spoken = container.querySelector<HTMLElement>("[data-pet-spoken-slot]")!;
    expect(within(spoken).queryByRole("status")).toBeNull();
    rerender(ui(extra, [announce, agent(2, "Em chọn nhé", { turn: 4 })]));
    expect(within(spoken).getByText("Em chọn nhé")).toBeTruthy();
    expect(within(spoken).getAllByRole("button").length).toBeGreaterThan(1);
  });

  it("keeps an unanswered ask on an item change", async () => {
    const { container } = render(ui({}, [agent(1, "Em nghĩ sao?", { ask: "how" })]));
    await act(async () => { container.querySelector<HTMLElement>("[data-pet-anchor]")!.dataset.n = "2"; });
    expect(within(container.querySelector<HTMLElement>("[data-pet-spoken-slot]")!).getByText("Em nghĩ sao?")).toBeTruthy();
  });

  it.each(["before", "during", "after"])("keeps a chipless final reply arriving %s the question-to-done handoff", (timing) => {
    const announce = agent(1, "Mình dựng nhé.", { turn: 4 });
    const closing = agent(2, "Bạn giải xong rồi.", { turn: 4 });
    const { container, rerender } = render(ui({}, [announce]));
    expect(screen.queryByText(announce.text)).toBeNull();
    if (timing === "before") rerender(ui({}, [announce, closing]));
    rerender(ui({}, timing === "after" ? [announce] : [announce, closing], { done: true }));
    if (timing === "after") rerender(ui({}, [announce, closing], { done: true }));
    const spoken = container.querySelector<HTMLElement>("[data-pet-done] [data-pet-spoken-slot]")!;
    expect(within(spoken).getByText(closing.text)).toBeTruthy();
  });

  it("restores speech hidden automatically by the question anchor when its key survives into done", () => {
    const closing = [agent(2, "Bạn giải xong rồi.", { turn: 4 })];
    const { container, rerender } = render(ui({}, closing));
    expect(screen.queryByText("Bạn giải xong rồi.")).toBeNull();
    rerender(ui({}, closing, { done: true }));
    expect(within(container.querySelector<HTMLElement>("[data-pet-done]")!).getByText("Bạn giải xong rồi.")).toBeTruthy();
  });

  it("preserves a manually dismissed closing reply across the done handoff", () => {
    const { container, rerender } = render(ui({}, []));
    const closing = [agent(2, "Bạn giải xong rồi.", { turn: 2 })];
    rerender(ui({}, closing));
    fireEvent.click(screen.getByRole("button", { name: copy.bubbleClose }));
    rerender(ui({}, closing, { done: true }));
    expect(container.querySelector("[data-pet-done] [data-bubble]")).toBeNull();
    expect(container.querySelector("[data-pet-done] [data-pet-slot] [data-state]")).toBeTruthy();
  });
});
