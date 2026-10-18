import { type KeyboardEvent, type RefObject, useEffect } from "react";
import { IconX } from "@tabler/icons-react";
import { useDesktop } from "@/hooks/useDesktop";
import type { WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import { Bubble } from "@/components/rail/Bubble";
import { ChatLog } from "@/components/rail/ChatLog";
import { Composer, type ComposerProps } from "@/components/rail/Composer";
import { NewProblemButton } from "@/components/rail/NewProblemButton";
import { OfferChips } from "@/components/rail/OfferChips";
import { OptChips } from "@/components/rail/OptChips";
import { RestateChips } from "@/components/rail/RestateChips";
import { WatchingCue } from "@/components/rail/WatchingCue";
import { Pet } from "./Pet";
import styles from "./ChatDrawer.module.css";

export const JPEG_PREFIX = "data:image/jpeg;base64,";

export type ChatState = Pick<WorkspaceState, "bubbles" | "hasMessages" | "watching" | "restateChips" | "offerChips" | "optChips">;
export type ChatActions = {
  onNewProblem: () => void;
  onConfirmRestate: () => void;
  onCorrectRestate: () => void;
  onAcceptOffer: () => void;
  onOfferLater: () => void;
  onOpt: (text: string) => void;
};

// From 800px a column beside the stage (the stage narrows, nothing is frozen); below, a modal bottom sheet over it,
// with the pet's button and the stage inert. `leaving` keeps the column mounted while it slides out.
export function ChatDrawer({
  state,
  actions,
  composer,
  composerRef,
  onClose,
  leaving = false,
}: {
  state: ChatState;
  actions: ChatActions;
  composer: Omit<ComposerProps, "inputRef">;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  onClose: () => void;
  leaving?: boolean;
}) {
  const desktop = useDesktop();
  const { bubbles } = state;
  const lastAgent = bubbles.findLast((b) => b.kind === "agent");
  const recap = bubbles.find((b) => b.kind === "agent" && b.restate);

  // preventScroll: the column starts off-screen, and a plain focus() scrolls the overflow-hidden shell sideways to it.
  useEffect(() => composerRef.current?.focus({ preventScroll: true }), [composerRef]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    onClose();
  };

  return (
    <>
      <button type="button" className={styles.scrim} tabIndex={-1} aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal={!desktop}
        aria-label={copy.drawerLabel}
        className={styles.drawer}
        data-leaving={leaving || undefined}
        inert={leaving}
        onKeyDown={onKeyDown}
      >
        <div className={styles.grab} aria-hidden="true" />
        <header className={styles.head}>
          <Pet mood="idle" className={styles.headPet} />
          <div className={styles.title}>
            <p className={styles.name}>D-Friend</p>
            <p className={styles.sub}>{copy.drawerSub}</p>
          </div>
          {state.hasMessages && <NewProblemButton onClick={actions.onNewProblem} />}
          <button type="button" className={styles.close} aria-label={copy.drawerClose} onClick={onClose}>
            <IconX size={20} aria-hidden="true" />
          </button>
        </header>
        {recap?.kind === "agent" && (
          <p className={styles.recap}>
            <b>{copy.problemRecap}</b>
            {recap.text}
          </p>
        )}
        <ChatLog empty={bubbles.length === 0} tick={bubbles}>
          {bubbles.map((b) => {
            if (b.kind === "student") {
              return (
                <Bubble key={b.id} variant="student">
                  {b.photo && (
                    // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, next/image cannot optimize it
                    <img src={JPEG_PREFIX + b.photo} alt={copy.photoChip} style={{ maxWidth: "100%", borderRadius: 8 }} />
                  )}
                  {b.text}
                </Bubble>
              );
            }
            if (b.kind !== "agent") {
              return (
                <Bubble key={b.id} variant={b.kind}>
                  {b.text}
                </Bubble>
              );
            }
            const muted = b.id !== lastAgent?.id;
            return (
              <div key={b.id} style={{ display: "contents" }}>
                {b.line === null ? (
                  <Bubble variant="agent" muted={muted}>
                    {b.text}
                  </Bubble>
                ) : (
                  <Bubble variant="agent-review" line={b.line} muted={muted}>
                    {b.text}
                  </Bubble>
                )}
                {!muted && state.restateChips && (
                  <RestateChips onConfirm={actions.onConfirmRestate} onCorrect={actions.onCorrectRestate} />
                )}
                {!muted && state.offerChips && (
                  <OfferChips onAccept={actions.onAcceptOffer} onLater={actions.onOfferLater} />
                )}
                {!muted && state.optChips && <OptChips options={state.optChips} onPick={actions.onOpt} />}
              </div>
            );
          })}
          {state.watching && <WatchingCue />}
        </ChatLog>
        <Composer {...composer} inputRef={composerRef} />
      </div>
    </>
  );
}
