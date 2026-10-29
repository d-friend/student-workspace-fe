import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { FeedbackButton } from "./FeedbackButton";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./Shell.module.css";

// One full-viewport container: the stage (top bar + work) and, over it, the pet layer. `chatOpen` makes room for the
// chat column from 800px; `inert` freezes the stage while a modal chat sheet is open.
export function Shell({
  bar,
  sidebar,
  side,
  work,
  layer,
  chatOpen = false,
  inert = false,
}: {
  sidebar?: ReactNode;
  side?: "open" | "rail";
  bar?: ReactNode;
  work: ReactNode;
  layer: ReactNode;
  chatOpen?: boolean;
  inert?: boolean;
}) {
  return (
    <div className={styles.shell} data-chat={chatOpen || undefined} data-side={sidebar ? side ?? "rail" : undefined} data-sidebar={sidebar ? true : undefined}>
      {sidebar && <aside className={styles.sidebar}>{sidebar}</aside>}
      <div className={styles.stage} inert={inert}>
        {bar}
        <main aria-label={copy.workLabel} className={styles.work}>
          {work}
        </main>
        <FeedbackButton />
        <ThemeToggle />
      </div>
      {layer}
    </div>
  );
}
