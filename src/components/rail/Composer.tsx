import { type KeyboardEvent, type Ref, useId, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { IconCamera } from "@tabler/icons-react";
import { copy } from "@/lib/copy";
import { PhotoChip } from "./PhotoChip";
import styles from "./Composer.module.css";

export type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onPickPhoto: () => void;
  placeholder: string;
  sendDisabled?: boolean;
  // With a photo attached, the chip shows, the note label is visible, and the camera button hides.
  photo?: { src: string; onRemove: () => void } | null;
  // The page uses it to focus the field (after a failed send, a correction, or a removed photo).
  inputRef?: Ref<HTMLTextAreaElement>;
  // The entry's pill: same form, own look.
  entry?: boolean;
};

const MIN_HEIGHT = 44;
const MAX_HEIGHT = 140;

export function Composer({
  value,
  onChange,
  onSend,
  onPickPhoto,
  placeholder,
  sendDisabled = false,
  photo,
  inputRef,
  entry = false,
}: ComposerProps) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(inputRef, () => field.current as HTMLTextAreaElement);

  // Grow with the text, between 44 and 140px.
  // An empty field stays one line: a long placeholder would otherwise wrap and grow it.
  const hasPhoto = Boolean(photo);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    const natural = value === "" && !hasPhoto ? MIN_HEIGHT : el.scrollHeight;
    el.style.height = `${Math.min(Math.max(natural, MIN_HEIGHT), MAX_HEIGHT)}px`;
  }, [value, hasPhoto]);

  // Enter sends; Shift+Enter is a newline; Enter that finishes an IME composition does nothing.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (!sendDisabled) onSend();
  };

  return (
    <form
      className={`${styles.composer} ${entry ? styles.entry : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!sendDisabled) onSend();
      }}
    >
      {photo && <PhotoChip src={photo.src} onRemove={photo.onRemove} />}
      <label htmlFor={id} className={photo ? styles.noteLabel : styles.srOnly}>
        {photo ? copy.noteLabel : copy.inputLabel}
      </label>
      <div className={styles.row}>
        <textarea
          id={id}
          ref={field}
          rows={photo ? 2 : 1}
          value={value}
          placeholder={placeholder}
          className={styles.field}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {!photo && (
          <button type="button" aria-label={copy.pickPhoto} className={styles.camera} onClick={onPickPhoto}>
            <IconCamera size={20} aria-hidden="true" />
          </button>
        )}
        <button type="submit" className={styles.send} disabled={sendDisabled}>
          {copy.send}
        </button>
      </div>
    </form>
  );
}
