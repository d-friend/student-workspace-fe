import type { ReactNode, Ref } from "react";
import { copy } from "@/lib/copy";
import { FeedbackButton } from "./FeedbackButton";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./Shell.module.css";

// The full-viewport shell reserves the chat column on desktop and makes the main content inert while the mobile sidebar is open.
export function Shell({
  bar,
  menuRef,
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
  menuRef?: Ref<HTMLDivElement>;
  work: ReactNode;
  layer: ReactNode;
  chatOpen?: boolean;
  inert?: boolean;
}) {
  return (
    <div className={styles.shell} data-chat={chatOpen || undefined} data-side={sidebar ? side ?? "rail" : undefined} data-sidebar={sidebar ? true : undefined} data-top-bar={!!bar || undefined}>
      {sidebar && <aside className={styles.sidebar}>{sidebar}</aside>}
      <div className={styles.stage} inert={inert}>
        {bar && <header className={styles.topBar}>
          <div className={styles.menuSlot} ref={menuRef} />
          {bar}
          <FeedbackButton />
          <ThemeToggle />
        </header>}
        <main aria-label={copy.workLabel} className={styles.work}>
          {work}
        </main>
        {!bar && !chatOpen && <><FeedbackButton /><ThemeToggle /></>}
      </div>
      {layer}
    </div>
  );
}
