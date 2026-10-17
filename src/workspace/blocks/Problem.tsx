import { copy } from "@/lib/copy";
import { Md } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./working.module.css";

type Problem = Extract<Block, { type: "problem" }>;

export function Problem({ block }: BlockProps<Problem>) {
  return (
    <section className={styles.card}>
      <h2 className={styles.label}>{copy.problemLabel}</h2>
      <div className={styles.problem}>
        <Md text={block.md} />
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {block.image && <img className={styles.img} src={block.image.src} alt={block.image.alt} />}
    </section>
  );
}
