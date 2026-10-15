import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import styles from "./Bubble.module.css";

type Props =
  | { variant: "agent-review"; line: number; muted?: boolean; children: ReactNode }
  | { variant: "student" | "agent" | "error" | "note"; line?: undefined; muted?: boolean; children: ReactNode };

// `muted` is for older agent bubbles, after the latest one. `agent-review` adds the "Về dòng N" label.
export function Bubble({ variant, line, muted = false, children }: Props) {
  const className = [styles.bubble, styles[variant], muted ? styles.muted : ""].filter(Boolean).join(" ");
  if (variant !== "agent-review") return <div className={className}>{children}</div>;
  return (
    <div className={styles.review}>
      <span className={styles.reviewLabel}>{copy.reviewLabel(line)}</span>
      <div className={className}>{children}</div>
    </div>
  );
}
