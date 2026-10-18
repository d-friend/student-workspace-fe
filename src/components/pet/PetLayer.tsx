"use client";

import { type CSSProperties, type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useDesktop } from "@/hooks/useDesktop";
import { usePet } from "@/hooks/usePet";
import { FLY_MS } from "@/hooks/useUnfold";
import type { WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import { placePet, type Place, type Rect } from "@/lib/pet-place";
import { OfferChips } from "@/components/rail/OfferChips";
import { OptChips } from "@/components/rail/OptChips";
import { RestateChips } from "@/components/rail/RestateChips";
import type { Bubble } from "@/hooks/useWorkspace";
import { usePetAnchor } from "./PetAnchor";
import { ChatDrawer, type ChatActions, type ChatState } from "./ChatDrawer";
import type { ComposerProps } from "@/components/rail/Composer";
import { Pet } from "./Pet";
import { PetBubble, type SpokenBubble } from "./PetBubble";
import styles from "./PetLayer.module.css";

type PetSignals = Pick<WorkspaceState, "busy" | "building" | "status" | "checking" | "verdict" | "taskDone" | "newProblemCount" | "optChips">;

// How long the closing chat column slides out before it unmounts (ChatDrawer.module.css panelOut).
const CLOSE_MS = 350;
const MAX_SPOKEN = 3;
const PET = 88; // --pet-size at the docked place (PetLayer.module.css); the lane only exists on a wide stage
const SCROLL_MS = 120; // after the last scroll event the pet is no longer "moving with the scroll"
const BUBBLE_GAP = 12; // pet to bubble, beside it
const BUBBLE_W = 300; // PetBubble.module.css max-width
const ABOVE_MIN = 200; // above the pet needs this much room over it, else the bubble opens below

type Lane = Extract<Place, { mode: "lane" }>;

const relTo = (r: DOMRect, o: DOMRect): Rect => ({ left: r.left - o.left, top: r.top - o.top, right: r.right - o.left, bottom: r.bottom - o.top });

// Where the bubble goes in the lane, in the layer's coordinates: beside the pet, or above (below when there is no
// room above) with its right edge on the pet's.
function bubbleStyle(lane: Lane, w: number, h: number): { style: CSSProperties; up: boolean } {
  if (lane.side === "right") {
    const left = lane.left + PET + BUBBLE_GAP;
    const style: CSSProperties = { left, maxWidth: `min(${BUBBLE_W}px, calc(100vw - 32px), ${Math.max(0, w - left - 8)}px)` };
    return lane.flip ? { style: { ...style, bottom: h - lane.top - PET }, up: true } : { style: { ...style, top: lane.top }, up: false };
  }
  const style: CSSProperties = { right: w - lane.left - PET };
  const up = lane.flip || lane.top >= ABOVE_MIN;
  return up ? { style: { ...style, bottom: h - lane.top + 8 }, up } : { style: { ...style, top: lane.top + PET + 8 }, up };
}

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
  // "Bài mới": the pet hops from where it is back to its place on the entry, the way the unfold carried it away.
  // Decided while rendering, so the first frame of the entry already has the flight on (no snap first).
  const [seenReset, setSeenReset] = useState(state.newProblemCount);
  const [returning, setReturning] = useState(false);
  if (state.newProblemCount !== seenReset) {
    setSeenReset(state.newProblemCount);
    if (entry && !matchMedia("(prefers-reduced-motion: reduce)").matches) setReturning(true);
  }
  useEffect(() => {
    if (!returning) return;
    const t = setTimeout(() => setReturning(false), FLY_MS);
    return () => clearTimeout(t);
  }, [returning]);
  const travelling = flying || returning;
  const desktop = useDesktop();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false); // desktop only: the column is sliding out
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [unread, setUnread] = useState(false);
  const petRef = useRef<HTMLButtonElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
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
    if (travelling) celebrate();
  }, [travelling, celebrate]);

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
    !open && !travelling && (latest !== undefined || status !== null) && (key === null || key !== hiddenKey) && (!entry || talked);
  const chips =
    latest?.kind === "agent" && !latest.waiting && latest.id === state.bubbles.findLast((b) => b.kind === "agent")?.id;
  const docked = open && desktop && !entry;

  // The lane: beside the active line of the doc, only when nothing else has a claim on the pet.
  const { anchor, scroller } = usePetAnchor();
  const laneOn = !entry && !open && !leaving && !travelling && anchor !== null && scroller !== null;
  const [place, setPlace] = useState<Place>({ mode: "dock" });
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    const layer = layerRef.current;
    if (!laneOn || !layer || !anchor || !scroller) return;
    let raf = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const measure = () => {
      raf = 0;
      const column = anchor.closest("[data-pet-column]");
      const L = layer.getBoundingClientRect();
      // Everything in the layer's own coordinates, so the result is the pet's left/top. The scroller is the box the
      // pet stays inside: it does not climb over the top bar.
      const next = column
        ? placePet({
            anchor: relTo(anchor.getBoundingClientRect(), L),
            column: relTo(column.getBoundingClientRect(), L),
            stage: relTo(scroller.getBoundingClientRect(), L),
            pet: PET,
            bubbleW: BUBBLE_W,
          })
        : ({ mode: "dock" } as const);
      setStageSize((s) => (s.w === L.width && s.h === L.height ? s : { w: L.width, h: L.height }));
      setPlace((p) => (p.mode === "lane" && next.mode === "lane" && p.left === next.left && p.top === next.top && p.side === next.side && p.flip === next.flip ? p : next));
    };
    const schedule = () => {
      raf ||= requestAnimationFrame(measure);
    };
    const onScroll = () => {
      setScrolling(true);
      clearTimeout(idle);
      idle = setTimeout(() => setScrolling(false), SCROLL_MS);
      schedule();
    };
    measure();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    for (const el of [layer, scroller, anchor.closest("[data-pet-column]"), anchor]) if (el) ro?.observe(el);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      ro?.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      setScrolling(false);
    };
  }, [laneOn, anchor, scroller]);
  const lane = laneOn && place.mode === "lane" ? place : null;
  // The doc's bottom padding keeps its last line clear of the docked pet; in the lane the pet is beside it.
  const inLane = lane !== null;
  useEffect(() => {
    if (!inLane || !scroller) return;
    scroller.style.setProperty("--pet-clear", "0px");
    return () => void scroller.style.removeProperty("--pet-clear");
  }, [inLane, scroller]);
  const laneBubble = lane ? bubbleStyle(lane, stageSize.w, stageSize.h) : null;

  return (
    // With a photo picked the greeting is gone, so the pet docks; it is still the entry's pet.
    <div
      ref={layerRef}
      className={styles.layer}
      data-place={entry && !hasPhoto ? "entry" : "dock"}
      data-fly={travelling || undefined}
      data-chat={docked || undefined}
      data-lane={lane ? "" : undefined}
    >
      <button
        ref={petRef}
        data-moving={lane && scrolling ? "scroll" : undefined}
        // The reduced-motion stylesheet rule covers a change mid-session; this one is what a teleport looks like at once.
        style={lane ? { top: lane.top, left: lane.left, transition: matchMedia("(prefers-reduced-motion: reduce)").matches ? "none" : undefined } : undefined}
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
        <Pet mood={travelling ? "happy" : mood} celebrateKey={celebrateKey} />
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
          // The entry keeps its message: there it can be the only place an instruction (a retake) is shown. So does
          // a bubble that is asking the student to choose (its chips) or a question: it stays until they answer or close it.
          autoHide={
            !entry &&
            !(chips && (state.restateChips || state.offerChips || state.optChips)) &&
            !(latest?.kind === "agent" && latest.ask !== null)
          }
          onHide={() => setHiddenKey(key)}
          side={lane?.side}
          flip={laneBubble?.up}
          style={laneBubble?.style}
        >
          {chips && state.restateChips && (
            <RestateChips onConfirm={actions.onConfirmRestate} onCorrect={actions.onCorrectRestate} />
          )}
          {chips && state.offerChips && <OfferChips onAccept={actions.onAcceptOffer} onLater={actions.onOfferLater} />}
          {chips && state.optChips && (
            <OptChips options={state.optChips} onPick={actions.onOpt} onWriteOwn={() => inputRef.current?.focus(true)} />
          )}
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
