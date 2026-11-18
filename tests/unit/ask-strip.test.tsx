import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AskStrip, pendingAsk, type AskState } from "@/components/chat/AskStrip";
import { copy } from "@/lib/copy";

afterEach(cleanup);

const question = "Vì sao bước này đúng?";
const state: AskState = {
  bubbles: [{ id: 1, turn: 1, kind: "agent", text: question, waiting: false, line: null, offer: false, restate: false, opts: null, ask: null }],
  askPending: false, restateChips: false, offerChips: false, optChips: null, optChipKind: "answer", optChipSeed: 1,
};

function setup() {
  const actions = {
    onConfirmRestate: vi.fn(), onCorrectRestate: vi.fn(), onAcceptOffer: vi.fn(),
    onOfferLater: vi.fn(), onOpt: vi.fn(),
  };
  const onKeyboard = vi.fn();
  const ui = (extra: Partial<AskState> = {}, offerOnCard = false) => (
    <AskStrip ask={pendingAsk({ ...state, ...extra }, offerOnCard)} actions={actions} onKeyboard={onKeyboard} />
  );
  return { actions, onKeyboard, ui };
}

it("shows a pending question and opens the keyboard even without chips", () => {
  const { onKeyboard, ui } = setup();
  const { rerender } = render(ui({ askPending: true }));
  const strip = within(screen.getByRole("region", { name: copy.askStripLabel }));
  expect(strip.getByText(question)).toBeTruthy();
  fireEvent.click(strip.getByRole("button", { name: copy.askStripKeyboard }));
  expect(onKeyboard).toHaveBeenCalledOnce();
  rerender(ui());
  expect(screen.queryByRole("region", { name: copy.askStripLabel })).toBeNull();
});

it("uses the chat actions for option, restatement, and offer chips", () => {
  const { actions, ui } = setup();
  const { rerender } = render(ui({ optChips: ["Vì A", "Vì B"], optChipKind: "why" }));
  fireEvent.click(screen.getByRole("button", { name: "Vì B" }));
  expect(actions.onOpt).toHaveBeenCalledExactlyOnceWith("Vì B");
  rerender(ui({ restateChips: true }));
  fireEvent.click(screen.getByRole("button", { name: copy.restateYes }));
  fireEvent.click(screen.getByRole("button", { name: copy.restateNo }));
  expect(actions.onConfirmRestate).toHaveBeenCalledOnce();
  expect(actions.onCorrectRestate).toHaveBeenCalledOnce();
  rerender(ui({ offerChips: true }));
  fireEvent.click(screen.getByRole("button", { name: copy.offerYes }));
  fireEvent.click(screen.getByRole("button", { name: copy.offerLater }));
  expect(actions.onAcceptOffer).toHaveBeenCalledOnce();
  expect(actions.onOfferLater).toHaveBeenCalledOnce();
});

it("hides an offer on the done card and ignores typing placeholders", () => {
  const { ui } = setup();
  const { rerender } = render(ui({ optChipKind: "offer", optChips: ["Bài tương tự"] }, true));
  expect(screen.queryByRole("region", { name: copy.askStripLabel })).toBeNull();
  const agent = state.bubbles[0];
  if (agent.kind !== "agent") throw Error("Expected an agent fixture");
  rerender(ui({ bubbles: [...state.bubbles, { ...agent, id: 2, waiting: true }], askPending: true, optChipSeed: 2 }));
  expect(screen.queryByRole("region", { name: copy.askStripLabel })).toBeNull();
});
