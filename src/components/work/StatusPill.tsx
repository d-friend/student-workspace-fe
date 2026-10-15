import type { ReactNode } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import styles from "./StatusPill.module.css";

// Top-right pill over the work area: a turn is running. The parent must be position: relative.
export function StatusPill({ children }: { children: ReactNode }) {
  return (
    <div role="status" className={styles.pill}>
      <IconLoader2 size={16} aria-hidden="true" className={styles.spin} />
      {children}
    </div>
  );
}
