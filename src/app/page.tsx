"use client";

import { type ChangeEvent, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ProfileGate } from "@/components/ProfileGate";
import { AskStrip, pendingAsk } from "@/components/chat/AskStrip";
import { ChatView } from "@/components/chat/ChatView";
import { Shell } from "@/components/Shell";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { useSidebar } from "@/components/sidebar/useSidebar";
import { PetAnchorProvider } from "@/components/pet/PetAnchor";
import { Pet } from "@/components/pet/Pet";
import { PetLayer } from "@/components/pet/PetLayer";
import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { SheetSwitcher } from "@/components/work/SheetSwitcher";
import { WorkspaceFrame } from "@/components/work/WorkspaceFrame";
import { useDesktop } from "@/hooks/useDesktop";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProgress } from "@/hooks/useProgress";
import { copy } from "@/lib/copy";
import { frameDoc } from "@/lib/frame";
import { JPEG_PREFIX } from "@/lib/photo";
import { openProgressSession, progressCards } from "@/lib/progress";
import { track, type TrackEvents } from "@/lib/track";
import type { BlockCtx, Workspace } from "@/workspace/types";
import { WorkspaceView } from "@/workspace/WorkspaceView";
import type { SelectionQuote } from "@/workspace/SelectionAsk";
import { MdInline } from "@/workspace/md";
import styles from "./page.module.css";

type PhotoSource = TrackEvents["photo_picked"]["source"];

export default function Page() {
  return <ProfileGate><Home /></ProfileGate>;
}

