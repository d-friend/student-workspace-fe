import { IconCheck } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./blocks/working.module.css";

export function DoneBanner() {
  return (
    <div className={styles.done} role="status">
      <IconCheck size={20} stroke={2} aria-hidden="true" />
      <b>{copy.doneTitle}</b>
    </div>
  );
}
