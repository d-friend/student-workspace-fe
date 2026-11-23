import { type FormEvent, useState } from "react";
import { copy } from "@/lib/copy";
import styles from "./Pack.module.css";

// One tap on a guess, or "Môn khác" and a typed name. The caller starts the pipeline again with the answer.
export function SubjectChooser({ options, busy, onChoose }: { options: string[]; busy: boolean; onChoose: (subject: string) => void }) {
  const [other, setOther] = useState(false);
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onChoose(name.trim());
  };
  return <div className={styles.chooser}>
    <p className={styles.ask}>{copy.packAskSubject}</p>
    <div className={styles.chips}>
      {options.slice(0, 3).map(option => <button key={option} type="button" className={styles.chip} disabled={busy} onClick={() => onChoose(option)}>{option}</button>)}
      <button type="button" className={styles.chip} data-other aria-expanded={other} disabled={busy} onClick={() => setOther(v => !v)}>{copy.packSubjectOther}</button>
    </div>
    {other && <form className={styles.otherForm} onSubmit={submit}>
      <input className={styles.input} value={name} maxLength={80} aria-label={copy.packSubjectName} placeholder={copy.packSubjectName} onChange={e => setName(e.target.value)} autoFocus />
      <button type="submit" className={styles.primary} disabled={busy || !name.trim()}>{copy.packSubjectConfirm}</button>
    </form>}
  </div>;
}
