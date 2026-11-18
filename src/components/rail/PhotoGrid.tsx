import { copy } from "@/lib/copy";
import { JPEG_PREFIX } from "@/lib/photo";
import styles from "./PhotoGrid.module.css";

export function PhotoGrid({ photos, compact = false }: { photos: string[]; compact?: boolean }) {
  if (!photos.length) return null;
  return (
    <div className={styles.grid} data-multiple={photos.length > 1 || undefined} data-compact={compact || undefined}>
      {photos.map((photo, index) => (
        // eslint-disable-next-line @next/next/no-img-element -- local data URL
        <img key={index} src={JPEG_PREFIX + photo} alt={copy.photoChip} />
      ))}
    </div>
  );
}
