import { IconPhotoPlus } from "@tabler/icons-react";
import { type ChangeEvent, useRef, useState } from "react";
import { createPack, type Pack } from "@/lib/api";
import { copy } from "@/lib/copy";
import { MAX_PACK_PHOTOS, uploadError } from "@/lib/pack";
import { readPhoto } from "@/lib/photo";
import styles from "./Pack.module.css";

// "Tải vở / sách": photos of notes, up to 10. The page owns the status sheet, so it survives this button moving between layouts.
export function PackUpload({ onUploaded }: { onUploaded: (pack: Pack) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (!files.length) return;
    if (files.length > MAX_PACK_PHOTOS) return setError(copy.packTooMany(MAX_PACK_PHOTOS));
    setBusy(true);
    setError(null);
    try {
      let photos: string[];
      try { photos = (await Promise.all(files.map(readPhoto))).map(p => p.data); } catch { return setError(copy.packUnreadablePhotos); }
      onUploaded(await createPack(photos));
    } catch (err) {
      const { text, unavailable: off } = uploadError(err);
      setError(text);
      setUnavailable(off);
    } finally {
      setBusy(false);
    }
  };

  return <div className={styles.upload}>
    <button type="button" className={styles.uploadButton} disabled={busy || unavailable} onClick={() => input.current?.click()}>
      <IconPhotoPlus size={20} aria-hidden="true" />{busy ? copy.packUploading : copy.packUpload}
    </button>
    <input ref={input} type="file" accept="image/*" multiple hidden aria-label={copy.packUploadHint} onChange={e => void onFiles(e)} />
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
