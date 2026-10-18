import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useId, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { Md } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

type Quiz = Extract<Block, { type: "quiz" }>;

export function Quiz({ block, ctx }: BlockProps<Quiz>) {
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState(false);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [answered, setAnswered] = useState<{ option: string; ok: boolean } | null>(null); // set only when a check returned
  const inputId = useId();
  const qId = useId();
  const optRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isOpen = block.answer === "open";

  async function submit(answer: string) {
    if (busy || done || !answer.trim()) return;
    const n = tries + 1;
    if (isOpen) {
      setTries(n);
      setDone(true);
      // No ok: code never judges an open answer, so the router sends it to the master.
      ctx.report("quiz_answered", { block_id: block.id, answer, tries: n });
      return;
    }
    setBusy(true);
    setSelected(answer);
    setFailed(false);
    try {
      // The key judges a choice by the option's index (its `correct` list), not its text.
      const sent = block.answer === "choice" ? String((block.options ?? []).indexOf(answer)) : answer;
      const r = await ctx.check(block.id, sent, []);
      setTries(n);
      setAnswered({ option: answer, ok: r.ok });
      if (r.ok || n >= 2) setDone(true);
      ctx.report("quiz_answered", { block_id: block.id, answer, ok: r.ok, tries: n });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <div id={qId} className={styles.prose}>
        <Md text={block.question_md} />
      </div>
      {block.answer === "choice" ? (
        <div role="radiogroup" aria-labelledby={qId} className={styles.options}>
          {(block.options ?? []).map((o, i, all) => {
            const current = selected ? o === selected : i === 0;
            const mine = selected === o;
            const shown = answered?.option === o ? answered : null; // the pending pick shows no verdict
            return (
              <div
                key={o}
                ref={(el) => {
                  optRefs.current[i] = el;
                }}
                role="radio"
                aria-checked={mine}
                aria-disabled={done}
                tabIndex={current ? 0 : -1}
                className={`${styles.option} ${shown?.ok ? styles.optionOk : ""} ${shown && !shown.ok ? styles.optionReview : ""}`}
                onClick={() => submit(o)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void submit(o);
                    return;
                  }
                  const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
                  if (d) {
                    e.preventDefault();
                    optRefs.current[(i + d + all.length) % all.length]?.focus();
                  }
                }}
              >
                <Md text={o} />
                {shown && (
                  <span className={styles.badge}>
                    {shown.ok ? <IconCheck size={20} stroke={2} aria-hidden="true" /> : <IconAlertTriangle size={20} stroke={2} aria-hidden="true" />}
                    {shown.ok ? copy.stateOk : copy.stateReview}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <form
          className={styles.field}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          <label htmlFor={inputId} className={styles.small}>
            {copy.answer}
          </label>
          <div className={styles.row}>
            <input
              id={inputId}
              className={styles.input}
              value={text}
              disabled={done}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className={styles.btn} disabled={done || busy}>
              {copy.answer}
            </button>
          </div>
        </form>
      )}
      <div aria-live="polite">
        {isOpen && done && <p className={styles.small}>{copy.sent}</p>}
        {failed && <p className={styles.small}>{copy.checkFailed}</p>}
        {done && !isOpen && (
          <div className={`${styles.prose} ${styles.reveal}`}>
            <Md text={block.explanation_md} />
          </div>
        )}
      </div>
    </section>
  );
}
