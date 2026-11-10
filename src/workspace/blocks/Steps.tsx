import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { usePetAnchorRef } from "@/components/pet/PetAnchor";
import { track } from "@/lib/track";
import { useCopy } from "../WorkspaceCopy";
import { HelpBar } from "../HelpBar";
import { MathInline, MdInline } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./working.module.css";

type Steps = Extract<Block, { type: "steps" }>;
type Entry = { text: string; state: "ok" | "review"; answer?: string; item?: number; why?: string };
type Attempt = { answer: string; text: string; input: "choice" | "blank" | "free"; item?: number };

export function blankSides(pre: string, post: string): [string, string] {
  let dollars = 0;
  for (let i = 0; i < pre.length; i++) {
    if (pre[i] !== "$") continue;
    let slashes = 0;
    for (let j = i - 1; j >= 0 && pre[j] === "\\"; j--) slashes++;
    if (slashes % 2 === 0) dollars++;
  }
  return dollars % 2 ? [pre + "$", "$" + post] : [pre, post];
}

export function filledBlank(pre: string, post: string, answer: string, answerTex?: string): string {
  if (answerTex === undefined) return pre + answer + post;
  if (blankSides(pre, post)[0] !== pre) return pre + answerTex + post;
  return pre + (pre.endsWith("$") ? " " : "") + "$" + answerTex + "$" + (post.startsWith("$") ? " " : "") + post;
}

