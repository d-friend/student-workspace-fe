import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import styles from "./Shell.module.css";

// Desktop: the rail on the left (380px), work fills the rest. Below 800px: work on top, rail below.
export function Shell({ rail, work }: { rail: ReactNode; work: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside aria-label={copy.chatLabel} className={styles.rail}>
        {rail}
      </aside>
      <main aria-label={copy.workLabel} className={styles.work}>
        {work}
      </main>
    </div>
  );
}
