import { IconPlus } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import styles from "./NewProblemButton.module.css";

export function NewProblemButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.button} onClick={onClick}>
      <IconPlus size={16} aria-hidden="true" />
      {copy.newProblem}
    </button>
  );
}
