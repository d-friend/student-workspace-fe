import { useId, useState } from "react";
import { copy } from "@/lib/copy";
import { Md } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

type Quiz = Extract<Block, { type: "quiz" }>;

export function Quiz({ block, ctx }: BlockProps<Quiz>) {
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState(false);
  const [wrong, setWrong] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const isOpen = block.answer === "open";

  async function submit(answer: string) {
    if (busy || done || !answer.trim()) return;
    const n = tries + 1;
    if (isOpen) {
      setTries(n);
      setDone(true);
      ctx.report("quiz_answered", { block_id: block.id, answer, ok: false, tries: n });
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const r = await ctx.check(block.id, answer, []);
      setTries(n);
      setWrong(r.ok ? null : answer);
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
      <div className={styles.prose}>
        <Md text={block.question_md} />
      </div>
      {block.answer === "choice" ? (
        <div role="radiogroup" className={styles.options}>
          {(block.options ?? []).map((o) => (
            <div
              key={o}
              role="radio"
              aria-checked={wrong === o}
              aria-disabled={done}
              tabIndex={done ? -1 : 0}
              className={styles.option}
              onClick={() => submit(o)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  void submit(o);
                }
              }}
            >
              <Md text={o} />
            </div>
          ))}
        </div>
      ) : (
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(text);
          }}
        >
          <label htmlFor={inputId} className={styles.srOnly}>
            {copy.answer}
          </label>
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
        </form>
      )}
      {isOpen && done && <p className={styles.small}>{copy.sent}</p>}
      {failed && <p className={styles.small}>{copy.checkFailed}</p>}
      {done && !isOpen && (
        <div className={`${styles.prose} ${styles.reveal}`}>
          <Md text={block.explanation_md} />
        </div>
      )}
    </section>
  );
}
