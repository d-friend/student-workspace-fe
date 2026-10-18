import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { BlockBoundary } from "./BlockBoundary";
import { renderBlock } from "./blocks";
import { DoneBanner } from "./DoneBanner";
import { MdInline } from "./md";
import { HelpBar } from "./HelpBar";
import { PhaseSwitch } from "./PhaseSwitch";
import type { BlockCtx, Phase, Workspace } from "./types";
import styles from "./WorkspaceView.module.css";

const ORDER: Phase[] = ["learn", "solve", "practice"];

type Props = {
  workspaces: Partial<Record<Phase, Workspace>>;
  phase: Phase;
  onPhase: (p: Phase) => void;
  makeCtx: (w: Workspace) => BlockCtx;
  taskDone?: Record<string, string[]>; // master completions (SSE task_done), by workspace id
};

function Doc({ w, p, hidden, tabbed, base, onPhase, hasSolve, taskDone }: {
  w: Workspace;
  p: Phase;
  hidden: boolean;
  tabbed: boolean; // a PhaseSwitch exists, so this is a tab panel
  base: BlockCtx;
  onPhase: (p: Phase) => void;
  hasSolve: boolean;
  taskDone: string[];
}) {
  const [presses, setPresses] = useState(0);
  const [solved, setSolved] = useState<{ via?: "master" } | null>(null);
  const reported = useRef(false);
  const level = Math.min(presses, 3);
  const working = p !== "learn";
  const stepsIds = w.doc.blocks.filter((b) => b.type === "steps").map((b) => b.id);
  const stepsId = w.doc.blocks.find((b) => b.type === "steps")?.id ?? ""; // not stepsIds[0]: React Compiler would see ctx.help mutating stepsIds
  const mastered = stepsIds.some((id) => taskDone.includes(id));
  const fin = useMemo(() => solved ?? (mastered ? { via: "master" as const } : null), [solved, mastered]);

  useEffect(() => {
    if (!fin || reported.current) return;
    reported.current = true;
    base.report("task_completed", { similar: p === "practice", helped: presses > 0, max_hint: level, ...(fin.via && { via: fin.via }) });
  }, [fin, base, p, presses, level]);

  const onHint = () => {
    setPresses(presses + 1);
    base.report("help_requested", { block_id: stepsId, level: Math.min(presses + 1, 3) });
  };
  const help = { level, onHint, onIdea: p === "solve" ? () => base.report("foundation_requested", {}) : undefined };
  const ctx: BlockCtx = {
    ...base,
    hintCount: presses,
    help,
    onSolved: (id) => {
      base.onSolved(id);
      setSolved((f) => f ?? {});
    },
  };

  return (
    <section id={`panel-${p}`} {...(tabbed && { role: "tabpanel", "aria-labelledby": `tab-${p}` })} hidden={hidden} className={styles.doc} data-phase={p}>
      <h1 className={styles.title}><MdInline text={w.doc.title} /></h1>
      {w.doc.blocks.map((b) => (
        <BlockBoundary key={b.id} blockId={b.id} report={ctx.report}>
          {renderBlock(b, ctx)}
        </BlockBoundary>
      ))}
      {working && !stepsId && <HelpBar level={help.level} onHint={help.onHint} onIdea={help.onIdea} />}
      {fin && <DoneBanner />}
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
            onPhase("solve");
          }}
        >
          {copy.backToProblem}
        </button>
      )}
    </section>
  );
}

export function WorkspaceView({ workspaces, phase, onPhase, makeCtx, taskDone = {} }: Props) {
  const present = ORDER.filter((p) => workspaces[p]);
  // Hidden docs share this scroller, so a switch would carry the offset over; keep one per phase.
  const scroller = useRef<HTMLDivElement>(null);
  const tops = useRef<Partial<Record<Phase, number>>>({});
  const shown = useRef(phase);
  useLayoutEffect(() => {
    shown.current = phase;
    if (scroller.current) scroller.current.scrollTop = tops.current[phase] ?? 0;
  }, [phase]);
  return (
    <div ref={scroller} className={styles.scroll} onScroll={(e) => (tops.current[shown.current] = e.currentTarget.scrollTop)}>
      <div className={styles.view}>
        {present.length > 1 && <PhaseSwitch phases={present} phase={phase} onPhase={onPhase} />}
        {present.map((p) => {
          const w = workspaces[p]!;
          return (
            <Doc key={w.id} w={w} p={p} hidden={p !== phase} tabbed={present.length > 1} base={makeCtx(w)} onPhase={onPhase} hasSolve={!!workspaces.solve} taskDone={taskDone[w.id] ?? []} />
          );
        })}
      </div>
    </div>
  );
}
