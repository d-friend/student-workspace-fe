import { IconPhotoPlus } from "@tabler/icons-react";
import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import { createPack, type Pack } from "@/lib/api";
import { copy } from "@/lib/copy";
import { MAX_PACK_PHOTOS, uploadError } from "@/lib/pack";
import { readPhoto } from "@/lib/photo";
import styles from "./Pack.module.css";

// "Tải vở / sách" on home, "Cập nhật vở" inside a project (projectId set: the server skips the subject stage). Photos of notes, up to 10.
// The page owns the status sheet, so it survives this button moving between layouts.
// `rowClassName`: the small "Thêm" action in a subject page's side column, named for what it adds.
// `card`: home's upload card, where the whole card is the button. Its content gets `busy` so it can say it is uploading.
export function PackUpload({ onUploaded, projectId, rowClassName, card }: {
  onUploaded: (pack: Pack) => void; projectId?: string; rowClassName?: string;
  card?: { className: string; cellClassName: string; children: (busy: boolean) => ReactNode };
}) {
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
      onUploaded(await createPack(photos, projectId));
    } catch (err) {
      const { text, unavailable: off } = uploadError(err);
      setError(text);
      setUnavailable(off);
    } finally {
      setBusy(false);
    }
  };

  return <div className={card ? card.cellClassName : rowClassName ? undefined : styles.upload} style={rowClassName ? { display: "contents" } : undefined}>
    {card
      ? <button type="button" className={card.className} aria-busy={busy || undefined} disabled={busy || unavailable} onClick={() => input.current?.click()}>{card.children(busy)}</button>
      : rowClassName
      ? <button type="button" className={rowClassName} aria-label={copy.projectAddLabel} disabled={busy || unavailable} onClick={() => input.current?.click()}>
        {busy ? copy.packUploading : copy.projectAdd}
      </button>
      : <button type="button" className={styles.uploadButton} disabled={busy || unavailable} onClick={() => input.current?.click()}>
        <IconPhotoPlus size={20} aria-hidden="true" />{busy ? copy.packUploading : projectId ? copy.projectUpdateNotes : copy.packUpload}
      </button>}
    <input ref={input} type="file" accept="image/*" multiple hidden aria-label={copy.packUploadHint} onChange={e => void onFiles(e)} />
    {error && <p className={styles.error} role="alert">{error}</p>}
  </div>;
}
