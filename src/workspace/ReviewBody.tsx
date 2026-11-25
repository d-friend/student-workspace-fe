import { IconArrowDown, IconArrowRight, IconArrowUp, IconCheck, IconNotes, IconRepeat } from "@tabler/icons-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { usePetAnchorRef } from "@/components/pet/PetAnchor";
import { listProjects, listSessions } from "@/lib/api";
import { reviewUrl, examWhen } from "@/lib/review";
import { track } from "@/lib/track";
import { renderBlock } from "./blocks";
import { Md, MdInline } from "./md";
import { useCopy } from "./WorkspaceCopy";
import type { Block, BlockCtx, Workspace } from "./types";
import styles from "./ReviewBody.module.css";

type Doc = { id: string; text: string };
type Section = "notes" | "test" | "practice";
type Practice = Extract<Block, { type: "practice" }>;
type Quiz = Extract<Block, { type: "quiz" }>;
type Callout = Extract<Block, { type: "callout" }>;

// The subject the session is filed in, read lazily: the notes link and the end card's buttons need it.
function useSubject(sessionId: string | null | undefined, enabled: boolean) {
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!enabled || !sessionId) return;
    let active = true;
    (async () => {
      const mine = (await listSessions(undefined, 50)).sessions.find(s => s.id === sessionId);
      if (!mine?.project_id) return;
      const name = (await listProjects()).find(p => p.id === mine.project_id)?.name;
      if (active && name) setSubject({ id: mine.project_id, name });
    })().catch(() => {});
    return () => { active = false; };
  }, [sessionId, enabled]);
  return subject;
}

function Seg({ id, label, count, active, onPick }: { id: Section; label: string; count?: string; active: boolean; onPick: (id: Section) => void }) {
  return <button type="button" className={styles.seg} aria-current={active ? "true" : undefined} onClick={() => onPick(id)}>
    <span>{label}</span>{count && <span className={styles.count}>{count}</span>}
  </button>;
}

const prefersReducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ReviewBody({ w, ctx, tabs, taskDone, hidden, busy, onActive, onLeave }: {
  w: Workspace;
  ctx: BlockCtx;
  tabs: Workspace[];
  taskDone: Record<string, string[]>; // master completions by workspace id (a practice tab's, live)
  hidden: boolean;
  busy: boolean;
  onActive: (id: string) => void;
  onLeave?: (url: string) => void; // end this session and go there
}) {
  const copy = useCopy();
  const blocks = w.doc.blocks;
  const quizzes = blocks.filter((b): b is Quiz => b.type === "quiz");
  const practices = blocks.filter((b): b is Practice => b.type === "practice");
  const lessons = useMemo(() => {
    const out: { heading: Doc; note?: Callout; mistake?: Callout }[] = [];
    for (const b of blocks) {
      if (b.type === "heading") out.push({ heading: { id: b.id, text: b.text } });
      else if (b.type === "callout" && out.length) out[out.length - 1][b.tone === "mistake" ? "mistake" : "note"] ??= b;
    }
    return out;
  }, [blocks]);
  const lessonName = (id?: string | null) => lessons.find(l => l.heading.id === id)?.heading.text ?? "";

  const sections = useRef<Record<Section, HTMLElement | null>>({ notes: null, test: null, practice: null });
  const [active, setActive] = useState<Section>("notes");
  const [flash, setFlash] = useState<string | null>(null);
  const goto = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });

  // The section under the top of the page is the one the bar underlines.
  useEffect(() => {
    if (hidden || typeof IntersectionObserver === "undefined") return;
    const seen = new Map<Section, number>();
    const order: Section[] = ["notes", "test", "practice"];
    const io = new IntersectionObserver(entries => {
      for (const e of entries) seen.set(e.target.getAttribute("data-section") as Section, e.isIntersecting ? e.intersectionRatio : 0);
      const current = order.findLast(s => (seen.get(s) ?? 0) > 0 && (s === "notes" || (sections.current[s]?.getBoundingClientRect().top ?? 1) < window.innerHeight * 0.6));
      if (current) setActive(current);
    }, { rootMargin: "-20% 0px -40% 0px", threshold: [0, 0.01, 0.5] });
    for (const el of Object.values(sections.current)) if (el) io.observe(el);
    return () => io.disconnect();
  }, [hidden]);

  // Quiz progress comes from what Quiz.tsx saves: finished is correct, or a second try.
  const stateOf = (id: string) => { const s = ctx.state?.blocks?.[id]; return s?.type === "quiz" ? s : null; };
  const finished = quizzes.filter(q => stateOf(q.id)?.done);
  const firstTry = finished.filter(q => { const s = stateOf(q.id); return s?.tries === 1 && s.answered?.ok === true; });
  const kept = finished.length - firstTry.length;

  const skipped = (id: string) => { const s = ctx.state?.blocks?.[id]; return s?.type === "practice" && s.skipped; };
  const practiceTab = (id: string) => tabs.find(t => t.parent_workspace_id === w.id && t.doc.from_block === id);
  const practiceDone = (id: string) => {
    const tab = practiceTab(id);
    if (!tab) return false;
    const steps = Object.values(tab.state?.blocks ?? {}).some(b => b.type === "steps" && b.done);
    return steps || (tab.state?.taskDone?.length ?? 0) > 0 || (taskDone[tab.id]?.length ?? 0) > 0;
  };
  const practiceSettled = practices.filter(p => practiceDone(p.id) || skipped(p.id)).length;
  const practiceDoneCount = practices.filter(p => practiceDone(p.id)).length;
  const ended = quizzes.length > 0 && finished.length === quizzes.length && practiceSettled === practices.length;

  const needsSubject = lessons.some(l => l.note?.source_block) || ended;
  const subject = useSubject(ctx.sessionId, needsSubject && !hidden);

  // The event leaves after a short delay, so a second tap must not send another. Once the turn is over and no tab came, the card can ask again.
  const [requested, setRequested] = useState<string[]>([]);
  useEffect(() => {
    if (busy || requested.length === 0) return;
    const timer = setTimeout(() => setRequested([]), 4000);
    return () => clearTimeout(timer);
  }, [busy, requested]);
  const request = (id: string) => {
    if (requested.includes(id)) return;
    setRequested([...requested, id]);
    ctx.report("practice_requested", { block_id: id });
  };

  const reported = useRef(ended && !!w.restored);
  useEffect(() => {
    if (!ended || reported.current) return;
    reported.current = true;
    track("review_finished", { workspace_id: w.id, correct: firstTry.length, total: quizzes.length, kept_cards: kept, practices_done: practiceDoneCount }, ctx.sessionId ?? undefined);
  }, [ended, w.id, firstTry.length, quizzes.length, kept, practiceDoneCount, ctx.sessionId]);
  const endAnchor = usePetAnchorRef(ended && !hidden);

  const exam = w.doc.exam_on ? examWhen(w.doc.exam_on) : null;
  const jump = (id: string) => {
    const el = document.getElementById(`${w.id}-${id}`);
    goto(el);
    setFlash(id);
    setTimeout(() => setFlash(null), 1600);
  };
  const quizCtx: BlockCtx = {
    ...ctx,
    afterQuiz: (blockId, result) => {
      const q = quizzes.find(x => x.id === blockId);
      const wrong = result.tries >= 2 || result.ok === false;
      const lesson = q?.lesson && lessons.find(l => l.heading.id === q.lesson);
      return wrong && lesson ? <button type="button" className={styles.seeAgain} onClick={() => jump(lesson.heading.id)}>
        <IconArrowUp size={18} aria-hidden="true" />{copy.reviewSeeAgain(lesson.heading.text)}
      </button> : null;
    },
  };
  const pick = (id: Section) => { setActive(id); goto(sections.current[id]); };

  return <div className={styles.root}>
    {exam && <p className={styles.exam}>{copy.reviewExam(exam)}</p>}
    <nav className={styles.bar} aria-label={copy.reviewSegments}>
      <Seg id="notes" label={copy.reviewSegNotes} active={active === "notes"} onPick={pick} />
      <Seg id="test" label={copy.reviewSegTest} count={`${finished.length}/${quizzes.length}`} active={active === "test"} onPick={pick} />
      {practices.length > 0 && <Seg id="practice" label={copy.reviewSegPractice} count={`${practiceSettled}/${practices.length}`} active={active === "practice"} onPick={pick} />}
    </nav>

    <section ref={el => { sections.current.notes = el; }} data-section="notes" className={styles.section} aria-labelledby={`${w.id}-notes-h`}>
      <h2 id={`${w.id}-notes-h`} className={styles.sectionTitle}>{copy.reviewSegNotes}</h2>
      {lessons.map(l => <div key={l.heading.id} id={`${w.id}-${l.heading.id}`} className={styles.lesson} data-flash={flash === l.heading.id || undefined}>
        <h3 className={styles.lessonName}><MdInline text={l.heading.text} /></h3>
        {l.note && <article className={styles.note}>
          <div className={styles.prose}><Md text={l.note.md} /></div>
          {l.note.source_block && subject && <a className={styles.inNotes} href={`/projects/${subject.id}?${new URLSearchParams({ tab: "sources", block: l.note.source_block })}`}>
            {copy.reviewInNotes}<IconArrowRight size={16} aria-hidden="true" />
          </a>}
        </article>}
        {l.mistake && <article className={styles.mistake}>
          <p className={styles.mistakeLabel}><IconRepeat size={18} stroke={2} aria-hidden="true" />{copy.reviewMistake}</p>
          <div className={styles.prose}><Md text={l.mistake.md} /></div>
        </article>}
      </div>)}
      <button type="button" className={styles.primary} onClick={() => pick("test")}>
        {copy.reviewStartTest}<IconArrowDown size={18} aria-hidden="true" />
      </button>
    </section>

    <section ref={el => { sections.current.test = el; }} data-section="test" className={styles.section} aria-labelledby={`${w.id}-test-h`}>
      <h2 id={`${w.id}-test-h`} className={styles.sectionTitle}>{copy.reviewSegTest}</h2>
      {quizzes.map((q, i) => <div key={q.id} className={styles.quiz}>
        <p className={styles.quizLabel}>{copy.reviewQuestion(i + 1, lessonName(q.lesson))}</p>
        {renderBlock(q, quizCtx)}
      </div>)}
    </section>

    {practices.length > 0 && <section ref={el => { sections.current.practice = el; }} data-section="practice" className={styles.section} aria-labelledby={`${w.id}-practice-h`}>
      <h2 id={`${w.id}-practice-h`} className={styles.sectionTitle}>{copy.reviewSegPractice}</h2>
      {practices.map((p, i) => {
        const tab = practiceTab(p.id);
        const done = practiceDone(p.id);
        const later = !done && skipped(p.id);
        return <article key={p.id} className={styles.practice} data-state={done ? "done" : later ? "later" : undefined}>
          <header className={styles.practiceHead}>
            <h3 className={styles.practiceTitle}>{copy.reviewPracticeTitle(i + 1, p.title)}</h3>
            {done && <span className={styles.badgeOk}><IconCheck size={16} stroke={2} aria-hidden="true" />{copy.reviewDoneBadge}</span>}
            {later && <span className={styles.badgeMuted}>{copy.reviewLaterBadge}</span>}
          </header>
          <div className={styles.prose}><Md text={p.md} /></div>
          <div className={styles.actions}>
            {tab
              ? <button type="button" className={done ? styles.secondary : styles.primary} onClick={() => onActive(tab.id)}>
                {done ? copy.workspaceOpen : copy.reviewPracticeContinue}{!done && <IconArrowRight size={18} aria-hidden="true" />}
              </button>
              : <button type="button" className={styles.primary} disabled={requested.includes(p.id)} onClick={() => request(p.id)}>
                {copy.reviewPractice}<IconArrowRight size={18} aria-hidden="true" />
              </button>}
            {!tab && !later && <button type="button" className={styles.text} onClick={() => ctx.saveBlock?.(p.id, { type: "practice", skipped: true })}>{copy.reviewLater}</button>}
          </div>
        </article>;
      })}
    </section>}

    {ended && <Fragment>
      <div className={styles.end} role="status">
        <div className={styles.endHead}>
          <IconNotes size={22} stroke={2} aria-hidden="true" />
          <b>{copy.reviewEnd(firstTry.length, quizzes.length)}</b>
        </div>
        <p className={styles.endText}>{kept > 0 ? copy.reviewKept(kept, copy.reviewTomorrow) : copy.reviewSolid}</p>
        <div className={styles.endButtons}>
          <button type="button" className={styles.primary} onClick={() => onLeave?.(reviewUrl(subject ? copy.reviewMoreMessage(subject.name) : copy.reviewHomeMessage, "review", subject?.id))}>
            {copy.reviewMore}<IconArrowRight size={18} aria-hidden="true" />
          </button>
          {subject && <button type="button" className={styles.secondary} onClick={() => onLeave?.(`/projects/${subject.id}`)}>{copy.reviewBackTo(subject.name)}</button>}
        </div>
      </div>
      <div ref={endAnchor} data-pet-anchor data-pet-done data-pet-inline className={styles.pet}>
        <div data-pet-slot />
        <div data-pet-spoken-slot />
      </div>
    </Fragment>}
  </div>;
}
