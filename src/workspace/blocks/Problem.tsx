import { useState } from "react";
import { copy } from "@/lib/copy";
import { Md, MdInline } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./working.module.css";

type Problem = Extract<Block, { type: "problem" }>;

export function Problem({ block, ctx, collapsible = false }: BlockProps<Problem> & { collapsible?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (collapsible) {
    return (
      <section className={styles.problemHeader}>
        {expanded && <div className={styles.problem}>
          <Md text={block.md} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {block.image && <img className={styles.img} src={block.image.src} alt={block.image.alt} />}
        </div>}
        <button type="button" className={styles.problemToggle} aria-expanded={expanded} aria-label={expanded ? copy.collapseProblem : copy.expandProblem} onClick={() => setExpanded(!expanded)}>
          {expanded ? <span className={styles.collapseControl}>{copy.collapseProblem}</span> : <span className={styles.problemClamp}>{block.md.split(/(\$[^$\n]+\$|\d+(?:[.,]\d+)?)/g).map((part, i) => /^(?:\$[^$\n]+\$|\d+(?:[.,]\d+)?)$/.test(part) ? <mark key={i}><MdInline text={part} /></mark> : <MdInline key={i} text={part} />)}</span>}
        </button>
      </section>
    );
  }
  return (
    <section className={`${styles.card} ${ctx.phase !== "learn" ? styles.solveProblem : ""}`}>
      <h2 className={styles.label}>{copy.problemLabel}</h2>
      <div className={styles.problem}>
        <Md text={block.md} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {block.image && <img className={styles.img} src={block.image.src} alt={block.image.alt} />}
    </section>
  );
}
