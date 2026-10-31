import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePetScrollerRef } from "@/components/pet/PetAnchor";
import { copy } from "@/lib/copy";
import { BlockBoundary } from "./BlockBoundary";
import { renderBlock } from "./blocks";
import { DoneBanner } from "./DoneBanner";
import { MdInline } from "./md";
import { HelpBar } from "./HelpBar";
import { PhaseSwitch } from "./PhaseSwitch";
import type { BlockCtx, Phase, Workspace } from "./types";
import styles from "./WorkspaceView.module.css";

type Props = {
  tabs: (Workspace & { phase: Phase })[];
  activeId: string;
  onActive: (id: string) => void;
  makeCtx: (w: Workspace) => BlockCtx;
  taskDone?: Record<string, string[]>; // master completions (SSE task_done), by workspace id
};

function Doc({ w, p, hidden, tabbed, base, hasSolve, taskDone }: {
  w: Workspace;
  p: Phase;
  hidden: boolean;
  tabbed: boolean; // a PhaseSwitch exists, so this is a tab panel
  base: BlockCtx;
  hasSolve: boolean;
  taskDone: string[];
}) {
  const [presses, setPresses] = useState(0);
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
  const help = { level, onHint: () => onHint(), onIdea: p === "solve" ? () => base.report("foundation_requested", {}) : undefined };
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
    state: w.state,
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
      <h1 className={styles.title}><MdInline text={w.doc.title} /></h1>
      {w.doc.blocks.map((b) => (
        <BlockBoundary key={b.id} blockId={b.id} report={ctx.report}>
          {renderBlock(b, b.type === "steps" ? {
            ...ctx,
            finished: completedIds.has(b.id),
            help: { ...help, onHint: () => onHint(b.id) },
          } : ctx)}
        </BlockBoundary>
      ))}
      {working && !stepsId && <HelpBar level={help.level} onHint={help.onHint} onIdea={help.onIdea} />}
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
      {p === "learn" && hasSolve && (
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
    </section>
  );
}

export function WorkspaceView({ tabs, activeId, onActive, makeCtx, taskDone = {} }: Props) {
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
      className={styles.scroll} onScroll={(e) => (tops.current[shown.current] = e.currentTarget.scrollTop)}>
      <div className={styles.view} data-pet-column>
        <PhaseSwitch tabs={tabs} activeId={activeId} onActive={onActive} />
        {tabs.map((w) => (
          <Doc key={w.id} w={w} p={w.phase} hidden={w.id !== activeId} tabbed={tabs.length > 1} base={makeCtx(w)} hasSolve={tabs.some((tab) => tab.phase === "solve")} taskDone={taskDone[w.id] ?? []} />
        ))}
      </div>
    </div>
  );
}
