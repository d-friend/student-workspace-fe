import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconRefresh } from "@tabler/icons-react";
import { usePetAnchorRef } from "@/components/pet/PetAnchor";
import { copy, copyFor } from "@/lib/copy";
import { WorkspaceCopy, useCopy } from "./WorkspaceCopy";
import { workspaceLocale } from "./workspaceLocale";
import { ShareButton } from "@/components/work/ShareButton";
import { SelectionAsk, type SelectionQuote } from "./SelectionAsk";
import { BlockBoundary } from "./BlockBoundary";
import { renderBlock } from "./blocks";
import { acceptedSteps, StepProgress } from "./StepProgress";
import { PartHeading } from "./PartHeading";
import { Problem } from "./blocks/Problem";
import { scaffoldPos } from "./blocks/Steps";
import { ProgressCard } from "./ProgressCard";
import { stageResults } from "./stageResults";
import { MdInline } from "./md";
import { ActionBar } from "./ActionBar";
import { PhaseSwitch, type QueueTabs } from "./PhaseSwitch";
import { QueuedPanel } from "./QueuedPanel";
import { ReviewBody } from "./ReviewBody";
import type { Block, BlockCtx, Phase, SavedBlockState, Workspace } from "./types";
import { canReturnToProblem, returnTarget } from "./navigation";
import styles from "./WorkspaceView.module.css";

type MobileWorkspace = {
  actionsTarget: HTMLElement | null;
  actionBarTarget: HTMLElement | null;
};

type Props = {
  queue?: QueueTabs & { onBuild: (itemId: string) => void };
  sessionId?: string | null;
  tabs: (Workspace & { phase: Phase })[];
  activeId: string;
  onActive: (id: string) => void;
  onReset?: (id: string) => void;
  resets?: Record<string, number>;
  resetDisabled?: boolean;
  makeCtx: (w: Workspace) => BlockCtx;
  taskDone?: Record<string, string[]>; // master completions (SSE task_done), by workspace id
  busy?: boolean;
  offer?: { opts: string[]; onPick: (text: string) => void } | null;
  onOfferShown?: (shown: boolean) => void;
  brokenTabs?: Record<string, true>;
  onRebuild?: (id: string) => void;
  onSelectionAsk?: (quote: SelectionQuote) => void;
  onLeave?: (url: string) => void; // a review's end card: end this session and go to the url
  mobile?: MobileWorkspace;
  tabsTarget?: HTMLElement | null; // desktop with the chat hidden: the top bar slot that holds the tabs
};

