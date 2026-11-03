import { copy } from "@/lib/copy";
import styles from "./Chips.module.css";

export type OptKind = "why" | "offer" | "answer";

// FNV-1a makes string message ids stable seeds; number ids are already stable.
function seedNumber(seed: number | string): number {
  if (typeof seed === "number") return seed >>> 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return hash >>> 0;
}

/** Deterministically order answer options; [why] choices vary by message, with uncertainty kept last. */
export function orderOpts(opts: string[], kind: OptKind, seed: number | string): string[] {
  if (kind !== "why") return opts;
  const keepLast = opts[opts.length - 1] === "Mình cũng không chắc";
  const choices = opts.slice(0, keepLast ? -1 : undefined);
  let state = seedNumber(seed);
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return keepLast ? [...choices, opts[opts.length - 1]] : choices;
}

// The agent's answer choices; the bubble adds "Tự nhắn" (onWriteOwn) to type a reply instead.
export function OptChips({
  options,
  kind,
  seed,
  onPick,
  onWriteOwn,
}: {
  options: string[];
  kind: OptKind;
  seed: number | string;
  onPick: (text: string) => void;
  onWriteOwn?: () => void;
}) {
  const orderedOptions = orderOpts(options, kind, seed);
  return (
    <div className={styles.row}>
      {orderedOptions.map((o, i) => (
        <button key={o} type="button" className={`${styles.chip} ${kind === "offer" && i === 0 ? styles.primary : ""}`} onClick={() => onPick(o)}>
          {o}
        </button>
      ))}
      {onWriteOwn && (
        <button type="button" className={styles.chip} onClick={onWriteOwn}>
          {copy.writeOwn}
        </button>
      )}
    </div>
  );
}
