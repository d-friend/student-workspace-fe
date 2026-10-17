import { useState } from "react";
import { copy } from "@/lib/copy";
import { Md, MdInline } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

export function Example({ block }: BlockProps<Extract<Block, { type: "example" }>>) {
  const [shown, setShown] = useState(1);
  const more = shown < block.steps.length;
  return (
    <section className={styles.card}>
      <h3 className={styles.cardTitle}><MdInline text={block.title} /></h3>
      <div className={styles.prose}>
        <Md text={block.problem_md} />
      </div>
      <ol className={styles.steps}>
        {block.steps.slice(0, shown).map((s, i) => (
          <li key={i} className={styles.reveal}>
            <Md text={s} />
          </li>
        ))}
      </ol>
      {more && (
        <div className={styles.row}>
          <button type="button" className={styles.btn} onClick={() => setShown(shown + 1)}>
            {copy.nextStep}
          </button>
          <button type="button" className={styles.btn} onClick={() => setShown(block.steps.length)}>
            {copy.showAll}
          </button>
        </div>
      )}
    </section>
  );
}
