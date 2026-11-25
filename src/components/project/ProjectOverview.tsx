import { type ChangeEvent, useRef, useState } from "react";
import { PackUpload } from "@/components/pack/PackUpload";
import { Composer } from "@/components/rail/Composer";
import type { ProjectSessions } from "@/hooks/useProjectSessions";
import type { Pack, Project } from "@/lib/api";
import { copy } from "@/lib/copy";
import { JPEG_PREFIX, MAX_PHOTOS, readPhoto } from "@/lib/photo";
import { ProjectSessionList } from "./ProjectSessionList";
import styles from "./Project.module.css";

export type OverviewProps = {
  project: Project;
  sessions: ProjectSessions;
  onOpenSession: (id: string) => void;
  openFailed: boolean;
  // Starts a session in the subject with this problem. Resolves true when the page is navigating, false when it stayed (the composer keeps what was typed).
  onSend: (text: string, photos: string[]) => Promise<boolean>;
  sendError: string | null;
  onUploaded: (pack: Pack) => void; // "Thêm": the page owns the status sheet
  onOpen: (view: "map" | "sources") => void;
  reviewDue: number; // cards waiting for a review; the muted line is hidden at 0
  onReview: () => void;
  reviewFailed: boolean;
};

// What a student does in a subject, in the order they need it: start a session, upload notes or open the map, then pick up an old session.
// On a phone the DOM order is the visual order, so the side rows sit above the history; from 800px a grid puts them beside it.
export function ProjectOverview({ project, sessions, onOpenSession, openFailed, onSend, sendError, onUploaded, onOpen, reviewDue, onReview, reviewFailed }: OverviewProps) {
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]); // base64 JPEGs, as the chat holds them
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const notePhotos = project.packs.reduce((sum, pack) => sum + (pack.photos ?? 0), 0);
  const nodes = project.map.length;

  // The same rules as home: up to MAX_PHOTOS, each downscaled to a JPEG; one that cannot be read is skipped with a note.
  const addPhotos = async (picked: File[]) => {
    let next = photos;
    for (const file of picked) {
      if (next.length >= MAX_PHOTOS) { setNote(copy.photoLimit(MAX_PHOTOS)); return; }
      try {
        next = [...next, (await readPhoto(file)).data];
        setPhotos(next);
        setNote(null);
      } catch {
        setNote(copy.photoUnreadable);
      }
    }
  };
  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const picked = Array.from(input.files ?? []);
    input.value = "";
    void addPhotos(picked);
  };
  const send = async () => {
    const problem = text.trim();
    if (sending || (!problem && photos.length === 0)) return;
    setSending(true);
    if (!(await onSend(problem, photos))) setSending(false);
  };

  return <div className={styles.overview}>
    <section className={styles.areaCompose} aria-label={copy.projectPlaceholder(project.name)}>
      <div className={styles.compose}>
        <Composer value={text} onChange={setText} onSend={() => void send()} sendDisabled={sending}
          placeholder={copy.projectPlaceholder(project.name)}
          onPickPhoto={() => files.current?.click()} onSnapPhoto={() => camera.current?.click()}
          photos={photos.map((data, index) => ({ src: JPEG_PREFIX + data, onRemove: () => { setPhotos(photos.filter((_, i) => i !== index)); setNote(null); } }))} />
      </div>
      {(note ?? sendError) && <p className={styles.error} role="alert">{note ?? sendError}</p>}
      <input ref={files} type="file" accept="image/*" multiple hidden onChange={onFiles} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
    </section>

    <div className={styles.areaSide}>
      <div className={styles.sideItem}>
        {notePhotos > 0
          ? <button type="button" className={styles.sideMain} onClick={() => onOpen("sources")}>
            <span><b>{copy.projectNotesRow}</b><i>{copy.projectPhotos(notePhotos)}</i></span>
          </button>
          : <span className={styles.sideMain}><b>{copy.projectNotesRow}</b></span>}
        <PackUpload projectId={project.id} onUploaded={onUploaded} rowClassName={styles.sideAction} />
      </div>
      <div className={styles.sideItem}>
        {nodes > 0
          ? <button type="button" className={styles.sideMain} aria-label={copy.projectViewLabel(copy.projectMapRow)} onClick={() => onOpen("map")}>
            <span><b>{copy.projectMapRow}</b><i>{copy.projectMapItems(nodes)}</i></span><span className={styles.sideLink} aria-hidden="true">{copy.projectView}</span>
          </button>
          : <span className={styles.sideMain}><span><b>{copy.projectMapRow}</b><i>{copy.projectMapNone}</i></span></span>}
      </div>
      {(nodes > 0 || sessions.sessions.length > 0) && <div className={styles.sideItem}>
        <button type="button" className={styles.sideMain} onClick={onReview}>
          <span><b>{copy.reviewProjectButton}</b>{reviewDue > 0 && <i>{copy.reviewProjectDue(reviewDue)}</i>}</span><span className={styles.sideLink} aria-hidden="true">{copy.reviewProjectGo}</span>
        </button>
        {reviewFailed && <p className={styles.error} role="alert">{copy.projectNewFailed}</p>}
      </div>}
    </div>

    <section className={styles.areaRecent}>
      <h2 className={styles.label}>{copy.projectRecent}</h2>
      <ProjectSessionList sessions={sessions} onOpen={onOpenSession} openFailed={openFailed} />
    </section>
  </div>;
}
