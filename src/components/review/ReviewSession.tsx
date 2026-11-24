import { useMemo, useRef, useState } from "react";
import { answerReview, type ReviewCard } from "@/lib/api";
import { copy } from "@/lib/copy";
import { reviewWhen } from "@/lib/review";
import { Quiz } from "@/workspace/blocks/Quiz";
import { Md } from "@/workspace/md";
import type { Block, BlockCtx } from "@/workspace/types";
import styles from "./Review.module.css";

export type ReviewSessionProps = {
  cards: ReviewCard[];
  onStartProblem: (card: ReviewCard) => Promise<boolean>; // true when the page is navigating away
  startFailed: boolean;
  onExit: () => void; // "Về môn học"
};

// Today's cards one at a time. A quiz is answered here; a problem hands over to a new session; "Để sau" leaves a card due.
export function ReviewSession({ cards, onStartProblem, startFailed, onExit }: ReviewSessionProps) {
  const [index, setIndex] = useState(0);
  const [next, setNext] = useState<string | null>(null); // the earliest due_at among the cards answered now
  const card = cards[index];
  const advance = () => setIndex(i => i + 1);

  if (!card) {
    const when = next && reviewWhen(next);
    return <section className={styles.end} aria-live="polite">
      <h2 className={styles.endTitle}>{cards.length ? copy.reviewDone(when ?? null) : copy.reviewEmpty}</h2>
      {cards.length > 0 && <p className={styles.sub}>{copy.reviewDoneSub}</p>}
      <button type="button" className={styles.secondary} onClick={onExit}>{copy.reviewBack}</button>
    </section>;
  }
  return <section className={styles.session}>
    <p className={styles.meta}><span>{copy.reviewCount(index + 1, cards.length)}</span><span className={styles.node}>{card.node_name}</span></p>
    {card.kind === "quiz" && card.quiz
      ? <QuizCard key={card.id} card={card} onNext={(dueAt) => { setNext(n => !n || dueAt < n ? dueAt : n); advance(); }} />
      : <ProblemCard key={card.id} card={card} onStart={onStartProblem} startFailed={startFailed} onSkip={advance} />}
  </section>;
}

// The learn doc's quiz block, fed by the card: the answer goes to the review endpoint instead of the doc's check, and the explanation arrives with the verdict.
function QuizCard({ card, onNext }: { card: ReviewCard; onNext: (dueAt: string) => void }) {
  const attempts = useRef(0);
  const [explanation, setExplanation] = useState("");
  const [finished, setFinished] = useState<string | null>(null); // due_at once the card is done
  const quiz = card.quiz!;
  const block = useMemo<Extract<Block, { type: "quiz" }>>(() => ({
    type: "quiz", id: "review", question_md: quiz.question_md, answer: quiz.answer, options: quiz.options ?? undefined, explanation_md: explanation,
  }), [quiz, explanation]);
  const ctx = useMemo<BlockCtx>(() => ({
    workspaceId: card.id, phase: "learn", overrides: {}, hintCount: 0, help: null, onSolved: () => {}, report: () => {},
    check: async (_blockId, answer) => {
      const r = await answerReview(card.id, answer, attempts.current + 1); // a failed call is not an attempt
      attempts.current += 1;
      setExplanation(r.explanation_md);
      // One retry, like a learn doc: a second answer ends the card whatever it was.
      if (r.correct || attempts.current >= 2) setFinished(r.due_at);
      return { ok: r.correct, state: r.correct ? "ok" : "review", done: r.correct };
    },
  }), [card.id]);
  return <>
    <Quiz block={block} ctx={ctx} />
    {finished && <div className={styles.actions}><button type="button" className={styles.primary} autoFocus onClick={() => onNext(finished)}>{copy.reviewNext}</button></div>}
  </>;
}

function ProblemCard({ card, onStart, startFailed, onSkip }: { card: ReviewCard; onStart: (card: ReviewCard) => Promise<boolean>; startFailed: boolean; onSkip: () => void }) {
  const [starting, setStarting] = useState(false);
  const start = async () => {
    setStarting(true);
    if (!(await onStart(card))) setStarting(false);
  };
  return <article className={styles.problem}>
    <div className={styles.prose}><Md text={card.problem?.excerpt_md ?? ""} /></div>
    {startFailed && <p className={styles.error} role="alert">{copy.reviewStartFailed}</p>}
    <div className={styles.actions}>
      <button type="button" className={styles.primary} disabled={starting} onClick={() => void start()}>{copy.reviewSimilar}</button>
      <button type="button" className={styles.secondary} onClick={onSkip}>{copy.reviewSkip}</button>
    </div>
  </article>;
}