function Home() {
  const ws = useWorkspace();
  const progress = useProgress();
  const cards = useMemo(() => progressCards(progress.items), [progress.items]);
  const progressTracked = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { pickPhoto } = ws;
  const addPhotos = useCallback(async (files: File[], source: PhotoSource) => {
    for (const file of files) await pickPhoto(file, source);
  }, [pickPhoto]);
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = "";
    void addPhotos(files, input.hasAttribute("capture") ? "snap_button" : "composer_button");
  };

  // Attach pasted images wherever the focus is. Leave text pastes to the browser.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void addPhotos(files, "paste");
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addPhotos]);

  // Attach dragged images wherever they land.
  // dragover must be cancelled, or the browser opens the image instead of firing drop.
  useEffect(() => {
    const hasImage = (e: DragEvent) => Array.from(e.dataTransfer?.items ?? []).some((i) => i.type.startsWith("image/"));
    const onDragOver = (e: DragEvent) => {
      if (hasImage(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!files.length) return;
      e.preventDefault();
      void addPhotos(files, "drop");
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [addPhotos]);

  // html is null on the server and on the first client render, so location is only read in the browser.
  const srcDoc = useMemo(() => (ws.html === null ? null : frameDoc(ws.html, location.origin)), [ws.html]);

  const [view, setView] = useState<"chat" | "workspace">("chat");
  const [menuTarget, setMenuTarget] = useState<HTMLDivElement | null>(null);
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);
  const [actionBarTarget, setActionBarTarget] = useState<HTMLDivElement | null>(null);
  const [offerOnCard, setOfferOnCard] = useState(false);
  const [skippedBuildId, setSkippedBuildId] = useState<number | null>(null);
  // The quote belongs to the session it was picked in: "Bài mới" bumps newProblemCount, which drops it.
  const [picked, setPicked] = useState<{ quote: SelectionQuote; session: number } | null>(null);
  const quote = picked && picked.session === ws.newProblemCount ? picked.quote : null;
  const setQuote = (q: SelectionQuote | null) => setPicked(q && { quote: q, session: ws.newProblemCount });
  const desktop = useDesktop();
  const side = useSidebar();

  const legacyWorkspace = ws.activeId === null && srcDoc !== null;
  const hasWorkspace = ws.activeId !== null || legacyWorkspace;
  const buildingCard = ws.building ? ws.bubbles.findLast((b) => b.kind === "workspace" && b.state === "building") : undefined;
  const buildingId = buildingCard?.id ?? null;
  const failedId = ws.bubbles.findLast((b) => b.kind === "workspace" && b.state === "failed")?.id ?? null;
  const [previous, setPrevious] = useState({
    hasWorkspace: false, buildingId: null as number | null, failedId: null as number | null,
    buildFailed: false, session: ws.newProblemCount,
  });
  if (previous.hasWorkspace !== hasWorkspace || previous.buildingId !== buildingId ||
      previous.failedId !== failedId || previous.buildFailed !== ws.buildFailed || previous.session !== ws.newProblemCount) {
    setPrevious({ hasWorkspace, buildingId, failedId, buildFailed: ws.buildFailed, session: ws.newProblemCount });
    if (previous.session !== ws.newProblemCount || (failedId !== null && previous.failedId !== failedId) ||
        (ws.buildFailed && !previous.buildFailed && !hasWorkspace)) {
      setView("chat");
    } else if ((buildingId !== null && previous.buildingId !== buildingId) ||
        // A restored workspace or fast build can arrive without a preceding building snapshot.
        (hasWorkspace && !previous.hasWorkspace && previous.buildingId === null)) {
      setView("workspace");
    }
  }

  const showWorkspace = (desktop || view === "workspace") && (hasWorkspace || buildingId !== null);
  const hideChat = showWorkspace && !desktop;
  const showBuild = buildingId !== null && buildingId !== skippedBuildId;
  const ask = hideChat && !side.drawerOpen ? pendingAsk(ws, !showBuild && offerOnCard) : null;
  const lastAgentId = ws.bubbles.findLast((b) => b.kind === "agent" && !b.waiting)?.id ?? null;
  const [lastSeenAgentId, setLastSeenAgentId] = useState<number | null>(null);
  const seenAgentId = hideChat ? ask?.id ?? lastSeenAgentId : lastAgentId;
  if (seenAgentId !== lastSeenAgentId) setLastSeenAgentId(seenAgentId);
  // Removing a failed turn's announce can expose an older message that was already read.
  // A waiting reply may have a lower ID than the announce inserted before it.
  const unread = lastAgentId !== null && lastAgentId !== seenAgentId &&
    (lastSeenAgentId === null || lastAgentId > lastSeenAgentId || ws.bubbles.some((b) => b.id === lastSeenAgentId));
  const openChat = () => {
    setLastSeenAgentId(lastAgentId);
    setView("chat");
    ws.chatOpened(unread);
  };

  const focusOnReveal = useRef(false);
  useImperativeHandle(ws.inputRef, () => ({
    focus(reveal = false) {
      if (!hideChat) composerRef.current?.focus({ preventScroll: true });
      else if (reveal) {
        focusOnReveal.current = true;
        openChat();
      }
    },
  }));
  useLayoutEffect(() => {
    if (hideChat || !focusOnReveal.current) return;
    focusOnReveal.current = false;
    composerRef.current?.focus({ preventScroll: true });
  }, [hideChat]);

  const latest = ws.ready && !showWorkspace && ws.bubbles.length === 0 ? cards[0] : undefined;
  useEffect(() => {
    if (!latest || progressTracked.current) return;
    progressTracked.current = true;
    track("progress_opened", { place: "entry", cards: cards.length });
  }, [latest, cards.length]);

  // WorkspaceView wraps hintCount and onSolved per doc itself.
  const makeCtx = (w: Workspace): BlockCtx => ({
    workspaceId: w.id,
    queued: w.queued,
    clearQueued: () => ws.clearQueued(w.id),
    askPending: ws.askPending,
    saveBlock: (blockId, state) => ws.saveBlock(w.id, blockId, state),
    phase: w.doc.phase,
    simulationPending: ws.simulationPending,
    simulationVersions: ws.simulationVersions,
    simulationFailures: ws.simulationFailures,
    report: (type, data) => ws.report(type, data, true, w.id),
    check: (blockId, answer, previous, item) => ws.check(w.id, blockId, answer, previous, item),
    hint: (blockId, item, level) => ws.hint(w.id, blockId, item, level),
    overrides: ws.overrides[w.id] ?? {},
    hintCount: 0,
    onSolved: () => {},
    help: null,
  });

  const composer = {
    value: ws.input,
    onChange: ws.setInput,
    onSend: () => {
      if (ws.sendDisabled || (!ws.input.trim() && !ws.photos.length)) return;
      if (quote) ws.report("selection_asked", quote, true, ws.activeId ?? undefined);
      setQuote(null);
      void ws.submit();
    },
    onPickPhoto: () => fileInput.current?.click(),
    onSnapPhoto: () => cameraInput.current?.click(),
    placeholder: ws.hasMessages ? copy.placeholderWorking : copy.placeholderEmpty,
    sendDisabled: ws.sendDisabled,
    photos: ws.photos.map((data, index) => ({ src: JPEG_PREFIX + data, onRemove: () => ws.removePhoto(index) })),
  };

  const sent = showBuild && ws.typedTurn ? ws.bubbles.findLast((b) => b.kind === "student" && b.turn === buildingCard?.turn) : undefined;
  const problem = sent?.kind === "student" ? sent.text : undefined;
  let workspace;
  if (ws.activeId !== null) {
    workspace = (
      <>
        {ws.sheet && <SheetSwitcher sheet={ws.sheet} busy={ws.busy || ws.checking > 0} beforeSwitch={ws.flushEvents} onSwitched={() => window.location.reload()} />}
        <WorkspaceView
          sessionId={ws.sessionId}
          tabs={ws.tabs}
          activeId={ws.activeId}
          onActive={ws.setActive}
          onReset={ws.resetWorkspace}
          resets={ws.resets}
          resetDisabled={ws.busy || ws.checking > 0}
          makeCtx={makeCtx}
          taskDone={ws.taskDone}
          onOfferShown={setOfferOnCard}
          mobile={desktop ? undefined : {
            actionsTarget: hideChat && !showBuild ? actionsTarget : null,
            actionBarTarget,
          }}
          offer={ws.optChipKind === "offer" && ws.optChips ? { opts: ws.optChips, onPick: (t) => void ws.answerOpt(t, "card") } : null}
          brokenTabs={ws.brokenTabs}
          onRebuild={ws.rebuildTab}
          busy={ws.busy}
          onSelectionAsk={showWorkspace && !showBuild && !side.drawerOpen ? (selection) => {
            setQuote(selection);
            ws.setInput(copy.selectionQuestion);
            ws.inputRef.current?.focus(true);
          } : undefined}
        />
      </>
    );
  } else if (srcDoc !== null) {
    workspace = <WorkspaceFrame srcDoc={srcDoc} iframeRef={ws.frameRef} />;
  }

  const chipActions = {
    onConfirmRestate: ws.confirmRestate,
    onCorrectRestate: ws.correctRestate,
    onAcceptOffer: () => void ws.answerOffer(true),
    onOfferLater: () => void ws.answerOffer(false),
    onOpt: (text: string) => void ws.answerOpt(text),
  };
  const workspaceTitle = showBuild
    ? ws.preview?.title ?? (buildingCard?.kind === "workspace" ? buildingCard.title : null) ?? ws.status ?? copy.building
    : ws.tabs.find((tab) => tab.id === ws.activeId)?.doc.title ?? copy.workspaceTitle;
  const bar = desktop ? undefined : (
    <div className={styles.barContent}>
      {hideChat ? <>
        <button type="button" className={styles.backToChat} onClick={openChat}>
          {copy.backToChat}
          {unread && <span className={styles.unread} role="img" aria-label={copy.petUnread} />}
        </button>
        <h1 className={styles.workspaceTitle}><MdInline text={workspaceTitle} /></h1>
        {!showBuild && !legacyWorkspace && <div ref={setActionsTarget} />}
      </> : <>
        <Pet mood="idle" className={styles.barPet} />
        <span className={styles.brand}>{copy.brand}</span>
      </>}
    </div>
  );
  const openWorkspaceView = () => {
    setSkippedBuildId(buildingId);
    setView("workspace");
  };
  const work = (
    <>
      <div className={styles.stage} data-visible={showWorkspace} inert={!showWorkspace} aria-hidden={!showWorkspace || undefined}>
        {/* Keep the current doc mounted across chat visits and while another workspace builds. */}
        {workspace && <div className={styles.viewWrap} data-visible={!showBuild} inert={showBuild} aria-hidden={showBuild || undefined}>{workspace}</div>}
        {showBuild && (
          <div className={styles.buildScroll}>
            <BuildingSkeleton
              variant={ws.buildingPhase === "learn" ? "learn" : "solve"}
              preview={ws.preview}
              onQueue={ws.queueAnswer}
              problem={problem}
            />
          </div>
        )}
        {!desktop && (
          <div className={styles.bottom} data-workspace-footer>
            <AskStrip key={ask?.id} ask={ask} actions={chipActions} onKeyboard={() => ws.inputRef.current?.focus(true)} />
            <div ref={setActionBarTarget} className={styles.actionBarSlot} hidden={showBuild} />
          </div>
        )}
      </div>
      <ChatView
        state={ws}
        actions={{
          ...chipActions,
          onRetry: (id) => void ws.retry(id),
          onRebuild: () => void ws.rebuild(),
          onOpenWorkspace: (id) => {
            ws.openWorkspace(id);
            openWorkspaceView();
          },
        }}
        composer={composer}
        composerRef={composerRef}
        emptyThread={{
          onStarter: (starter) => void ws.startStarter(starter),
          onSurprise: (id) => void ws.startSurprise(id),
          progress: latest ? { item: latest, onOpen: () => void openProgressSession(latest, "reload") } : null,
        }}
        workspaceVisible={showWorkspace}
        onOpenLegacyWorkspace={legacyWorkspace ? openWorkspaceView : undefined}
        hidden={hideChat}
        showHeader={desktop}
        quote={quote?.text}
        onDismissQuote={() => setQuote(null)}
      />
    </>
  );

  return (
    <PetAnchorProvider>
      <Shell work={work} bar={bar} menuRef={setMenuTarget} chatOpen={desktop && showWorkspace} inert={side.drawerOpen && !desktop}
        layer={<PetLayer state={ws} actions={chipActions} offerOnCard={offerOnCard} questionInStrip={!desktop && ask !== null} onWriteOwn={() => ws.inputRef.current?.focus(true)} />}
        sidebar={<Sidebar side={side} menuTarget={desktop ? undefined : menuTarget} busy={ws.busy} onNewProblem={ws.newProblem} progress={cards.length > 0 ? {} : null} refreshKey={`${ws.newProblemCount}|${ws.hasMessages}|${ws.phase}`} />}
        side={desktop ? side.mode : undefined} />
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={onFile} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
    </PetAnchorProvider>
  );
}
