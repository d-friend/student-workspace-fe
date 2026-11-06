import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePetScrollerRef } from "@/components/pet/PetAnchor";
import { copy } from "@/lib/copy";
import { ShareButton } from "@/components/work/ShareButton";
import { BlockBoundary } from "./BlockBoundary";
import { renderBlock } from "./blocks";
import { acceptedSteps, StepProgress } from "./StepProgress";
import { Problem } from "./blocks/Problem";
import { DoneBanner } from "./DoneBanner";
import { MdInline } from "./md";
import { ActionBar } from "./ActionBar";
import { PhaseSwitch } from "./PhaseSwitch";
import type { Block, BlockCtx, Phase, SavedBlockState, Workspace } from "./types";
import { canReturnToProblem } from "./navigation";
import styles from "./WorkspaceView.module.css";

type Props = {
  tabs: (Workspace & { phase: Phase })[];
  activeId: string;
  onActive: (id: string) => void;
  makeCtx: (w: Workspace) => BlockCtx;
  taskDone?: Record<string, string[]>; // master completions (SSE task_done), by workspace id
  busy?: boolean;
  brokenTabs?: Record<string, true>;
  onRebuild?: (id: string) => void;
};

function Doc({ w, p, hidden, tabbed, base, hasSolve, taskDone, busy, broken, onRebuild }: {
  w: Workspace;
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
  const [presses, setPresses] = useState(0);
  const [freeBlocks, setFreeBlocks] = useState<Record<string, boolean>>({});
  const [savedBlocks, setSavedBlocks] = useState<Record<string, SavedBlockState>>({});
  const state = { ...w.state, blocks: { ...w.state?.blocks, ...savedBlocks } };
  const stepsIds = w.doc.blocks.filter((b) => b.type === "steps").map((b) => b.id);
  const restoredIds = stepsIds.filter((id) => {
    const saved = w.state?.blocks?.[id];
    return saved?.type === "steps" && saved.done;
  });
  const [solved, setSolved] = useState({ ids: restoredIds, byStudent: restoredIds.length === stepsIds.length });
  const masterDone = new Set([...(w.state?.taskDone ?? []), ...taskDone]);
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
  const stepsId = w.doc.blocks.find((b) => b.type === "steps")?.id ?? "";

  useEffect(() => {
    if (!allDone || reported.current) return;
    reported.current = true;
    base.report("task_completed", { similar: p === "practice", helped: presses > 0, max_hint: level, ...(!solved.byStudent && { via: "master" }) });
  }, [allDone, solved.byStudent, base, p, presses, level]);

  const onHint = (blockId = stepsId) => {
    setPresses(presses + 1);
    base.report("help_requested", { block_id: blockId, level: Math.min(presses + 1, 3) });
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
    state,
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
        <ShareButton workspaceId={w.id} title={w.doc.title} disabled={w.doc.blocks.some((block) => block.type === "custom" && block.html == null)} />
      </header>
      {w.doc.blocks.map((b) => {
        const steps = b.type === "problem" ? w.doc.blocks.find((item) => item.type === "steps" && item.problem_id === b.id) : undefined;
        const problem = b.type === "steps" ? w.doc.blocks.find((item) => item.type === "problem" && item.id === b.problem_id) : undefined;
        const sticky = working && steps?.type === "steps" && acceptedSteps(steps, state, ctx.overrides[steps.id]) > 0;
        const firstSteps = problem && w.doc.blocks.find((item) => item.type === "steps" && item.problem_id === problem.id);
        const progressMoved = working && b.type === "steps" && firstSteps?.id === b.id && acceptedSteps(b, state, ctx.overrides[b.id]) > 0;
        return (
        <BlockBoundary key={b.id} blockId={b.id} report={ctx.report}>
          {sticky && b.type === "problem" && steps?.type === "steps" ? (
            <div className={styles.stickyProblem}>
              <Problem block={b} ctx={ctx} collapsible />
              <StepProgress block={steps} state={state} overrides={ctx.overrides[steps.id]} />
            </div>
          ) : <>
          {working && b.type === "steps" && !progressMoved && <StepProgress block={b} state={state} overrides={ctx.overrides[b.id]} />}
          {renderBlock(b, b.type === "steps" ? {
            ...ctx,
            finished: completedIds.has(b.id),
            help: { ...help, onHint: () => onHint(b.id), free: freeBlocks[b.id] || (state.blocks[b.id]?.type === "steps" && (state.blocks[b.id] as Extract<SavedBlockState, { type: "steps" }>).free) },
          } : ctx)}
          </>}
        </BlockBoundary>
      ); })}
      {allDone && <DoneBanner hints={presses} />}
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
            ctx.report("foundation_done", {});
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

export function WorkspaceView({ tabs, activeId, onActive, makeCtx, taskDone = {}, busy = false, brokenTabs = {}, onRebuild }: Props) {
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
      <div className={styles.view} data-pet-column>
        <PhaseSwitch tabs={tabs} activeId={activeId} onActive={onActive} />
        {tabs.map((w) => (
          <Doc key={w.id} w={w} p={w.phase} hidden={w.id !== activeId} tabbed={tabs.length > 1} base={makeCtx(w)} hasSolve={tabs.some((tab) => tab.phase === "solve")} taskDone={taskDone[w.id] ?? []} busy={busy} broken={!!brokenTabs[w.id]} onRebuild={onRebuild} />
        ))}
      </div>
    </div>
  );
}
