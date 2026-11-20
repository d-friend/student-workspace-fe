import { type KeyboardEvent, type Ref, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { IconCamera, IconPhoto, IconPlus, IconX } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import { MAX_PHOTOS } from "@/lib/photo";
import { useDesktop } from "@/hooks/useDesktop";
import styles from "./Composer.module.css";

export type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onPickPhoto: () => void;
  // Opens the camera directly; shown below the desktop breakpoint, where the OS picker may not offer it.
  onSnapPhoto?: () => void;
  placeholder: string;
  sendDisabled?: boolean;
  photos?: { src: string; onRemove: () => void }[];
  // The page uses it to focus the field (after a failed send, a correction, or a removed photo).
  inputRef?: Ref<HTMLTextAreaElement>;
};

const MIN_HEIGHT = 44;
const MAX_HEIGHT = 140;

function PhotoPicker({ onPickPhoto, onSnapPhoto }: Pick<ComposerProps, "onPickPhoto" | "onSnapPhoto">) {
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const desktop = useDesktop();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div
      className={styles.picker}
      ref={picker}
      onBlur={(e) => {
        // Safari/iOS don't focus a tapped button, so tapping a menu item blurs with no relatedTarget;
        // closing then would unmount the item before its click fires. Outside taps close via pointerdown.
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (!open || e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={copy.addPhoto}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={styles.add}
        onClick={(e) => {
          e.currentTarget.focus();
          setOpen(!open);
        }}
      >
        <IconPlus size={20} aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} className={styles.photoMenu}>
          {!desktop && onSnapPhoto && (
            <button type="button" onClick={() => { close(); onSnapPhoto(); }}>
              <IconCamera size={20} aria-hidden="true" />{copy.snapPhoto}
            </button>
          )}
          <button type="button" onClick={() => { close(); onPickPhoto(); }}>
            <IconPhoto size={20} aria-hidden="true" />{copy.pickPhoto}
          </button>
        </div>
      )}
    </div>
  );
}

export function Composer({
  value,
  onChange,
  onSend,
  onPickPhoto,
  onSnapPhoto,
  placeholder,
  sendDisabled = false,
  photos = [],
  inputRef,
}: ComposerProps) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useImperativeHandle(inputRef, () => field.current as HTMLTextAreaElement);

  // Grow with the text, between 44 and 140px.
  // An empty field stays one line: a long placeholder would otherwise wrap and grow it.
  const hasPhotos = photos.length > 0;
  const canAddPhoto = photos.length < MAX_PHOTOS;
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    const natural = value === "" ? MIN_HEIGHT : el.scrollHeight;
    el.style.height = `${Math.min(Math.max(natural, MIN_HEIGHT), MAX_HEIGHT)}px`;
    el.style.overflowY = natural > MAX_HEIGHT ? "auto" : "hidden";
    el.style.scrollbarWidth = natural > MAX_HEIGHT ? "auto" : "none";
  }, [value, canAddPhoto]);

  // Enter sends; Shift+Enter is a newline; Enter that finishes an IME composition does nothing.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!sendDisabled) onSend();
  };

  return (
    <form
      className={styles.composer}
      onSubmit={(e) => {
        e.preventDefault();
        if (!sendDisabled) onSend();
      }}
    >
      {hasPhotos && (
        <div className={styles.tray}>
          {photos.map(({ src, onRemove }, i) => (
            <div key={i} className={styles.thumb}>
              <button
                type="button"
                aria-haspopup="dialog"
                className={styles.preview}
                onClick={(e) => {
                  e.currentTarget.focus();
                  setPreview(src);
                  dialog.current?.showModal();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                <img src={src} alt={copy.photoChip} />
              </button>
              <button type="button" className={styles.remove} aria-label={copy.removePhoto} onClick={onRemove}>
                <span><IconX size={14} aria-hidden="true" /></span>
              </button>
            </div>
          ))}
        </div>
      )}
      <label htmlFor={id} className={hasPhotos ? styles.noteLabel : styles.srOnly}>
        {hasPhotos ? copy.noteLabel : copy.inputLabel}
      </label>
      <div className={styles.row}>
        <textarea
          id={id}
          ref={field}
          rows={1}
          value={value}
          placeholder={placeholder}
          className={styles.field}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {canAddPhoto && (
          <PhotoPicker onPickPhoto={onPickPhoto} onSnapPhoto={onSnapPhoto} />
        )}
        <button type="submit" className={styles.send} disabled={sendDisabled}>
          {copy.send}
        </button>
      </div>
      <dialog
        ref={dialog}
        className={styles.lightbox}
        aria-label={copy.photoChip}
        onClose={() => setPreview(null)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          e.stopPropagation();
          dialog.current?.close();
        }}
      >
        <button type="button" className={styles.closePreview} aria-label={copy.drawerClose} onClick={() => dialog.current?.close()}>
          <IconX size={24} aria-hidden="true" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
        {preview && <img src={preview} alt={copy.photoChip} />}
      </dialog>
    </form>
  );
}
