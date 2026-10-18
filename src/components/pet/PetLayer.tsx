"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { usePet } from "@/hooks/usePet";
import type { WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import { OfferChips } from "@/components/rail/OfferChips";
import { RestateChips } from "@/components/rail/RestateChips";
import { ChatDrawer, type ChatActions, type ChatState } from "./ChatDrawer";
import type { ComposerProps } from "@/components/rail/Composer";
import { Pet } from "./Pet";
import { PetBubble, type SpokenBubble } from "./PetBubble";
import styles from "./PetLayer.module.css";

type PetSignals = Pick<WorkspaceState, "busy" | "building" | "checking" | "verdict" | "taskDone">;

// Always mounted, over the stage. Holds the drawer's open state and which bubble the student has put away.
export function PetLayer({
  state,
  inputRef,
  composer,
  onOpenChange,
  ...actions
}: {
  state: ChatState & PetSignals;
  // The store's focusInput() calls inputRef.current.focus(); here that opens the drawer, because the composer lives in it.
  inputRef: RefObject<HTMLTextAreaElement | null>;
  composer: Omit<ComposerProps, "inputRef">;
  onOpenChange?: (open: boolean) => void;
} & ChatActions) {
  const { mood, celebrateKey } = usePet(state);
  const [open, setOpen] = useState(false);
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const petRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);

  const latest = state.bubbles.findLast((b): b is SpokenBubble => b.kind !== "student");
  // A waiting bubble that gets its words is a new key, so it comes back if it was put away while thinking.
  const key = latest ? `${latest.id}:${latest.kind === "agent" && latest.waiting}` : null;

  const openDrawer = useCallback(() => {
    setUnread(false);
    setOpen(true);
  }, []);
  // Whatever was said while the drawer was open has been seen, so it does not pop back as a bubble.
  const closeDrawer = () => {
    setHiddenKey(key);
    setOpen(false);
  };

  useEffect(() => {
    inputRef.current = {
      focus: () => {
        openDrawer();
        composerRef.current?.focus();
      },
    } as HTMLTextAreaElement;
    return () => {
      inputRef.current = null;
    };
  }, [inputRef, openDrawer]);

  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);

  useEffect(() => {
    if (wasOpen.current && !open) petRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const showBubble = !open && latest !== undefined && key !== hiddenKey;
  const chips =
    latest?.kind === "agent" && !latest.waiting && latest.id === state.bubbles.findLast((b) => b.kind === "agent")?.id;

  return (
    <div className={styles.layer}>
      <button
        ref={petRef}
        type="button"
        className={styles.pet}
        aria-label={copy.petOpen}
        aria-describedby={unread ? "pet-unread" : undefined}
        inert={open}
        onClick={openDrawer}
      >
        <Pet mood={mood} celebrateKey={celebrateKey} />
        {unread && !open && (
          <span id="pet-unread" className={styles.badge}>
            <span className={styles.srOnly}>{copy.petUnread}</span>
          </span>
        )}
      </button>
      {showBubble && (
        <PetBubble
          key={latest.id}
          bubble={latest}
          onClose={() => {
            setHiddenKey(key);
            setUnread(true);
          }}
          onReply={openDrawer}
        >
          {chips && state.restateChips && (
            <RestateChips onConfirm={actions.onConfirmRestate} onCorrect={actions.onCorrectRestate} />
          )}
          {chips && state.offerChips && <OfferChips onAccept={actions.onAcceptOffer} onLater={actions.onOfferLater} />}
        </PetBubble>
      )}
      {open && (
        <ChatDrawer state={state} actions={actions} composer={composer} composerRef={composerRef} onClose={closeDrawer} />
      )}
    </div>
  );
}
