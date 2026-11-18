import type { Ref } from "react";
import { IconLayoutSidebarRightCollapse, IconLoader2, IconX } from "@tabler/icons-react";
import type { Bubble as ChatBubble, WorkspaceState } from "@/hooks/useWorkspace";
import { copy } from "@/lib/copy";
import { Pet } from "@/components/pet/Pet";
import { FeedbackButton } from "@/components/FeedbackButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Bubble } from "@/components/rail/Bubble";
import { ChatLog } from "@/components/rail/ChatLog";
import { Composer, type ComposerProps } from "@/components/rail/Composer";
import { OfferChips } from "@/components/rail/OfferChips";
import { OptChips } from "@/components/rail/OptChips";
import { PhotoGrid } from "@/components/rail/PhotoGrid";
import { RestateChips } from "@/components/rail/RestateChips";
import { WatchingCue } from "@/components/rail/WatchingCue";
import { EmptyThread, type EmptyThreadProps } from "./EmptyThread";
import styles from "./ChatView.module.css";

export type ChatState = Pick<WorkspaceState, "bubbles" | "busy" | "status" | "watching" | "restateChips" | "offerChips" | "optChips" | "optChipKind" | "optChipSeed">;
export type ChatActions = {
  onConfirmRestate: () => void;
  onCorrectRestate: () => void;
  onAcceptOffer: () => void;
  onOfferLater: () => void;
  onOpt: (text: string) => void;
  onRetry: (bubbleId: number) => void;
  onRebuild: () => void;
  onOpenWorkspace: (workspaceId: string) => void;
};

function WorkspaceCard({ card, status, busy, onOpen, onRebuild }: {
  card: Pick<Extract<ChatBubble, { kind: "workspace" }>, "title" | "state">;
  status: ChatState["status"];
  busy: boolean;
  onOpen?: () => void;
  onRebuild: () => void;
}) {
  return (
    <article className={styles.card} data-state={card.state}>
      <strong>{card.state === "building" ? status ?? card.title ?? copy.building : card.title ?? copy.workspaceCardLabel}</strong>
      {card.state === "ready" && onOpen && (
        <button type="button" className={styles.open} onClick={onOpen}>
          {copy.workspaceOpen}
        </button>
      )}
      {card.state === "failed" && (
        <>
          <span className={styles.failure}>{copy.workspaceBuildFailed}</span>
          <button type="button" className={styles.open} disabled={busy} onClick={onRebuild}>{copy.retry}</button>
        </>
      )}
    </article>
  );
}

export function ChatView({
  state, actions, composer, composerRef, emptyThread, quote, onDismissQuote, workspaceVisible = false, onOpenLegacyWorkspace, hidden = false, showHeader = true, onCollapse,
}: {
  state: ChatState;
  actions: ChatActions;
  composer: Omit<ComposerProps, "inputRef">;
  composerRef: Ref<HTMLTextAreaElement>;
  emptyThread: EmptyThreadProps;
  quote?: string;
  onDismissQuote: () => void;
  workspaceVisible?: boolean;
  onOpenLegacyWorkspace?: () => void;
  hidden?: boolean;
  showHeader?: boolean;
  onCollapse?: () => void;
}) {
  const { bubbles } = state;
  const lastAgent = bubbles.findLast((b) => b.kind === "agent");
  const lastStudentId = bubbles.findLast((b) => b.kind === "student")?.id;
  const recap = bubbles.find((b) => b.kind === "agent" && b.restate);
  const empty = bubbles.length === 0 && !onOpenLegacyWorkspace && !workspaceVisible;
  const emptyColumn = workspaceVisible && !bubbles.some((b) => b.kind === "student" || b.kind === "agent");

  return (
    <section aria-label={copy.drawerLabel} className={styles.chat} data-shell-panel data-testid="chat-view" data-column={(workspaceVisible && !hidden) || undefined} data-chat-wide={!workspaceVisible || undefined} hidden={hidden}>
      {showHeader && (
        <header className={styles.head} data-panel-header>
          <span className={styles.headPet}><Pet mood="idle" /></span>
          <span className={styles.name}>D-Friend</span>
          <FeedbackButton /><ThemeToggle />
          {workspaceVisible && <button type="button" className={styles.collapse} aria-label={copy.hideChat} onClick={onCollapse}><IconLayoutSidebarRightCollapse size={22} aria-hidden="true" /></button>}
        </header>
      )}
      {emptyColumn && <p className={styles.emptyHint}>{copy.chatEmptyHint}</p>}
      {recap?.kind === "agent" && (
        <p className={styles.recap}>
          <b>{copy.problemRecap}</b>
          {recap.text}
        </p>
      )}
      <ChatLog empty={empty} visible={!hidden} tick={bubbles}>
        {empty && <EmptyThread {...emptyThread} />}
        {bubbles.map((b) => {
          if (b.kind === "reset") return <div key={b.id} className={styles.divider}>{copy.workspaceResetDivider(b.title)}</div>;
          if (b.kind === "student") {
            return (
              <Bubble key={b.id} variant="student">
                <PhotoGrid photos={b.photos} />
                {b.text && <div>{b.text}</div>}
                {b.failed !== null && <div className={styles.studentError}>{b.failed}</div>}
                {b.failed !== null && b.id === lastStudentId && (
                  <button type="button" className={styles.retry} disabled={state.busy} onClick={() => actions.onRetry(b.id)}>{copy.retry}</button>
                )}
              </Bubble>
            );
          }
          if (b.kind === "workspace") {
            const { workspaceId } = b;
            return (
              <WorkspaceCard
                key={b.id}
                card={b}
                status={state.status}
                busy={state.busy}
                onOpen={workspaceId === null ? undefined : () => actions.onOpenWorkspace(workspaceId)}
                onRebuild={actions.onRebuild}
              />
            );
          }
          if (b.kind !== "agent") return <Bubble key={b.id} variant={b.kind}>{b.text}</Bubble>;

          const muted = b.id !== lastAgent?.id;
          if (b.waiting) {
            return (
              <Bubble key={b.id} variant="agent" muted={muted}>
                <span className={styles.typing}>
                  <IconLoader2 size={16} aria-hidden="true" />
                  {state.status ?? copy.thinking}
                </span>
              </Bubble>
            );
          }
          return (
            <div key={b.id} className={styles.reply}>
              {b.line === null
                ? <Bubble variant="agent" muted={muted}>{b.text}</Bubble>
                : <Bubble variant="agent-review" line={b.line} muted={muted}>{b.text}</Bubble>}
              {!muted && state.restateChips && (
                <RestateChips onConfirm={actions.onConfirmRestate} onCorrect={actions.onCorrectRestate} />
              )}
              {!muted && state.offerChips && <OfferChips onAccept={actions.onAcceptOffer} onLater={actions.onOfferLater} />}
              {!muted && state.optChips && (
                <OptChips options={state.optChips} kind={state.optChipKind} seed={state.optChipSeed} onPick={actions.onOpt} />
              )}
            </div>
          );
        })}
        {onOpenLegacyWorkspace && (
          <WorkspaceCard card={{ title: null, state: "ready" }} status={null} busy={state.busy} onOpen={onOpenLegacyWorkspace} onRebuild={actions.onRebuild} />
        )}
        {state.watching && <WatchingCue />}
      </ChatLog>
      {quote && (
        <blockquote className={styles.quote}>
          <span>{quote}</span>
          <button type="button" aria-label={copy.selectionDismiss} onClick={onDismissQuote}><IconX size={16} aria-hidden="true" /></button>
        </blockquote>
      )}
      <Composer {...composer} inputRef={composerRef} />
    </section>
  );
}
