"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useDesktop } from "@/hooks/useDesktop";
import { usePet } from "@/hooks/usePet";
import type { WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import { OfferChips } from "@/components/rail/OfferChips";
import { RestateChips } from "@/components/rail/RestateChips";
import type { Bubble } from "@/hooks/useWorkspace";
import { ChatDrawer, type ChatActions, type ChatState } from "./ChatDrawer";
import type { ComposerProps } from "@/components/rail/Composer";
import { Pet } from "./Pet";
import { PetBubble, type SpokenBubble } from "./PetBubble";
import styles from "./PetLayer.module.css";

type PetSignals = Pick<WorkspaceState, "busy" | "building" | "status" | "checking" | "verdict" | "taskDone">;

// How long the closing chat column slides out before it unmounts (ChatDrawer.module.css panelOut).
const CLOSE_MS = 350;
const MAX_SPOKEN = 3;

// Always mounted, over the stage. Holds the drawer's open state and which bubble the student has put away.
// From 800px the drawer is a column beside the stage and the pet moves to the seam between them.
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
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false); // desktop only: the column is sliding out
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const petRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const wasOpen = useRef(false);
  const wantFocus = useRef<boolean | null>(null); // a focus request waiting for the render that shows the right composer
  const [focusTick, setFocusTick] = useState(0);

  const isSpoken = (b: Bubble): b is SpokenBubble => b.kind !== "student";
  const latest = state.bubbles.findLast(isSpoken);
  // Everything D-Friend said in the latest exchange (an announce, then its reply), newest last. Older turns stay
  // in the drawer's log, not in the bubble.
  const spoken = latest ? state.bubbles.filter((b): b is SpokenBubble => isSpoken(b) && b.turn === latest.turn).slice(-MAX_SPOKEN) : [];
  const turn = latest?.turn ?? 0;
  const status = state.building ? (state.status ?? copy.building) : null;
  // A waiting bubble that gets its words is a new key, so it comes back if it was put away while thinking.
  const key = latest ? `${latest.id}:${latest.kind === "agent" && latest.waiting}` : null;

  const openDrawer = useCallback(() => {
    onChatOpened(unread);
    setUnread(false);
    setLeaving(false);
    setOpen(true);
  }, [onChatOpened, unread]);
  // Whatever was said while the drawer was open has been seen, so it does not pop back as a bubble.
  // The drawer has no place on the entry (Bài mới from the drawer lands there).
  if (entry && open) setOpen(false);
  const closeDrawer = () => {
    setHiddenKey(key);
    setOpen(false);
    setLeaving(desktop);
  };

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), CLOSE_MS);
    return () => clearTimeout(t);
  }, [leaving]);

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
    else if (open) composerRef.current?.focus({ preventScroll: true });
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

  // The entry is silent until a conversation exists. A text-only reply (an unreadable photo, a clarification) lands
  // back on the entry, and the student must still see it: the entry has no drawer, the bubble is the only place.
  const talked = state.bubbles.length > 0;
  // A build with nothing said yet (a foundation request) still shows its progress.
  const showBubble =
    !open && !flying && (latest !== undefined || status !== null) && (key === null || key !== hiddenKey) && (!entry || talked);
  const chips =
    latest?.kind === "agent" && !latest.waiting && latest.id === state.bubbles.findLast((b) => b.kind === "agent")?.id;
  const docked = open && desktop && !entry;

  return (
    // With a photo picked the greeting is gone, so the pet docks; it is still the entry's pet.
    <div className={styles.layer} data-place={entry && !hasPhoto ? "entry" : "dock"} data-fly={flying || undefined} data-chat={docked || undefined}>
      <button
        ref={petRef}
        type="button"
        className={styles.pet}
        aria-label={entry ? copy.brand : open ? copy.petClose : copy.petOpen}
        aria-describedby={unread && !entry ? "pet-unread" : undefined}
        inert={open && !desktop}
        onClick={
          entry
            ? () => {
                setHiddenKey(null); // a dismissed reply comes back
                celebrate();
              }
            : open
              ? closeDrawer
              : openDrawer
        }
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
          key={turn}
          bubbles={spoken}
          status={status}
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
      {(open || leaving) && !entry && (
        <ChatDrawer
          state={state}
          actions={actions}
          composer={composer}
          composerRef={composerRef}
          onClose={closeDrawer}
          leaving={!open}
        />
      )}
    </div>
  );
}
