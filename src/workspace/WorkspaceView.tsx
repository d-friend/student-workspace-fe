import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { usePetAnchorRef, usePetScrollerRef } from "@/components/pet/PetAnchor";
import { copy, copyFor } from "@/lib/copy";
import { WorkspaceCopy, useCopy } from "./WorkspaceCopy";
import { workspaceLocale } from "./workspaceLocale";
import { ShareButton } from "@/components/work/ShareButton";
import { SelectionAsk, type SelectionQuote } from "./SelectionAsk";
import { BlockBoundary } from "./BlockBoundary";
import { renderBlock } from "./blocks";
import { acceptedSteps, StepProgress } from "./StepProgress";
import { Problem } from "./blocks/Problem";
import { scaffoldPos } from "./blocks/Steps";
import { DoneBanner } from "./DoneBanner";
import { MdInline } from "./md";
import { ActionBar } from "./ActionBar";
import { PhaseSwitch } from "./PhaseSwitch";
import type { Block, BlockCtx, Phase, SavedBlockState, Workspace } from "./types";
import { canReturnToProblem, returnTarget } from "./navigation";
import styles from "./WorkspaceView.module.css";

type Props = {
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
  brokenTabs?: Record<string, true>;
  onRebuild?: (id: string) => void;
  onSelectionAsk?: (quote: SelectionQuote) => void;
};

function Doc({ w, p, hidden, tabbed, base, hasSolve, taskDone, busy, broken, onRebuild, sessionId, workspaceCount, sessionUnready, tabs, onActive, onReset, resetDisabled }: {
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
  busy: boolean;
  broken: boolean;
  onRebuild?: (id: string) => void;
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
  const completedIds = new Set([...solved.ids, ...masterDone]);
  const allDone = stepsIds.length > 0 && stepsIds.every((id) => completedIds.has(id));
  const reported = useRef(!!w.restored && allDone);
  const restoredQuizzes = new Set(Object.entries(w.state?.blocks ?? {})
    .filter(([, b]) => b.type === "quiz" && b.done).map(([id]) => id));
  const quizzesDone = useRef(restoredQuizzes);
  const learnReported = useRef(w.doc.blocks.filter((b) => b.type === "quiz").length > 0 &&
    w.doc.blocks.filter((b) => b.type === "quiz").every((b) => restoredQuizzes.has(b.id)));
  const level = Math.min(presses, 3);
  const working = p !== "learn";
  const doneAnchorRef = usePetAnchorRef(working && allDone && !hidden);
  const finishedSteps = w.doc.blocks.find((b): b is Extract<Block, { type: "steps" }> => {
    const saved = state.blocks[b.id];
    return b.type === "steps" && saved?.type === "steps" && saved.done && !!saved.takeaway;
  });
  const finishedState = finishedSteps && state.blocks[finishedSteps.id];
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
      {broken && <div className={styles.notice}><span>{copy.pageBroken}</span> <button type="button" className={styles.back} onClick={() => onRebuild?.(w.id)}>{copy.pageRebuild}</button></div>}
      <header className={styles.header}>
        <h1 className={styles.title}><MdInline text={w.doc.title} /></h1>
        <div className={styles.headerActions}>
          {onReset && <button ref={resetButton} type="button" className={styles.headerButton} data-busy={resetDisabled || undefined} disabled={resetDisabled || pristine} aria-expanded={confirmReset} onClick={() => setConfirmReset(true)}><IconRefresh size={18} stroke={1.8} aria-hidden="true" /><span className={styles.resetLabel}>{copy.workspaceReset}</span></button>}
          <ShareButton sessionId={sessionId} workspaceCount={workspaceCount} sessionUnready={sessionUnready} workspaceId={w.id} title={w.doc.title} disabled={w.doc.blocks.some((block) => block.type === "custom" && block.html == null)} />
        </div>
        {confirmReset && <div className={styles.resetConfirm} role="group" aria-label={copy.workspaceResetConfirm} onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); closeReset(); }
        }}>
          <span>{copy.workspaceResetConfirm}</span>
          <button type="button" className={styles.headerButton} data-busy={resetDisabled || undefined} disabled={resetDisabled || pristine} onClick={() => onReset?.(w.id)}>{copy.workspaceReset}</button>
          <button ref={cancelReset} type="button" className={styles.headerButton} onClick={closeReset}>{copy.workspaceResetCancel}</button>
        </div>}
      </header>
      {w.doc.blocks.map((b) => {
        const steps = b.type === "problem" ? w.doc.blocks.find((item) => item.type === "steps" && item.problem_id === b.id) : undefined;
        const problem = b.type === "steps" ? w.doc.blocks.find((item) => item.type === "problem" && item.id === b.problem_id) : undefined;
        const sticky = working && steps?.type === "steps" && acceptedSteps(steps, state, ctx.overrides[steps.id]) > 0;
        const firstSteps = problem && w.doc.blocks.find((item) => item.type === "steps" && item.problem_id === problem.id);
        const progressMoved = working && b.type === "steps" && firstSteps?.id === b.id && acceptedSteps(b, state, ctx.overrides[b.id]) > 0;
        return (
        <div key={b.id} className={styles.block} data-block-id={b.id} data-sel={b.type === "problem" ? "problem" : p === "learn" ? "lesson" : "explanation"}>
        <BlockBoundary blockId={b.id} report={ctx.report}>
          {sticky && b.type === "problem" && steps?.type === "steps" ? (
            <div className={styles.stickyProblem}>
              <Problem block={b} ctx={ctx} collapsible />
              <StepProgress block={steps} state={state} overrides={ctx.overrides[steps.id]} sessionId={ctx.sessionId} />
            </div>
          ) : <>
          {working && b.type === "steps" && !progressMoved && <StepProgress block={b} state={state} overrides={ctx.overrides[b.id]} sessionId={ctx.sessionId} />}
          {renderBlock(b, b.type === "steps" ? {
            ...ctx,
            finished: completedIds.has(b.id),
            help: { ...help, onHint: () => onHint(b.id), free: freeBlocks[b.id] || (state.blocks[b.id]?.type === "steps" && (state.blocks[b.id] as Extract<SavedBlockState, { type: "steps" }>).free) },
          } : ctx)}
          </>}
        </BlockBoundary>
        </div>
      ); })}
      {allDone && <DoneBanner hints={presses} takeaway={finishedState?.type === "steps" ? finishedState.takeaway : undefined} roadmap={finishedSteps?.roadmap} />}
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
        const onOtherWay = active && !free && pos < (active.scaffold?.length ?? 0) ? () => {
          setFreeBlocks((previous) => ({ ...previous, [active.id]: true }));
          ctx.report("other_way_chosen", { block_id: active.id, line: pos + 1 });
        } : undefined;
        return <ActionBar {...help} onHint={() => onHint(active?.id ?? "")} onOtherWay={onOtherWay} sticky />;
      })()}
    </section>
  );
}

