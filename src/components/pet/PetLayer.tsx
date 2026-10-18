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
  entry,
  entryInputRef,
  composer,
  onOpenChange,
  onChatOpened,
  flying = false,
  ...actions
}: {
  state: ChatState & PetSignals;
  // The store's focusInput(reveal) calls inputRef.current.focus(reveal). Whichever composer is on screen takes it:
  // the entry's, else the drawer's. A closed drawer opens only when reveal is set (a failed send, a correction).
  inputRef: RefObject<{ focus: (reveal?: boolean) => void } | null>;
  // The entry screen is showing: no conversation yet, so the pet greets instead of opening the drawer.
  entry: boolean;
  entryInputRef: RefObject<HTMLTextAreaElement | null>;
  composer: Omit<ComposerProps, "inputRef" | "entry">;
  onOpenChange?: (open: boolean) => void;
  // Called once per closed-to-open, with whether the unread badge was showing.
  onChatOpened: (unread: boolean) => void;
  // The unfold is carrying the pet from the entry to its dock (spec §6): it travels, hops, and is happy about it.
  flying?: boolean;
} & ChatActions) {
  const { mood, celebrate, celebrateKey } = usePet(state);
  const [open, setOpen] = useState(false);
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const petRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);
  const wantFocus = useRef<boolean | null>(null); // a focus request waiting for the render that shows the right composer
  const [focusTick, setFocusTick] = useState(0);

  const latest = state.bubbles.findLast((b): b is SpokenBubble => b.kind !== "student");
  // A waiting bubble that gets its words is a new key, so it comes back if it was put away while thinking.
  const key = latest ? `${latest.id}:${latest.kind === "agent" && latest.waiting}` : null;

  const openDrawer = useCallback(() => {
    onChatOpened(unread);
    setUnread(false);
    setOpen(true);
  }, [onChatOpened, unread]);
  // Whatever was said while the drawer was open has been seen, so it does not pop back as a bubble.
  // The drawer has no place on the entry (Bài mới from the drawer lands there).
  if (entry && open) setOpen(false);
  const closeDrawer = () => {
    setHiddenKey(key);
    setOpen(false);
  };

  useEffect(() => {
    // Deferred to an effect: the store asks right after publishing, before React has rendered the new screen.
    inputRef.current = {
      focus: (reveal = false) => {
        wantFocus.current = reveal;
        setFocusTick((t) => t + 1);
      },
    };
    return () => {
      inputRef.current = null;
    };
  }, [inputRef]);

  useEffect(() => {
    const reveal = wantFocus.current;
    if (reveal === null) return;
    wantFocus.current = null;
    if (entry) entryInputRef.current?.focus();
    else if (open) composerRef.current?.focus();
    else if (reveal) openDrawer();
  }, [focusTick, entry, open, entryInputRef, openDrawer]);

  // Picking a photo on the entry is something to be glad about.
  const hasPhoto = Boolean(composer.photo);
  const hadPhoto = useRef(hasPhoto);
  useEffect(() => {
    if (entry && hasPhoto && !hadPhoto.current) celebrate();
    hadPhoto.current = hasPhoto;
  }, [entry, hasPhoto, celebrate]);

  useEffect(() => {
    if (flying) celebrate();
  }, [flying, celebrate]);

  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);

  useEffect(() => {
    if (wasOpen.current && !open) petRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // The entry has nobody to talk to yet, except to say that something failed.
  const showBubble = !open && !flying && latest !== undefined && key !== hiddenKey && (!entry || latest.kind === "error");
  const chips =
    latest?.kind === "agent" && !latest.waiting && latest.id === state.bubbles.findLast((b) => b.kind === "agent")?.id;

  return (
    // With a photo picked the greeting is gone, so the pet docks; it is still the entry's pet.
    <div className={styles.layer} data-place={entry && !hasPhoto ? "entry" : "dock"} data-fly={flying || undefined}>
      <button
        ref={petRef}
        type="button"
        className={styles.pet}
        aria-label={entry ? copy.brand : copy.petOpen}
        aria-describedby={unread && !entry ? "pet-unread" : undefined}
        inert={open}
        onClick={entry ? celebrate : openDrawer}
      >
        <Pet mood={flying ? "happy" : mood} celebrateKey={celebrateKey} />
        {unread && !open && !entry && (
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
            if (!entry) setUnread(true);
          }}
          onReply={entry ? () => entryInputRef.current?.focus() : openDrawer}
        >
          {chips && state.restateChips && (
            <RestateChips onConfirm={actions.onConfirmRestate} onCorrect={actions.onCorrectRestate} />
          )}
          {chips && state.offerChips && <OfferChips onAccept={actions.onAcceptOffer} onLater={actions.onOfferLater} />}
        </PetBubble>
      )}
      {open && !entry && (
        <ChatDrawer state={state} actions={actions} composer={composer} composerRef={composerRef} onClose={closeDrawer} />
      )}
    </div>
  );
}
