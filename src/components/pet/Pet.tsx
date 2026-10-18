import type { PetMood } from "@/lib/pet";
import styles from "./Pet.module.css";

// celebrateKey is the React key of the body group: bumping it remounts the group so the happy jump replays.
export function Pet({ mood, className, celebrateKey }: { mood: PetMood; className?: string; celebrateKey?: number }) {
  return (
    <span className={`${styles.pet} ${className ?? ""}`} data-state={mood} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <ellipse cx="50" cy="95.5" rx="27" ry="3.6" fill="var(--pet-shadow)" opacity=".13" />
        <g key={celebrateKey} className={styles.body}>
          <path d="M50 23 C49 17 50 13 51 9" stroke="#2C8A57" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path className={styles.leaf} d="M51 10 C55 3 64 2 68 5 C64 11 57 13 51 10 Z" fill="#3BAA6C" />
          <rect x="15" y="22" width="70" height="70" rx="29" fill="#F27A3D" />
          <ellipse cx="50" cy="74" rx="23" ry="13.5" fill="#F8A06C" />
          <ellipse cx="28.5" cy="62" rx="5.5" ry="3.2" fill="#E8503A" opacity=".35" />
          <ellipse cx="71.5" cy="62" rx="5.5" ry="3.2" fill="#E8503A" opacity=".35" />
          <g className={`${styles.v} ${styles.open}`}><g className={styles.blink}>
            <ellipse cx="38" cy="51" rx="4.4" ry="6" fill="#15171C" /><ellipse cx="62" cy="51" rx="4.4" ry="6" fill="#15171C" />
            <circle cx="39.6" cy="48.6" r="1.5" fill="#fff" /><circle cx="63.6" cy="48.6" r="1.5" fill="#fff" />
          </g></g>
          {/* desktop board's eyes: the work is always to the pet's left (spec §4.1) */}
          <g className={`${styles.v} ${styles.down}`}><ellipse cx="33" cy="55" rx="4.4" ry="4.4" fill="#15171C" /><ellipse cx="57" cy="55" rx="4.4" ry="4.4" fill="#15171C" /></g>
          <g className={`${styles.v} ${styles.up}`}>
            <ellipse cx="41" cy="47" rx="4.4" ry="6" fill="#15171C" /><ellipse cx="65" cy="47" rx="4.4" ry="6" fill="#15171C" />
            <circle cx="42.6" cy="44.4" r="1.5" fill="#fff" /><circle cx="66.6" cy="44.4" r="1.5" fill="#fff" />
          </g>
          <g className={`${styles.v} ${styles.happyEyes}`}>
            <path d="M33 53 Q38 45.5 43 53" stroke="#15171C" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <path d="M57 53 Q62 45.5 67 53" stroke="#15171C" strokeWidth="3.2" strokeLinecap="round" fill="none" />
          </g>
          <g className={`${styles.v} ${styles.doubtEyes}`}>
            <ellipse cx="38" cy="52" rx="4.4" ry="5.6" fill="#15171C" />
            <path d="M57 52.5 L67 51.5" stroke="#15171C" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M56 43 L68 39" stroke="#15171C" strokeWidth="2.6" strokeLinecap="round" />
          </g>
          <g className={`${styles.v} ${styles.smile}`}><path d="M44 64 Q50 69 56 64" stroke="#15171C" strokeWidth="2.6" strokeLinecap="round" fill="none" /></g>
          <g className={`${styles.v} ${styles.o}`}><circle cx="53" cy="65" r="2.6" fill="#6B1E0C" /></g>
          <g className={`${styles.v} ${styles.talk}`}><ellipse className={styles.mouth} cx="50" cy="65" rx="4.6" ry="3.8" fill="#6B1E0C" /></g>
          <g className={`${styles.v} ${styles.grin}`}><path d="M41 62 Q50 74 59 62 Z" fill="#6B1E0C" /></g>
          <g className={`${styles.v} ${styles.flat}`}><path d="M44 66 Q47 63.5 50 66 T56 66" stroke="#15171C" strokeWidth="2.4" strokeLinecap="round" fill="none" /></g>
        </g>
        <ellipse cx="36" cy="91.5" rx="8" ry="3.6" fill="#D85F25" /><ellipse cx="64" cy="91.5" rx="8" ry="3.6" fill="#D85F25" />
        <g className={`${styles.v} ${styles.think}`}>
          <circle className={`${styles.td} ${styles.td1}`} cx="77" cy="20" r="2.6" fill="#8A92A0" />
          <circle className={`${styles.td} ${styles.td2}`} cx="85" cy="13" r="3.4" fill="#8A92A0" />
          <circle className={`${styles.td} ${styles.td3}`} cx="94" cy="5" r="4.2" fill="#8A92A0" />
        </g>
        <g className={`${styles.v} ${styles.spark}`}>
          <path d="M12 18 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" fill="#E8A317" />
          <path d="M88 30 l1.5 3.8 l3.8 1.5 l-3.8 1.5 l-1.5 3.8 l-1.5 -3.8 l-3.8 -1.5 l3.8 -1.5 z" fill="#E8A317" />
          <path d="M78 2 l1.2 3 l3 1.2 l-3 1.2 l-1.2 3 l-1.2 -3 l-3 -1.2 l3 -1.2 z" fill="#3BAA6C" />
        </g>
        <g className={`${styles.v} ${styles.q}`}><text x="80" y="27" fontFamily="var(--font-display), sans-serif" fontSize="24" fontWeight="800" fill="#D99100">?</text></g>
      </svg>
    </span>
  );
}