function LocalizedDoc(props: Parameters<typeof Doc>[0]) {
  const lang = useMemo(() => workspaceLocale(props.w.doc), [props.w.doc]);
  return <WorkspaceCopy.Provider value={copyFor(lang)}><Doc {...props} /></WorkspaceCopy.Provider>;
}

export function WorkspaceView({ sessionId, tabs, activeId, onActive, onReset, resets = {}, resetDisabled = false, makeCtx, taskDone = {}, busy = false, brokenTabs = {}, onRebuild, onSelectionAsk }: Props) {
  const activeDoc = tabs.find((tab) => tab.id === activeId)?.doc;
  const activeCopy = useMemo(() => activeDoc ? copyFor(workspaceLocale(activeDoc)) : copy, [activeDoc]);
  // Hidden docs share this scroller; keep an independent offset for each workspace.
  const scroller = useRef<HTMLDivElement>(null);
  const tops = useRef<Record<string, number>>({});
  const shown = useRef(activeId);
  const petScroller = usePetScrollerRef();
  useLayoutEffect(() => {
    shown.current = activeId;
    if (scroller.current) scroller.current.scrollTop = tops.current[activeId] ?? 0;
  }, [activeId]);
  return (
    <div
      ref={(el) => {
        scroller.current = el;
        petScroller?.(el);
      }}
      className={styles.scroll} data-flat={tabs.find((tab) => tab.id === activeId)?.phase !== "learn" || undefined} onScroll={(e) => (tops.current[shown.current] = e.currentTarget.scrollTop)}>
      <WorkspaceCopy.Provider value={activeCopy}><SelectionAsk scroller={scroller} activeId={activeId} onAsk={onSelectionAsk} /></WorkspaceCopy.Provider>
      <div className={styles.view} data-pet-column>
        <PhaseSwitch tabs={tabs} activeId={activeId} onActive={onActive} />
        {tabs.map((w) => (
          <LocalizedDoc key={`${w.id}:${resets[w.id] ?? 0}`} sessionId={sessionId} workspaceCount={tabs.length} sessionUnready={tabs.some((tab) => tab.doc.blocks.some((block) => block.type === "custom" && block.html == null))} w={w} p={w.phase} hidden={w.id !== activeId} tabbed={tabs.length > 1} base={makeCtx(w)} hasSolve={tabs.some((tab) => tab.phase === "solve")} taskDone={taskDone[w.id] ?? []} busy={busy} broken={!!brokenTabs[w.id]} onRebuild={onRebuild} tabs={tabs} onActive={onActive} onReset={onReset} resetDisabled={resetDisabled} />
        ))}
      </div>
    </div>
  );
}
