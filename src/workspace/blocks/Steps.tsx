import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import { usePetAnchorRef } from "@/components/pet/PetAnchor";
import { copy } from "@/lib/copy";
import { HelpBar } from "../HelpBar";
import type { Block, BlockProps } from "../types";
import styles from "./working.module.css";

type Steps = Extract<Block, { type: "steps" }>;
type Entry = { text: string; state: "ok" | "review" };
type Attempt = { answer: string; text: string; input: "choice" | "blank" | "free"; item?: number };

export function Steps({ block, ctx }: BlockProps<Steps>) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<Attempt | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [free, setFree] = useState(false);
  const anchorRef = usePetAnchorRef(!done && !ctx.hidden);
  const inputId = useId();
  const promptId = useId();
  const group = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const refocus = useRef(false); // focus the input once the next render has put it in place
  const dirty = useRef(false); // this position had a review or error
  const hintBase = useRef(0); // ctx.hintCount at the last ok line

  const ov = ctx.overrides[block.id] ?? {};
  const effective = entries.map((e, i) => ov[i + 1] ?? e.state);
  let pos = 0;
  while (pos < entries.length && effective[pos] === "ok") pos++;
  // Past the last item without done (the master judged it ok, or an override moved on) the student types freely.
  const item = block.scaffold && !free && pos < block.scaffold.length ? block.scaffold[pos] : null;
  const [pre, post = ""] = item?.kind === "blank" ? item.template.split("___") : [];

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    (input.current ?? group.current?.querySelector("button"))?.focus(); // the disabled buttons dropped focus
  });

  async function run(a: Attempt) {
    if (busy || done || !a.answer.trim()) return;
    setBusy(true);
    setFailed(null);
    // shortcut: previous scaffold lines may not parse as SymPy, so code-side checkpoint progress can lag; the master covers it.
    const previous = entries.slice(0, pos).map((e) => e.text);
    try {
      const r = await ctx.check(block.id, a.answer, previous, ...(a.item === undefined ? [] : [a.item]));
      const retried = dirty.current || ctx.hintCount > hintBase.current;
      setEntries([...entries.slice(0, pos), { text: a.text, state: r.state }]);
      ctx.report("line_checked", { block_id: block.id, line: pos + 1, text: a.text, ok: r.ok, state: r.state, retried, input: a.input });
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

  return (
    <section className={styles.card}>
      <ol className={styles.lines} aria-live="polite">
        {entries.map((e, i) => (
          <li key={`${i}-${effective[i]}`} className={`${styles.line} ${effective[i] === "review" ? styles.lineReview : ""}`}>
            <span className={styles.n}>{i + 1}</span>
            <span className={styles.lineText}>{e.text}</span>
            <span className={`${styles.badge} ${effective[i] === "review" ? styles.badgeReview : ""}`}>
              {effective[i] === "ok" ? <IconCheck size={20} stroke={2} aria-hidden="true" /> : <IconAlertCircle size={20} stroke={2} aria-hidden="true" />}
              {effective[i] === "ok" ? copy.stateOk : copy.stateReview}
            </span>
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
      {!done && (
        <div ref={anchorRef} data-pet-anchor data-n={pos + 1} className={styles.active}>
          {item?.kind === "choice" ? (
            <>
              <p id={promptId} className={styles.entryLabel}>
                {item.prompt}
              </p>
              <div ref={group} role="group" aria-labelledby={promptId} className={styles.options}>
                {item.options.map((o, i) => (
                  <button key={i} type="button" className={styles.btn} disabled={busy} onClick={() => void run({ answer: String(i), text: o, input: "choice", item: pos })}>
                    {o}
                  </button>
                ))}
              </div>
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
              {pre}
              <input ref={input} id={inputId} className={`${styles.input} ${styles.gap}`} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
              {post}
              <button type="submit" className={styles.primary} disabled={busy}>
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
              <input ref={input} id={inputId} className={styles.input} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
              <button type="submit" className={styles.primary} disabled={busy}>
                {copy.check}
              </button>
            </form>
          )}
          {ctx.help && <HelpBar {...ctx.help} />}
          {item && (
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                // shortcut: no way back to the scaffold; add one if students ask for it.
                setFree(true);
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
