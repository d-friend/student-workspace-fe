import Image from "next/image";
import { IconPlus } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import logo from "../../../assets/logo.png";
import styles from "./RailHeader.module.css";

export function RailHeader({ showNewProblem, onNewProblem }: { showNewProblem: boolean; onNewProblem: () => void }) {
  return (
    <header className={styles.header}>
      <span className={styles.brand}>
        {/* Decorative: the wordmark next to it carries the name. */}
        <Image src={logo} alt="" priority className={styles.logo} />
        <span className={styles.wordmark}>D-Friend</span>
      </span>
      {showNewProblem && (
        <button type="button" className={styles.newProblem} onClick={onNewProblem}>
          <IconPlus size={16} aria-hidden="true" />
          {copy.newProblem}
        </button>
      )}
    </header>
  );
}