function Doc({ w, p, hidden, tabbed, base, hasSolve, taskDone, allTaskDone, onLeave, busy, broken, onRebuild, sessionId, workspaceCount, sessionUnready, tabs, onActive, onReset, resetDisabled, offer, onOfferShown, mobile, next }: {
  next?: Parameters<typeof ProgressCard>[0]["next"];
  offer?: Props["offer"];
  onOfferShown?: Props["onOfferShown"];
  w: Workspace;
  tabs: (Workspace & { phase: Phase })[];
  onActive: (id: string) => void;
  onReset?: (id: string) => void;
  resetDisabled: boolean;
  sessionId?: string | null;
  workspaceCount: number;
  sessionUnready: boolean;
  p: Phase;
  hidden: boolean;
  tabbed: boolean; // a PhaseSwitch exists, so this is a tab panel
  base: BlockCtx;
  hasSolve: boolean;
  taskDone: string[];
  allTaskDone: Record<string, string[]>;
  onLeave?: (url: string) => void;
  busy: boolean;
  broken: boolean;
  onRebuild?: (id: string) => void;
  mobile?: MobileWorkspace;
}) {
  const copy = useCopy();
  const [confirmReset, setConfirmReset] = useState(false);
  const resetButton = useRef<HTMLButtonElement>(null);
  const cancelReset = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmReset) cancelReset.current?.focus();
  }, [confirmReset]);
  const closeReset = () => {
    setConfirmReset(false);
    resetButton.current?.focus();
  };
  const [presses, setPresses] = useState(0);
  const [itemPresses, setItemPresses] = useState<Record<string, number>>({});
  const [freeBlocks, setFreeBlocks] = useState<Record<string, boolean>>({});
  const [savedBlocks, setSavedBlocks] = useState<Record<string, SavedBlockState>>({});
  const [hintNote, setHintNote] = useState<BlockCtx["hintNote"]>(null);
  const state = { ...w.state, blocks: { ...w.state?.blocks, ...savedBlocks } };
  const stepsIds = w.doc.blocks.filter((b) => b.type === "steps").map((b) => b.id);
  const restoredIds = stepsIds.filter((id) => {
    const saved = w.state?.blocks?.[id];
    return saved?.type === "steps" && saved.done;
  });
  const [solved, setSolved] = useState({ ids: restoredIds, byStudent: restoredIds.length === stepsIds.length });
  const masterDone = new Set([...(w.state?.taskDone ?? []), ...taskDone]);
  // Nothing reset would clear: no saved answers, line verdicts or master completions.
  const pristine = Object.keys(state.blocks).length === 0 && masterDone.size === 0 &&
    Object.values(base.overrides).every((lines) => Object.keys(lines).length === 0);
  const share = {
    sessionId, workspaceCount, sessionUnready, workspaceId: w.id, title: w.doc.title,
    disabled: w.doc.blocks.some((block) => block.type === "custom" && block.html == null),
  };
  // Accepting the last scaffold item completes the block (the check's contract), also when the master's
  // mark_line accepted it without complete_task; otherwise Steps falls through to an empty free line.
  const scaffoldDone = p === "solve" || p === "practice" ? w.doc.blocks.filter((b) => {
    const saved = state.blocks[b.id];
    return b.type === "steps" && !!b.scaffold && !freeBlocks[b.id] && !(saved?.type === "steps" && saved.free) &&
      scaffoldPos(saved?.type === "steps" ? saved.entries : [], base.overrides[b.id] ?? {}) >= b.scaffold.length;
  }).map((b) => b.id) : [];
  const completedIds = new Set([...solved.ids, ...masterDone, ...scaffoldDone]);
  const allDone = stepsIds.length > 0 && stepsIds.every((id) => completedIds.has(id));
  const reported = useRef(!!w.restored && allDone);
  const restoredQuizzes = new Set(Object.entries(w.state?.blocks ?? {})
    .filter(([, b]) => b.type === "quiz" && b.done).map(([id]) => id));
  const quizzesDone = useRef(restoredQuizzes);
  const learnReported = useRef(w.doc.blocks.filter((b) => b.type === "quiz").length > 0 &&
    w.doc.blocks.filter((b) => b.type === "quiz").every((b) => restoredQuizzes.has(b.id)));
  const level = Math.min(presses, 3);
  const working = p === "solve" || p === "practice";
  const offerShown = !!offer && allDone && working && !hidden;
  useEffect(() => {
    onOfferShown?.(offerShown);
    return () => onOfferShown?.(false);
  }, [offerShown, onOfferShown]);
  const doneAnchorRef = usePetAnchorRef(working && allDone && !hidden);
  const finishedSteps = w.doc.blocks.find((b): b is Extract<Block, { type: "steps" }> => {
    const saved = state.blocks[b.id];
    return b.type === "steps" && saved?.type === "steps" && saved.done && !!saved.takeaway;
  }) ?? w.doc.blocks.find((b): b is Extract<Block, { type: "steps" }> => b.type === "steps");
  const finishedState = finishedSteps && state.blocks[finishedSteps.id];
  const rowsOf = (steps: Extract<Block, { type: "steps" }> | undefined) => {
    if (!working || !steps?.roadmap) return [];
    const saved = state.blocks[steps.id];
    return stageResults(
      steps.scaffold?.map(item => item.stage) ?? [],
      saved?.type === "steps" ? saved.entries.map((entry, i) => ({ ...entry, state: base.overrides[steps.id]?.[i + 1] ?? entry.state })) : [],
      !!freeBlocks[steps.id] || (saved?.type === "steps" && saved.free),
    );
  };
  // A multi-part problem (one labelled block per part) opens one part at a time, in order.
  const stepsBlocks = w.doc.blocks.filter((b): b is Extract<Block, { type: "steps" }> => b.type === "steps");
  const multipart = working && stepsBlocks.length > 1 && stepsBlocks.every((b) => !!b.label);
  const activeSteps = stepsBlocks.find((b) => !completedIds.has(b.id));
  const locked = (b: Extract<Block, { type: "steps" }>) => {
    const saved = state.blocks[b.id];
    return multipart && b !== activeSteps && !completedIds.has(b.id) && !(saved?.type === "steps" && saved.entries.length);
  };
  const anyAccepted = multipart && stepsBlocks.some((b) => acceptedSteps(b, state, base.overrides[b.id]) > 0);
  const stepsId = w.doc.blocks.find((b) => b.type === "steps")?.id ?? "";

  useEffect(() => {
    if (!allDone || reported.current) return;
    reported.current = true;
    base.report("task_completed", { similar: p === "practice", helped: presses > 0, max_hint: level, ...(!solved.byStudent && { via: "master" }) });
  }, [allDone, solved.byStudent, base, p, presses, level]);

  if (hintNote) {
    const saved = state.blocks[hintNote.blockId];
    if (scaffoldPos(saved?.type === "steps" ? saved.entries : [], base.overrides[hintNote.blockId] ?? {}) !== hintNote.item) setHintNote(null);
  }
  const position = (blockId: string) => {
    const saved = state.blocks[blockId];
    return scaffoldPos(saved?.type === "steps" ? saved.entries : [], base.overrides[blockId] ?? {});
  };
  const onHint = async (blockId = stepsId) => {
    setPresses(presses + 1);
    const nextLevel = Math.min(presses + 1, 3);
    const block = w.doc.blocks.find((b) => b.id === blockId && b.type === "steps");
    const saved = state.blocks[blockId];
    const free = freeBlocks[blockId] || (saved?.type === "steps" && saved.free);
    const pos = position(blockId);
    if (p !== "learn" && block?.type === "steps" && block.scaffold && !free && base.hint && pos < block.scaffold.length) {
      const key = `${blockId}:${pos}`;
      const itemLevel = Math.min((itemPresses[key] ?? 0) + 1, 3);
      setItemPresses((previous) => ({ ...previous, [key]: (previous[key] ?? 0) + 1 }));
      const text = await base.hint(blockId, pos, itemLevel);
      if (text !== null) {
        // If the student moves on while this is in flight, the render-time check above drops the note.
        // The report can still go out if the student moves on during the fetch.
        setHintNote({ blockId, item: pos, text });
        base.report("help_requested", { block_id: blockId, level: itemLevel, shown: true, text });
        return;
      }
    }
    base.report("help_requested", { block_id: blockId, level: nextLevel });
  };
  const help = { level, onHint: () => onHint(), onIdea: p === "solve" ? () => base.report("foundation_requested", {}) : undefined, ideaPending: busy };
  const quizIds = w.doc.blocks.filter((b) => b.type === "quiz").map((b) => b.id);
  // A quiz is finished like Quiz.tsx decides: open (sent), correct, or a second try. When the last one of a learn doc
  // is, the master is told: correct quiz answers alone never wake it, and it offers what comes next.
  const report: BlockCtx["report"] = (type, data) => {
    base.report(type, data);
    if (p !== "learn" || type !== "quiz_answered") return;
    const a = data as { block_id: string; ok?: boolean; tries?: number };
    if (a.ok === undefined || a.ok === true || (a.tries ?? 0) >= 2) quizzesDone.current.add(a.block_id);
    if (!learnReported.current && quizIds.length > 0 && quizIds.every((id) => quizzesDone.current.has(id))) {
      learnReported.current = true;
      base.report("learn_completed", {});
    }
  };
  const ctx: BlockCtx = {
    ...base,
    sessionId,
    state,
    hintNote,
    saveBlock: (id, saved) => {
      setSavedBlocks((previous) => ({ ...previous, [id]: saved }));
      base.saveBlock?.(id, saved);
    },
    report,
    hintCount: presses,
    help,
    hidden,
    onSolved: (id) => {
      base.onSolved(id);
      setSolved((previous) => {
        const ids = previous.ids.includes(id) ? previous.ids : [...previous.ids, id];
        return { ids, byStudent: stepsIds.every((stepId) => ids.includes(stepId) || masterDone.has(stepId)) };
      });
    },
  };

  return (
    <section id={`panel-${w.id}`} {...(tabbed && { role: "tabpanel", "aria-labelledby": `tab-${w.id}` })} hidden={hidden} className={styles.doc} data-phase={p}>
      {!hidden && mobile?.actionsTarget && createPortal(<ShareButton {...share} overflow={{
        triggerRef: resetButton,
        reset: onReset ? { label: copy.workspaceReset, disabled: resetDisabled || pristine, onClick: () => setConfirmReset(true) } : undefined,
      }} />, mobile.actionsTarget)}
      {broken && <div className={styles.notice}><span>{copy.pageBroken}</span> <button type="button" className={styles.back} onClick={() => onRebuild?.(w.id)}>{copy.pageRebuild}</button></div>}
      <header className={styles.header} hidden={!!mobile && !confirmReset}>
        {!mobile && <>
          <h1 className={styles.title}><MdInline text={w.doc.title} /></h1>
          <div className={styles.headerActions}>
            {onReset && <button ref={resetButton} type="button" className={styles.headerButton} data-busy={resetDisabled || undefined} disabled={resetDisabled || pristine} aria-expanded={confirmReset} onClick={() => setConfirmReset(true)}><IconRefresh size={18} stroke={1.8} aria-hidden="true" /><span className={styles.resetLabel}>{copy.workspaceReset}</span></button>}
            <ShareButton {...share} />
          </div>
        </>}
        {confirmReset && <div className={styles.resetConfirm} role="group" aria-label={copy.workspaceResetConfirm} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); closeReset(); }
        }}>
          <span>{copy.workspaceResetConfirm}</span>
          <button type="button" className={styles.headerButton} data-busy={resetDisabled || undefined} disabled={resetDisabled || pristine} onClick={() => onReset?.(w.id)}>{copy.workspaceReset}</button>
          <button ref={cancelReset} type="button" className={styles.headerButton} onClick={closeReset}>{copy.workspaceResetCancel}</button>
        </div>}
      </header>
      {p === "review" ? <ReviewBody w={w} ctx={ctx} tabs={tabs} taskDone={allTaskDone} hidden={hidden} busy={busy} onActive={onActive} onLeave={onLeave} />
      : w.doc.blocks.map((b) => {
        const steps = b.type !== "problem" ? undefined : multipart ? activeSteps : w.doc.blocks.find((item): item is Extract<Block, { type: "steps" }> => item.type === "steps" && item.problem_id === b.id);
        const problem = b.type === "steps" ? w.doc.blocks.find((item) => item.type === "problem" && item.id === b.problem_id) : undefined;
        const sticky = working && !!steps && (multipart ? anyAccepted && !!activeSteps : acceptedSteps(steps, state, ctx.overrides[steps.id]) > 0);
        const firstSteps = problem && w.doc.blocks.find((item) => item.type === "steps" && item.problem_id === problem.id);
        const progressMoved = working && b.type === "steps" && (multipart
          ? b !== activeSteps || anyAccepted
          : firstSteps?.id === b.id && acceptedSteps(b, state, ctx.overrides[b.id]) > 0);
        const later = b.type === "steps" && locked(b);
        return (
        <div key={b.id} className={styles.block} data-block-id={b.id} data-sel={b.type === "problem" ? "problem" : p === "learn" ? "lesson" : "explanation"}>
        <BlockBoundary blockId={b.id} report={ctx.report}>
          {sticky && b.type === "problem" && steps ? (
            <div className={styles.stickyProblem}>
              <Problem block={b} ctx={ctx} collapsible />
              <StepProgress key={steps.id} block={steps} state={state} overrides={ctx.overrides[steps.id]} sessionId={ctx.sessionId} part={multipart ? steps.label : undefined} />
            </div>
          ) : <>
          {b.type === "steps" && b.label && <PartHeading label={b.label} status={later ? "later" : multipart && completedIds.has(b.id) ? "done" : undefined} />}
          {working && b.type === "steps" && !later && !progressMoved && <StepProgress block={b} state={state} overrides={ctx.overrides[b.id]} sessionId={ctx.sessionId} />}
          {later ? null : renderBlock(b, b.type === "steps" ? {
            ...ctx,
            finished: completedIds.has(b.id),
            ...(multipart && { hintStart: presses }),
            help: { ...help, onHint: () => onHint(b.id), free: freeBlocks[b.id] || (state.blocks[b.id]?.type === "steps" && (state.blocks[b.id] as Extract<SavedBlockState, { type: "steps" }>).free) },
          } : ctx)}
          </>}
        </BlockBoundary>
        </div>
      ); })}
      {allDone && <ProgressCard hints={presses} takeaway={finishedState?.type === "steps" ? finishedState.takeaway : undefined} roadmap={finishedSteps?.roadmap} rows={multipart ? [] : rowsOf(finishedSteps)} parts={multipart ? stepsBlocks.map((b) => ({ label: b.label!, roadmap: b.roadmap, rows: rowsOf(b) })) : undefined} offer={working ? offer : null} next={working ? next : null} />}
      {working && allDone && (
        <div ref={doneAnchorRef} data-pet-anchor data-pet-done data-pet-inline className={styles.donePet}>
          <div data-pet-slot />
          <div data-pet-spoken-slot className={styles.doneSpoken} />
        </div>
      )}
      {p === "learn" && w.doc.sources.length > 0 && (
        <aside className={styles.sources}>
          <h2>{copy.sources}</h2>
          <ul>
            {w.doc.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
      {canReturnToProblem(p, w.parent_workspace_id, hasSolve) && (
        <button
          type="button"
          className={styles.back}
          onClick={() => {
            const target = returnTarget(tabs, w);
            if (target !== null) {
              onActive(target);
              ctx.report("foundation_done", { local: true });
            } else {
              ctx.report("foundation_done", {});
            }
          }}
        >
          {copy.backToProblem}
        </button>
      )}
      {working && !allDone && (() => {
        const active = w.doc.blocks.find((b): b is Extract<Block, { type: "steps" }> => b.type === "steps" && !completedIds.has(b.id));
        const saved = active && state.blocks[active.id];
        const free = active && (freeBlocks[active.id] || (saved?.type === "steps" && saved.free));
        const pos = active ? acceptedSteps(active, state, ctx.overrides[active.id]) : 0;
        const onOtherWay = active && active.input !== "text" && !free && pos < (active.scaffold?.length ?? 0) ? () => {
          setFreeBlocks((previous) => ({ ...previous, [active.id]: true }));
          ctx.report("other_way_chosen", { block_id: active.id, line: pos + 1 });
        } : undefined;
        const onExplainStep = active && !free && pos < (active.scaffold?.length ?? 0) ? () => ctx.report("explain_step_requested", { block_id: active.id, item: pos }) : undefined;
        const bar = <ActionBar {...help} onExplainStep={onExplainStep} onHint={() => onHint(active?.id ?? "")} onOtherWay={onOtherWay} sticky />;
        if (!mobile) return bar;
        return !hidden && mobile.actionBarTarget ? createPortal(bar, mobile.actionBarTarget) : null;
      })()}
    </section>
  );
}

function LocalizedDoc(props: Parameters<typeof Doc>[0]) {
  const lang = useMemo(() => workspaceLocale(props.w.doc), [props.w.doc]);
  return <WorkspaceCopy.Provider value={copyFor(lang)}><Doc {...props} /></WorkspaceCopy.Provider>;
}

export function WorkspaceView({ sessionId, tabs, activeId, onActive, onReset, resets = {}, resetDisabled = false, makeCtx, taskDone = {}, busy = false, brokenTabs = {}, onRebuild, onSelectionAsk, onLeave, offer, onOfferShown, mobile, tabsTarget, queue }: Props) {
  // A prefetched tab nobody has opened is not the one the tutor's offer is about.
  const unopened = new Set(queue?.items.filter((i) => !i.opened).map((i) => i.workspaceId));
  const lastWorkingId = tabs.findLast(tab => (tab.phase === "solve" || tab.phase === "practice") && !unopened.has(tab.id))?.id;
  const viewed = queue?.items.find((i) => i.id === queue.viewId);
  // The page's next problem: the first one the student has not opened yet.
  const upNext = queue?.items.find((i) => !(i.status === "ready" && i.opened));
  const next = queue && upNext ? { item: upNext, onOpen: () => queue.onOpen(upNext.id, "card") } : null;
  const activeDoc = tabs.find((tab) => tab.id === activeId)?.doc;
  const activeCopy = useMemo(() => activeDoc ? copyFor(workspaceLocale(activeDoc)) : copy, [activeDoc]);
  // Hidden docs share this scroller; keep an independent offset for each workspace.
  const scroller = useRef<HTMLDivElement>(null);
  const tops = useRef<Record<string, number>>({});
  const shown = useRef(activeId);
  useLayoutEffect(() => {
    shown.current = activeId;
    if (scroller.current) scroller.current.scrollTop = tops.current[activeId] ?? 0;
  }, [activeId]);
  return (
    <div
      ref={scroller}
      className={styles.scroll} data-mobile-workspace={!!mobile || undefined} data-flat={tabs.find((tab) => tab.id === activeId)?.phase !== "learn" || undefined} onScroll={(e) => (tops.current[shown.current] = e.currentTarget.scrollTop)}>
      {onSelectionAsk && (
        <WorkspaceCopy.Provider value={activeCopy}>
          <SelectionAsk scroller={scroller} activeId={activeId} onAsk={onSelectionAsk} />
        </WorkspaceCopy.Provider>
      )}
      <div className={styles.view} data-pet-column>
        <PhaseSwitch tabs={tabs} activeId={activeId} onActive={onActive} barTarget={tabsTarget} queue={queue} />
        {tabs.map((w) => (
          <LocalizedDoc key={`${w.id}:${resets[w.id] ?? 0}`} sessionId={sessionId} workspaceCount={tabs.length} sessionUnready={tabs.some((tab) => tab.doc.blocks.some((block) => block.type === "custom" && block.html == null))} w={w} p={w.phase} hidden={!!viewed || w.id !== activeId} tabbed={tabs.length + (queue?.items.length ?? 0) > 1} base={makeCtx(w)} hasSolve={tabs.some((tab) => tab.phase === "solve")} taskDone={taskDone[w.id] ?? []} allTaskDone={taskDone} onLeave={onLeave} busy={busy} broken={!!brokenTabs[w.id]} onRebuild={onRebuild} tabs={tabs} onActive={onActive} onReset={onReset} resetDisabled={resetDisabled} offer={w.id === lastWorkingId ? offer : null} onOfferShown={w.id === lastWorkingId ? onOfferShown : undefined} mobile={mobile} next={next} />
        ))}
        {viewed && queue && <QueuedPanel item={viewed} current={queue.items.find((i) => i.workspaceId === activeId)?.label ?? viewed.firstLabel} onBack={() => onActive(activeId)} onBuild={() => queue.onBuild(viewed.id)} busy={busy} />}
      </div>
    </div>
  );
}
