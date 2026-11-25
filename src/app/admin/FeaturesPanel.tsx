"use client";

import type { FeaturePanel } from "@/lib/admin";
import { Empty, Failure, Section, useAdmin } from "./sections";
import { countPercent } from "./BusinessSection";
import styles from "./admin.module.css";

type Step = [label: string, n: number, of?: number];

function Feature({ title, steps, reuse, note }: { title: string; steps: Step[]; reuse?: Step; note?: string }) {
  return <div className={styles.feature}>
    <h3>{title}</h3>
    <ul>{steps.map(([label, n, of]) => <li key={label}><span>{label}</span><b>{of === undefined ? n : countPercent(n, of)}</b></li>)}</ul>
    {reuse && <p className={styles.reuse}><span>{reuse[0]}</span> <b>{reuse[2] === undefined ? reuse[1] : countPercent(reuse[1], reuse[2])}</b></p>}
    {note && <small>{note}</small>}
  </div>;
}

const label = (value: string) => value.replaceAll("_", " ");

export function FeaturesPanel({ token, days }: { token: string; days: number }) {
  const { data, error } = useAdmin<FeaturePanel>("/business/features", token, days);
  if (error) return <Section title="Features"><Failure /></Section>;
  if (!data) return <Section title="Features"><p>Loading…</p></Section>;
  const { subjects, notes, review, home, learner } = data;
  const any = subjects.opened + notes.uploaded + review.started + review.answered + home.empty_state + learner.replies > 0;
  return <Section title="Features">{!any ? <Empty /> : <>
    <div className={styles.features}>
      <Feature title="Subjects" steps={[["Opened a subject", subjects.opened], ...subjects.tabs.map((row): Step => [`Viewed ${row.tab}`, row.persons, subjects.opened])]}
        reuse={["Opened the same subject on 2+ days", subjects.reused, subjects.opened]} />
      <Feature title="Notes upload" steps={[["Uploaded", notes.uploaded], ["Read", notes.extracted, notes.uploaded], ["Merged into the map", notes.merged, notes.extracted], ["Failed", notes.failed, notes.uploaded],
        ...notes.retries.map((row): Step => [`Retried at ${row.stage}`, row.persons])]}
        reuse={["Opened it again on a later day", notes.reused, notes.uploaded]} />
      <Feature title="Review" steps={[["Started", review.started], ...review.by_via.map((row): Step => [`via ${label(row.via)}`, row.persons, review.started]), ["Built", review.built, review.started], ["Finished", review.finished, review.built], ["Answered a card", review.answered]]}
        reuse={["Answered a card on a later day than it was made", review.reused_v1, review.answered]}
        note={`Home chip starts with a test date: ${countPercent(review.home_chip_with_exam, review.home_chip)}`} />
      <Feature title="Home" steps={[["Saw the empty home", home.empty_state], ...home.doors.map((row): Step => [`${label(row.door)} (${row.sessions} sessions)`, row.persons, home.empty_state]), ["Picked up an old session from the home card", home.old_session.from_home_card], ["…from the history list", home.old_session.from_history_list],
        ...(home.old_session.unsplit ? [["…on days before the split, either", home.old_session.unsplit] as Step] : [])]}
        note={home.old_session.unsplit ? "Before the home card tap was recorded, the two doors can't be told apart." : undefined} />
      <Feature title="Learner signals" steps={[["Master replies with an observation", learner.observed, learner.replies], ["People with signals", learner.persons_with_signals], ["…with a ready tier", learner.persons_ready, learner.persons_with_signals],
        ...learner.transitions.map((row): Step => [`${row.from} → ${row.to} (${row.why})`, row.persons])]} />
    </div>
    <p className={styles.note}>Each row counts people once in the date range, unless it says replies or sessions. n / d is out of the step the row builds on. A good sign is a high reuse line: people who came back to the feature on another day.</p>
  </>}</Section>;
}
