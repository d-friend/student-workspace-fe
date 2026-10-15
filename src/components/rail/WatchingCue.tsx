import { IconEye } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./WatchingCue.module.css";

// Shown while the student works alone in the workspace and D-Friend stays quiet.
export function WatchingCue() {
  return (
    <p role="status" className={styles.cue}>
      <IconEye size={18} aria-hidden="true" />
      {copy.watching}
    </p>
  );
}
