import type { Preview, PreviewSteps } from "@/lib/api";
import { copy, copyFor } from "@/lib/copy";
import { MdInline } from "@/workspace/md";
import { renderBlock } from "@/workspace/blocks";
import { WorkspaceCopy } from "@/workspace/WorkspaceCopy";
import { workspaceLocale } from "@/workspace/workspaceLocale";
import type { QueuedAnswer } from "@/workspace/queued";
import type { Block, BlockCtx } from "@/workspace/types";
import styles from "./BuildingSkeleton.module.css";

const asSteps = (block: PreviewSteps): Extract<Block, { type: "steps" }> => ({
  ...block, problem_id: block.problem_id ?? "", input: block.input ?? "math", roadmap: block.roadmap ?? undefined,
});
const firstItemKey = (block: PreviewSteps) => {
  const item = block.scaffold?.[0];
  return JSON.stringify([block.id, item?.kind, item?.kind === "choice" ? item.prompt : item?.template]);
};

// Grey shapes in the shape of the doc being built: learn is a title, text and an image; solve (also practice) is a
// problem card and step rows.
export function BuildingSkeleton({
  variant = "solve",
  problem,
  preview,
  onQueue,
}: {
  variant?: "learn" | "solve";
  problem?: string; // what the student sent: the unfold's card lands here, so it must not turn into grey bars
  preview?: Preview | null;
  onQueue?: (answer: QueuedAnswer) => void;
}) {
  const b = (cls: string) => <span className={`${styles.block} ${cls}`} />;
  const ctx: BlockCtx = {
    phase: preview?.phase ?? "solve", workspaceId: "preview", report: () => {},
    overrides: {}, hintCount: 0, onSolved: () => {}, help: null,
    check: () => new Promise(() => {}),
  };
  const previewCtx = (block: PreviewSteps): BlockCtx => ({
    ...ctx, preview: { pending: block.pending },
    check: (blockId, answer, _previous, index) => {
      const item = block.scaffold?.[0];
      if (index === 0 && item?.kind === "choice") {
        const optionText = item.options[Number(answer)];
        if (optionText !== undefined) onQueue?.({ blockId, item: 0, input: "choice", prompt: item.prompt, optionText });
      } else if (index === 0 && item?.kind === "blank") {
        onQueue?.({ blockId, item: 0, input: "blank", template: item.template, value: answer });
      }
      return new Promise(() => {});
    },
  });
  const readySteps = preview?.blocks.some((blk) => blk.type === "steps" && !!blk.scaffold?.length);
  const previewCopy = preview ? copyFor(workspaceLocale({
    version: 1, phase: preview.phase, title: preview.title ?? "", sources: [],
    blocks: preview.blocks.flatMap((blk) => blk.type === "stub" ? [] : [blk.type === "steps" ? asSteps(blk) : blk]),
  })) : copy;
  return (
    <WorkspaceCopy.Provider value={previewCopy}>
      <section className={styles.wrap} aria-busy="true" data-variant={variant}>
        {variant === "learn" && preview && preview.blocks.length > 0 ? (
          <div className={styles.stack} data-unfold-target="">
            {preview.title && (
              <h1 className={styles.previewTitle}>
                <MdInline text={preview.title} />
              </h1>
            )}
            {preview.blocks.map((blk) =>
              blk.type === "stub" ? <div key={blk.id}>{b(styles.box)}</div> : <div key={blk.id}>{renderBlock(blk.type === "steps" ? asSteps(blk) : blk, ctx)}</div>,
            )}
            {b(styles.line)}
            {b(styles.lineShort)}
          </div>
        ) : variant === "learn" ? (
          <div className={styles.stack} data-unfold-target="">
            {b(styles.title)}
            <div className={styles.lines}>
              {b(styles.line)}
              {b(styles.line)}
              {b(styles.line)}
              {b(styles.lineShort)}
            </div>
            {b(styles.box)}
          </div>
        ) : (
          <div className={styles.stack} data-unfold-target="">
            {preview?.blocks.some((blk) => blk.type === "problem") ? preview.blocks.filter((blk) => blk.type === "problem").map((blk) =>
              <div key={blk.id}>{renderBlock(blk, ctx)}</div>,
            ) : <div className={styles.card}>
              {problem ? (
                <>
                  <h2 className={styles.problemLabel}>{previewCopy.problemLabel}</h2>
                  <p className={styles.problem}>{problem}</p>
                </>
              ) : (
                <>
                  {b(styles.label)}
                  {b(styles.line)}
                  {b(styles.lineShort)}
                </>
              )}
            </div>}
            {preview?.blocks.filter((blk) => blk.type !== "problem").map((blk) => {
              if (blk.type === "stub") return <div key={blk.id}>{b(styles.box)}</div>;
              if (blk.type === "steps") return blk.scaffold?.length
                ? <div key={firstItemKey(blk)}>{renderBlock(asSteps(blk), previewCtx(blk))}</div>
                : null;
              return <div key={blk.id}>{renderBlock(blk, ctx)}</div>;
            })}
            {!readySteps && <div className={styles.card}>
              {[0, 1, 2].map((i) => (
                <div key={i} className={styles.entry}>
                  {b(styles.num)}
                  {b(styles.input)}
                </div>
              ))}
            </div>}
          </div>
        )}
      </section>
    </WorkspaceCopy.Provider>
  );
}
