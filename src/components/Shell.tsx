import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./Shell.module.css";

// One full-viewport container: the stage (top bar + work) and, over it, the pet layer. `inert` freezes the stage
// while the chat drawer is open.
export function Shell({
  bar,
  work,
  layer,
  inert = false,
}: {
  bar?: ReactNode;
  work: ReactNode;
  layer: ReactNode;
  inert?: boolean;
}) {
  return (
    <div className={styles.shell}>
      <div className={styles.stage} inert={inert}>
        {bar}
        <main aria-label={copy.workLabel} className={styles.work}>
          {work}
        </main>
        <ThemeToggle />
      </div>
      {layer}
    </div>
  );
}
