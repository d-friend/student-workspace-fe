import { PackList } from "@/components/pack/PackList";
import { PanelActions } from "@/components/Shell";
import { Bone } from "@/components/Skeleton";
import { useDesktop } from "@/hooks/useDesktop";
import type { PackSummary } from "@/lib/api";
import { copy } from "@/lib/copy";
import styles from "./Project.module.css";

// The recent sessions as the list draws them: one bordered card of rows.
export function SessionRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className={styles.list}>
    {Array.from({ length: rows }, (_, i) => <div key={i} className={styles.row} data-skeleton>
      <Bone w={i % 2 ? "55%" : "70%"} h={18} />
      <Bone w={72} h={14} />
    </div>)}
  </div>;
}

// The subject page before its project is there: the same bar, composer card, three side rows and recent list as ProjectView, in grey.
export function ProjectSkeleton() {
  const desktop = useDesktop();
  const bar = <div className={styles.barTitle}><Bone w={desktop ? 120 : 96} h={desktop ? 31 : 25} /></div>;
  const body = <div className={styles.body} data-screen="overview">
    {!desktop && <p className={styles.summary}><Bone w={110} h={18} /></p>}
    <div className={styles.overview}>
      <section className={styles.areaCompose}>
        <div className={styles.compose}><Bone className={styles.composeSkeleton} /></div>
      </section>
      <div className={styles.areaSide}>
        {[0, 1, 2].map(i => <div key={i} className={styles.sideItem}>
          <span className={styles.sideMain}><span><Bone w={[96, 72, 124][i]} h={16} /></span><Bone w={36} h={14} /></span>
        </div>)}
      </div>
      <section className={styles.areaRecent}>
        <h2 className={styles.label}>{copy.projectRecent}</h2>
        <SessionRowsSkeleton />
      </section>
    </div>
  </div>;
  if (desktop) return <div className={styles.panel} data-shell-panel><PanelActions flush>{bar}</PanelActions>{body}</div>;
  return <div className={styles.page}><div className={styles.topBand}>{bar}</div>{body}</div>;
}

// The notes reader before its pages are there: the uploaded packs (already known) above one photo beside its text.
export function ReaderSkeleton({ packs }: { packs: PackSummary[] }) {
  return <div className={styles.reader}>
    <PackList packs={packs} />
    <section className={styles.sheet}>
      <Bone className={styles.photoSkeleton} />
      <div className={styles.blocks}>
        <Bone w="45%" h={22} />
        {[0, 1, 2, 3].map(i => <Bone key={i} w={i === 3 ? "60%" : "100%"} h={18} />)}
      </div>
    </section>
  </div>;
}
