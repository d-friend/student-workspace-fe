import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { FeedbackButton } from "./FeedbackButton";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./Shell.module.css";

// The full-viewport shell reserves the chat column on desktop and makes the main content inert while the mobile sidebar is open.
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
