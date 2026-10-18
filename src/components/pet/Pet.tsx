import type { PetMood } from "@/lib/pet";
import styles from "./Pet.module.css";

// PATCH, concept 1 of design-source/pets/pet_v1.html: a folded scratch note clipped to a blue card, held by washi tape.
// celebrateKey is the React key of the body group: bumping it remounts the group so the happy jump replays.
export function Pet({ mood, className, celebrateKey }: { mood: PetMood; className?: string; celebrateKey?: number }) {
  return (
    <span className={`${styles.pet} ${className ?? ""}`} data-state={mood} aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <polygon points="22,94 78,92 84,97 18,98" fill="var(--pet-shadow)" opacity=".12" />
        <g key={celebrateKey} className={styles.body}>
          <polygon points="24,25 80,28 85,87 20,85" fill="#3B4BFF" stroke="#15171C" strokeWidth="2.4" strokeLinejoin="round" />
          <g className={styles.clip}><path d="M45 24 L42 9 C41 4 51 3 52 9 L55 26 C55.5 29 49 30 48.5 26 L47 14" fill="none" stroke="#15171C" strokeWidth="2.6" strokeLinecap="round" /></g>
          <polygon points="16,22 65,18 82,35 77,84 14,81" fill="#FFFDF7" stroke="#15171C" strokeWidth="2.6" strokeLinejoin="round" />
          {/* ruled lines: only while calm (idle, listening, talking), as on the board */}
          <g className={`${styles.v} ${styles.calm}`}>
            <line x1="22" y1="38" x2="56" y2="36" stroke="#E2DEC9" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="21" y1="73" x2="68" y2="75" stroke="#E2DEC9" strokeWidth="1.8" strokeLinecap="round" />
          </g>
          <polygon className={styles.fold} points="65,18 63,36 82,35" fill="#EAE4D3" stroke="#15171C" strokeWidth="2.4" strokeLinejoin="round" />
          <polygon className={styles.tape} points="9,30 34,13 40,21 15,38" fill="#C8F904" stroke="#15171C" strokeWidth="2.2" strokeLinejoin="round" />
          <g className={`${styles.v} ${styles.calm}`}><path d="M22 61 L25 58 M25 62 L28 59 M65 60 L68 57 M68 61 L71 58" stroke="#FF3366" strokeWidth="2" strokeLinecap="round" /></g>
          <g className={`${styles.v} ${styles.open}`}><g className={styles.blink}>
            <rect x="31" y="45" width="7.5" height="12" rx="2" fill="#15171C" transform="rotate(-3 34 51)" />
            <rect x="55" y="44" width="8.5" height="13" rx="2" fill="#15171C" transform="rotate(2 59 50)" />
            <rect x="33" y="47" width="2.5" height="3.5" fill="#FFFDF7" /><rect x="57" y="46" width="2.5" height="3.5" fill="#FFFDF7" />
          </g></g>
          {/* the board's down eyes already sit left of centre: the work is always to the pet's left (spec §4.1) */}
          <g className={`${styles.v} ${styles.down}`}>
            <rect x="29" y="52" width="8" height="8" rx="1.5" fill="#15171C" /><rect x="53" y="52" width="8.5" height="8" rx="1.5" fill="#15171C" />
          </g>
          <g className={`${styles.v} ${styles.up}`}>
            <rect x="35" y="41" width="7.5" height="11" rx="2" fill="#15171C" /><rect x="58" y="40" width="8.5" height="12" rx="2" fill="#15171C" />
            <rect x="38" y="42" width="2.5" height="3.5" fill="#FFFDF7" /><rect x="61" y="41" width="2.5" height="3.5" fill="#FFFDF7" />
          </g>
          <g className={`${styles.v} ${styles.happyEyes}`}>
            <path d="M29 47 L38 51 L29 55" stroke="#15171C" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M64 46 L55 50 L64 54" stroke="#15171C" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </g>
          <g className={`${styles.v} ${styles.doubtEyes}`}>
            <rect x="31" y="47" width="8" height="11" rx="2" fill="#15171C" />
            <line x1="53" y1="53" x2="66" y2="51" stroke="#15171C" strokeWidth="3.4" strokeLinecap="round" />
            <line x1="52" y1="43" x2="67" y2="38" stroke="#3B4BFF" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className={`${styles.v} ${styles.smile}`}><path d="M41 63 L47 67 L55 61" stroke="#15171C" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" fill="none" /></g>
          <g className={`${styles.v} ${styles.o}`}><polygon points="47,62 55,61 54,68 46,67" fill="#15171C" /></g>
          <g className={`${styles.v} ${styles.talk}`}><polygon className={styles.mouth} points="42,61 56,60 54,70 43,69" fill="#FF3366" stroke="#15171C" strokeWidth="2.2" strokeLinejoin="round" /></g>
          <g className={`${styles.v} ${styles.grin}`}><polygon points="37,60 60,59 56,72 40,71" fill="#FF3366" stroke="#15171C" strokeWidth="2.4" strokeLinejoin="round" /></g>
          <g className={`${styles.v} ${styles.flat}`}><path d="M40 66 L46 63 L51 67 L57 64" stroke="#15171C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" /></g>
        </g>
        <g className={`${styles.v} ${styles.think}`}>
          <polygon className={`${styles.td} ${styles.td1}`} points="75,21 81,17 80,24" fill="#3B4BFF" stroke="#15171C" strokeWidth="1.5" />
          <rect className={`${styles.td} ${styles.td2}`} x="83" y="9" width="7" height="7" fill="#C8F904" stroke="#15171C" strokeWidth="1.5" transform="rotate(15 86 12)" />
          <polygon className={`${styles.td} ${styles.td3}`} points="91,1 99,3 95,10" fill="#FF3366" stroke="#15171C" strokeWidth="1.5" />
        </g>
        <g className={`${styles.v} ${styles.spark}`}>
          <g><polygon points="6,22 16,17 13,28" fill="#FF3366" stroke="#15171C" strokeWidth="1.5" /></g>
          <g><rect x="84" y="24" width="9" height="9" fill="#C8F904" stroke="#15171C" strokeWidth="1.5" transform="rotate(20 88 28)" /></g>
          <g><path d="M75 6 L79 11 L88 2" stroke="#3B4BFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></g>
        </g>
        <g className={`${styles.v} ${styles.q}`}><text x="79" y="28" fontFamily="var(--font-display), sans-serif" fontSize="28" fontWeight="800" fill="#FF3366" stroke="#15171C" strokeWidth="1">?</text></g>
      </svg>
    </span>
  );
}