export function Steps({ block, ctx }: BlockProps<Steps>) {
  const copy = useCopy();
  const saved = ctx.state?.blocks?.[block.id];
  const initial = saved?.type === "steps" ? saved : null;
  const [entries, setEntries] = useState<Entry[]>(initial?.entries ?? []);
  const [openWhy, setOpenWhy] = useState<Record<number, boolean>>({});
  const last = initial?.entries.at(-1);
  const [text, setText] = useState(last?.state === "review" ? (last.answer ?? last.text) : "");
  const [failed, setFailed] = useState<Attempt | null>(null);
  const [wrongNote, setWrongNote] = useState<{ message: string; pos: number; item: NonNullable<Steps["scaffold"]>[number] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(initial?.done ?? false);
  const [learnFree, setLearnFree] = useState(initial?.free ?? false);
  const free = ctx.phase === "learn" ? learnFree : (ctx.help?.free ?? initial?.free ?? false);
  const previousFree = useRef(free);
  const locked = !!ctx.askPending && ctx.phase !== "learn";
  const previousLocked = useRef(locked);
  const finished = done || !!ctx.finished; // the master can complete a block the code could not (prose lines)
  const anchorRef = usePetAnchorRef(!ctx.preview && !finished && !ctx.hidden);
  const inline = ctx.phase === "solve" || ctx.phase === "practice";
  const inputId = useId();
  const promptId = useId();
  const whyId = useId();
  const group = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const refocus = useRef(false); // focus the input once the next render has put it in place
  const dirty = useRef(false); // this position had a review or error
  const hintBase = useRef(0); // ctx.hintCount at the last ok line
  const replayed = useRef(false);

  const ov = ctx.overrides[block.id] ?? {};
  const effective = entries.map((e, i) => ov[i + 1] ?? e.state);
  let pos = 0;
  while (pos < entries.length && effective[pos] === "ok") pos++;
  // Past the last item without done (the master judged it ok, or an override moved on) the student types freely.
  const item = block.scaffold && !free && pos < block.scaffold.length ? block.scaffold[pos] : null;
  const [pre = "", post = ""] = item?.kind === "blank" ? item.template.split("___") : [];
  const [displayPre, displayPost] = blankSides(pre, post);

  useEffect(() => () => setWrongNote(null), [pos, item]);

  useEffect(() => {
    if (free && !previousFree.current) {
      setText("");
      input.current?.focus();
    }
    previousFree.current = free;
  }, [free]);

  useEffect(() => {
    if (previousLocked.current && !locked && !ctx.hidden) refocus.current = true;
    previousLocked.current = locked;
  }, [locked, ctx.hidden]);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (input.current ?? group.current?.querySelector("button"))?.focus(); // the disabled buttons dropped focus
  });

  async function run(a: Attempt) {
    setWrongNote(null);
    if (busy || locked || finished || !a.answer.trim()) return;
    setBusy(true);
    setFailed(null);
    // shortcut: previous scaffold lines may not parse as SymPy, so code-side checkpoint progress can lag; the master covers it.
    const previous = entries.slice(0, pos).map((e) => e.text);
    try {
      const r = await ctx.check(block.id, a.answer, previous, ...(a.item === undefined ? [] : [a.item]));
      const retried = dirty.current || ctx.hintCount > hintBase.current;
      const checkedItem = a.item === undefined ? undefined : block.scaffold?.[a.item];
      const explained = ctx.phase !== "learn" && a.input === "choice" && r.state === "review" && typeof r.message === "string" && !!r.message.trim() && checkedItem?.kind === "choice";
      if (explained) setWrongNote({ message: r.message!, pos: a.item!, item: checkedItem });
      let line = r.state === "ok" && a.input === "choice" ? (r.line ?? a.text) : a.text;
      if (ctx.phase !== "learn" && r.state === "ok" && a.input === "blank" && checkedItem?.kind === "blank" && r.answer_tex !== undefined) {
        const [before = "", after = ""] = checkedItem.template.split("___");
        line = filledBlank(before, after, a.answer, r.answer_tex);
      }
      const committed = [...entries.slice(0, pos), { text: line, state: r.state, answer: a.answer, ...(a.item !== undefined && { item: a.item }), ...(ctx.phase !== "learn" && r.state === "ok" && checkedItem && r.why !== undefined && { why: r.why }) }];
      setEntries(committed);
      setOpenWhy((current) => Object.fromEntries(Object.entries(current).filter(([index]) => Number(index) < pos)));
      ctx.saveBlock?.(block.id, { type: "steps", entries: committed, done: r.done, free, ...(r.done && r.takeaway !== undefined && { takeaway: r.takeaway }) });
      ctx.report("line_checked", { block_id: block.id, line: pos + 1, text: a.text, ok: r.ok, state: r.state, retried, input: a.input, ...(explained && { explained: true }) });
      if (r.state === "ok") {
        dirty.current = false;
        hintBase.current = ctx.hintCount;
        setText("");
      } else dirty.current = true;
      if (r.done) {
        setDone(true);
        ctx.onSolved(block.id);
      }
    } catch {
      dirty.current = true;
      setFailed(a);
    } finally {
      setBusy(false);
      refocus.current = true;
    }
  }

  useEffect(() => {
    const queued = ctx.queued;
    if (locked || replayed.current || !queued || queued.blockId !== block.id || initial || entries.length || pos !== 0) return;
    replayed.current = true;
    ctx.clearQueued?.();
    void run(queued);
  });

  return (
    <section className={`${styles.card} ${ctx.phase !== "learn" ? styles.solveSteps : ""}`}>
      <ol className={styles.lines} aria-live="polite">
        {entries.map((e, i) => (
          <li key={`${i}-${effective[i]}`} className={`${styles.line} ${effective[i] === "review" ? styles.lineReview : ""}`}>
            {ctx.phase === "learn" && <span className={styles.n}>{i + 1}</span>}
            {ctx.phase !== "learn" && effective[i] === "ok" && <span className={styles.badge}><IconCheck size={20} stroke={2} role="img" aria-label={copy.stateOk} /></span>}
            <span className={styles.lineText}>
              <MathInline text={e.text} />
            </span>
            {(effective[i] === "review" || ctx.phase === "learn") && <span className={`${styles.badge} ${effective[i] === "review" ? styles.badgeReview : ""}`}>{effective[i] === "review" ? <IconAlertCircle size={20} stroke={2} aria-hidden="true" /> : <IconCheck size={20} stroke={2} aria-hidden="true" />}{effective[i] === "review" ? copy.stateReview : copy.stateOk}</span>}
            {ctx.phase !== "learn" && e.state === "ok" && effective[i] === "ok" && e.item !== undefined && e.why && (
              <div className={styles.why}>
                <button type="button" className={styles.whyToggle} aria-expanded={!!openWhy[i]} aria-controls={`${whyId}-${i}`} onClick={() => {
                  if (!openWhy[i]) track("line_why_opened", { block_id: block.id, line: i + 1 }, ctx.sessionId);
                  setOpenWhy((current) => ({ ...current, [i]: !current[i] }));
                }}>{copy.lineWhy}</button>
                <div id={`${whyId}-${i}`} className={styles.whyReason} hidden={!openWhy[i]}><MdInline text={e.why} /></div>
              </div>
            )}
          </li>
        ))}
        {failed !== null && (
          <li className={styles.line}>
            <span className={styles.lineText}>{copy.checkFailed}</span>
            <button type="button" className={styles.btn} disabled={busy} onClick={() => void run(failed)}>
              {copy.retry}
            </button>
          </li>
        )}
      </ol>
      {!finished && (
        <div ref={anchorRef} data-pet-anchor data-pet-inline={inline ? "" : undefined} data-n={pos + 1} data-item={item ? pos : undefined} className={styles.active}>
          {inline && (
            <div className={styles.patchQuestion}>
              <div data-pet-slot className={styles.patchSlot} />
              <p id={promptId} data-sel="prompt" className={styles.patchPrompt}>
                <MathInline text={item?.kind === "choice" ? item.prompt : item?.kind === "blank" ? copy.fillBlank : copy.lineLabel(pos + 1)} />
              </p>
            </div>
          )}
          {item?.kind === "choice" ? (
            <>
              {!inline && <p id={promptId} data-sel="prompt" className={styles.entryLabel}>
                <MathInline text={item.prompt} />
              </p>}
              <div ref={group} role="group" aria-labelledby={promptId} className={styles.options}>
                {item.options.map((o, i) => (
                  <button key={i} type="button" className={`${styles.btn} ${styles.option}`} disabled={busy || locked} onClick={(event) => { const selection = window.getSelection(); if (selection && !selection.isCollapsed && selection.anchorNode && event.currentTarget.contains(selection.anchorNode)) return; void run({ answer: String(i), text: o, input: "choice", item: pos }); }}>
                    <span className={styles.optionLabel} aria-hidden="true">{String.fromCharCode(65 + i)}</span>
                    <span data-sel="option" className={styles.optionText}><MathInline text={o} /></span>
                  </button>
                ))}
              </div>
              {wrongNote?.pos === pos && wrongNote.item === item && <p role="status" className={`${styles.small} ${styles.wrongNote}`}>{wrongNote.message}</p>}
            </>
          ) : item ? (
            <form
              className={styles.blank}
              onSubmit={(e) => {
                e.preventDefault();
                void run({ answer: text, text: pre + text + post, input: "blank", item: pos });
              }}
            >
              <label htmlFor={inputId} className={styles.srOnly}>
                {copy.blankLabel(pos + 1)}
              </label>
              {displayPre && displayPre !== "$$" && <span><MathInline text={displayPre} /></span>}
              <input ref={input} id={inputId} className={`${styles.input} ${styles.gap}`} value={text} disabled={busy || locked} onChange={(e) => setText(e.target.value)} autoComplete="off" />
              {displayPost && displayPost !== "$$" && <span><MathInline text={displayPost} /></span>}
              <button type="submit" className={styles.primary} disabled={busy || locked}>
                {copy.check}
              </button>
            </form>
          ) : (
            <form
              className={styles.entry}
              onSubmit={(e) => {
                e.preventDefault();
                void run({ answer: text, text, input: "free" });
              }}
            >
              <label htmlFor={inputId} className={styles.entryLabel}>
                {copy.lineLabel(pos + 1)}
              </label>
              {block.help && <p className={`${styles.small} ${styles.help}`}>{block.help}</p>}
              <input ref={input} id={inputId} className={styles.input} value={text} disabled={locked} onChange={(e) => setText(e.target.value)} autoComplete="off" />
              <button type="submit" className={styles.primary} disabled={busy || locked}>
                {copy.check}
              </button>
            </form>
          )}
          {ctx.preview && busy && <p className={styles.small}>{copy.checkQueued}</p>}
          {ctx.preview?.pending && <p className={styles.small}>{copy.composingNext}</p>}
          {inline && <div data-pet-spoken-slot className={styles.patchSpoken} />}
          {ctx.phase === "learn" && ctx.help && <HelpBar {...ctx.help} />}
          {ctx.phase === "learn" && item && (
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                // shortcut: no way back to the scaffold; add one if students ask for it.
                setLearnFree(true);
                setText("");
                refocus.current = true;
                ctx.report("other_way_chosen", { block_id: block.id, line: pos + 1 });
              }}
            >
              {copy.otherWay}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
