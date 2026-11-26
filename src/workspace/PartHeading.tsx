import { IconCheck, IconLock } from "@tabler/icons-react";
import { useCopy } from "./WorkspaceCopy";
import { MdInline } from "./md";
import styles from "./PartHeading.module.css";

// The heading of one part (a, b, c) of a multi-part problem. State is words plus an icon, never colour alone.
export function PartHeading({ label, status }: { label: string; status?: "done" | "later" }) {
  const copy = useCopy();
  return (
    <h2 className={styles.part} data-status={status}>
      <span className={styles.label}><MdInline text={label} /></span>
      {status && <span className={styles.status}>
        {status === "done" ? <IconCheck size={16} aria-hidden="true" /> : <IconLock size={16} aria-hidden="true" />}
        {status === "done" ? copy.partDone : copy.partLater}
      </span>}
    </h2>
  );
}
