"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatActions, ChatState } from "@/components/chat/ChatView";
import { OfferChips } from "@/components/rail/OfferChips";
import { OptChips } from "@/components/rail/OptChips";
import { RestateChips } from "@/components/rail/RestateChips";
import { usePet } from "@/hooks/usePet";
import type { Bubble, WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import { usePetAnchor } from "./PetAnchor";
import { Pet } from "./Pet";
import { PetBubble, type SpokenBubble } from "./PetBubble";
import styles from "./PetLayer.module.css";

type PetSignals = Pick<WorkspaceState, "building" | "checking" | "verdict" | "taskDone"> & Omit<ChatState, "watching">;
type ChipActions = Pick<ChatActions, "onConfirmRestate" | "onCorrectRestate" | "onAcceptOffer" | "onOfferLater" | "onOpt">;

const isSpoken = (b: Bubble): b is SpokenBubble => b.kind === "agent" || b.kind === "error" || b.kind === "note";

export function PetLayer({ state, actions, onWriteOwn, offerOnCard = false, questionInStrip = false }: {
  state: PetSignals;
  actions: ChipActions;
  onWriteOwn: () => void;
  offerOnCard?: boolean;
  questionInStrip?: boolean; // the mobile ask strip already shows the pending question and its chips
}) {
  const { mood, celebrateKey } = usePet(state);
  const { anchor } = usePetAnchor();
  const inlineSlot = anchor?.hasAttribute("data-pet-inline") ? anchor.querySelector<HTMLElement>("[data-pet-slot]") : null;
  const spokenSlot = anchor?.querySelector<HTMLElement>("[data-pet-spoken-slot]") ?? null;
  const doneInline = anchor?.hasAttribute("data-pet-done");
  const itemId = inlineSlot && spokenSlot && anchor?.matches("[data-pet-anchor][data-n]")
    ? JSON.stringify([anchor.closest<HTMLElement>("[data-block-id]")?.dataset.blockId, anchor.dataset.n])
    : null;

  const [, setAnchorTick] = useState(0);
  useEffect(() => {
    if (!anchor) return;
    const n = anchor.dataset.n;
    const inline = anchor.hasAttribute("data-pet-inline");
    // The step can advance in place after publishing the verdict.
    const observer = new MutationObserver(() => {
      if (anchor.dataset.n !== n || anchor.hasAttribute("data-pet-inline") !== inline ||
          anchor.hasAttribute("data-pet-done") !== doneInline ||
          anchor.querySelector("[data-pet-slot]") !== inlineSlot ||
          anchor.querySelector("[data-pet-spoken-slot]") !== spokenSlot) {
        setAnchorTick((tick) => tick + 1);
      }
    });
    observer.observe(anchor, { attributes: true, attributeFilter: ["data-n", "data-pet-inline", "data-pet-done"], childList: true, subtree: true });
    return () => observer.disconnect();
  }, [anchor, itemId, inlineSlot, spokenSlot, doneInline]);

  const latest = state.bubbles.findLast(isSpoken);
  const turn = latest?.turn ?? 0;
  const status = state.building ? state.status ?? copy.building : null;
  const key = latest ? `${latest.id}:${latest.kind === "agent" && latest.waiting}` : null;
  const chips = latest?.kind === "agent" && !latest.waiting;
  const awaitingAnswer = Boolean(
    (chips && (state.restateChips || state.offerChips || state.optChips)) ||
    (latest?.kind === "agent" && latest.ask !== null),
  );

  const [seenItem, setSeenItem] = useState<{ anchor: HTMLElement | null; id: string | null }>({ anchor: null, id: null });
  const [staleSpeech, setStaleSpeech] = useState<{ turn: number; key: string | null } | null>(null);
  const [dismissedSpeech, setDismissedSpeech] = useState<string | null>(null);
  if (seenItem.anchor !== anchor || seenItem.id !== itemId) {
    setSeenItem({ anchor, id: itemId });
    // Speech from before this item belongs in the chat. Pending questions and choices stay interactive.
    if (itemId !== null && !awaitingAnswer) setStaleSpeech({ turn, key });
  }
  if (!inlineSlot || !spokenSlot) return null;

  // Keep an announce and its completion together, even if they straddle the item's appearance.
  // The done anchor can show the closing reply once the step choices are gone.
  const stale = (key !== null && key === staleSpeech?.key && !doneInline) ||
    (itemId !== null && turn === staleSpeech?.turn && !awaitingAnswer);
  const showSpeech = (latest !== undefined || status !== null) && !stale && !(questionInStrip && awaitingAnswer) && (key === null || key !== dismissedSpeech);
  const spoken = latest ? state.bubbles.filter((b): b is SpokenBubble => isSpoken(b) && b.turn === turn).slice(-3) : [];
  const dismiss = () => setDismissedSpeech(key);

  return (
    <>
      {createPortal(
        <span className={styles.inlinePet}><Pet mood={mood} celebrateKey={celebrateKey} /></span>,
        inlineSlot,
      )}
      {showSpeech && createPortal(
        <PetBubble key={turn} bubbles={spoken} status={status} onClose={dismiss} onHide={dismiss} autoHide={!awaitingAnswer}>
          {chips && state.restateChips && <RestateChips onConfirm={actions.onConfirmRestate} onCorrect={actions.onCorrectRestate} />}
          {chips && state.offerChips && <OfferChips onAccept={actions.onAcceptOffer} onLater={actions.onOfferLater} />}
          {chips && state.optChips && !(state.optChipKind === "offer" && offerOnCard) && (
            <OptChips options={state.optChips} kind={state.optChipKind} seed={state.optChipSeed} onPick={actions.onOpt} onWriteOwn={onWriteOwn} />
          )}
        </PetBubble>,
        spokenSlot,
      )}
    </>
  );
}
