import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { Block, BlockProps } from "../types";
import styles from "./working.module.css";

type Steps = Extract<Block, { type: "steps" }>;
type Entry = { text: string; state: "ok" | "review" };

export function Steps({ block, ctx }: BlockProps<Steps>) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const dirty = useRef(false); // this position had a review or error
  const hintBase = useRef(0); // ctx.hintCount at the last ok line

  const ov = ctx.overrides[block.id] ?? {};
  const effective = entries.map((e, i) => ov[i + 1] ?? e.state);
  let pos = 0;
  while (pos < entries.length && effective[pos] === "ok") pos++;

  async function run(answer: string) {
    if (busy || !answer.trim()) return;
    setBusy(true);
    setFailed(null);
    const previous = entries.slice(0, pos).map((e) => e.text);
    try {
      const r = await ctx.check(block.id, answer, previous);
      const retried = dirty.current || ctx.hintCount > hintBase.current;
      setEntries([...entries.slice(0, pos), { text: answer, state: r.state }]);
      ctx.report("line_checked", { block_id: block.id, line: pos + 1, text: answer, ok: r.ok, state: r.state, retried });
      if (r.state === "ok") {
        dirty.current = false;
        hintBase.current = ctx.hintCount;
        setText("");
      } else dirty.current = true;
      if (r.done) ctx.onSolved(block.id);
    } catch {
      dirty.current = true;
      setFailed(answer);
    } finally {
      setBusy(false);
      input.current?.focus();
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
      <form
        className={styles.entry}
        onSubmit={(e) => {
          e.preventDefault();
          void run(text);
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
    </section>
  );
}
