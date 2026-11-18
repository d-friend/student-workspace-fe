import { IconKeyboard } from "@tabler/icons-react";
import type { WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import { MdInline } from "@/workspace/md";
import { Pet } from "@/components/pet/Pet";
import { OfferChips } from "@/components/rail/OfferChips";
import { OptChips } from "@/components/rail/OptChips";
import { RestateChips } from "@/components/rail/RestateChips";
import type { ChatActions } from "./ChatView";
import styles from "./AskStrip.module.css";

export type AskState = Pick<WorkspaceState, "bubbles" | "askPending" | "restateChips" | "offerChips" | "optChips" | "optChipKind" | "optChipSeed">;
type AskActions = Pick<ChatActions, "onConfirmRestate" | "onCorrectRestate" | "onAcceptOffer" | "onOfferLater" | "onOpt">;

export function pendingAsk(state: AskState, offerOnCard: boolean) {
  const { askPending, restateChips, offerChips, optChips, optChipKind, optChipSeed } = state;
  const options = optChipKind === "offer" && offerOnCard ? null : optChips;
  if (!askPending && !restateChips && !offerChips && !options?.length) return null;
  const agent = state.bubbles.findLast((bubble) => bubble.kind === "agent");
  if (!agent || agent.waiting) return null;
  return { id: agent.id, text: agent.text, restateChips, offerChips, options, optChipKind, optChipSeed };
}

export function AskStrip({ ask, actions, onKeyboard }: {
  ask: ReturnType<typeof pendingAsk>;
  actions: AskActions;
  onKeyboard: () => void;
}) {
  if (!ask) return null;
  return (
    <section className={styles.strip} data-ask-strip aria-label={copy.askStripLabel}>
      <div className={styles.row}>
        <Pet mood="idle" className={styles.avatar} />
        <p className={styles.question} tabIndex={0}><MdInline text={ask.text} /></p>
        <button type="button" className={styles.keyboard} aria-label={copy.askStripKeyboard} onClick={onKeyboard}>
          <IconKeyboard size={22} aria-hidden="true" />
        </button>
      </div>
      {ask.restateChips && <RestateChips onConfirm={actions.onConfirmRestate} onCorrect={actions.onCorrectRestate} />}
      {ask.offerChips && <OfferChips onAccept={actions.onAcceptOffer} onLater={actions.onOfferLater} />}
      {!!ask.options?.length && <OptChips options={ask.options} kind={ask.optChipKind} seed={ask.optChipSeed} onPick={actions.onOpt} />}
    </section>
  );
}
