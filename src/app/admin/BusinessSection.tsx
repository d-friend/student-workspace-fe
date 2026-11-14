"use client";

import { useState, type ReactNode } from "react";
import type { Business } from "@/lib/admin";
import { Empty, Failure, Metric, Section, money, percent, useAdmin, when } from "./sections";
import styles from "./admin.module.css";

export function countPercent(count: number, total: number, rate: number | null = total ? count / total : null) {
  return total ? `${count} / ${total} (${percent(rate)})` : "—";
}

export function daysAgo(day: string, today: Date = new Date()) {
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
  const difference = Math.round((Date.parse(`${localDay}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86400000);
  return difference === 0 ? "today" : `${difference}d ago`;
}

export function BusinessSection({ token, days, onGuestOpen, children }: { token: string; days: number; onGuestOpen: (guestId: string) => void; children?: ReactNode }) {
  const { data, error } = useAdmin<Business>("/business", token, days);
  const [filter, setFilter] = useState<"all" | "returning" | "dormant">("all");
  const [limit, setLimit] = useState(100);
  const people = data?.people.filter(person => filter === "all" || person[filter]) ?? [];
  const state = error ? <Failure /> : <p>Loading…</p>;
  const current = data?.scorecard;
  const previous = data?.scorecard_previous;

  return <>
    <Section title="Scorecard">{!current || !previous ? state : <>
      {current.new > 0 && <p className={styles.note}>{current.new_via_link} of {current.new} new people this window arrived through a shared link or sheet.</p>}
      <div className={styles.metrics}>
        <Metric label="Active people" value={current.active} detail={`prev ${previous.active}`} />
        <Metric label="New people" value={current.new} detail={`prev ${previous.new}`} />
        <Metric label="Returning people" value={current.returning} detail={`prev ${previous.returning}`} />
        <Metric label="Start rate" value={countPercent(current.start.sent, current.start.opened, current.start.rate)} detail={`prev ${countPercent(previous.start.sent, previous.start.opened, previous.start.rate)}`} />
        <Metric label="Completed ≥1" value={countPercent(current.completed.persons, current.completed.active, current.completed.rate)} detail={`prev ${countPercent(previous.completed.persons, previous.completed.active, previous.completed.rate)}`} />
        <Metric label="$ per active person" value={money(current.usd_per_active)} detail={`prev ${money(previous.usd_per_active)}`} />
      </div>
    </>}</Section>
    <Section title="How often people come back">{!data ? state : !data.frequency.some(row => row.persons) ? <Empty /> : <div className={styles.bars}>{data.frequency.map(row => <div className={styles.barRow} key={row.bucket}><span>{row.bucket === "3-5" ? "3–5" : row.bucket}</span><div><i style={{ width: `${row.persons / Math.max(1, ...data.frequency.map(item => item.persons)) * 100}%` }} /></div><b>{row.persons}</b></div>)}</div>}</Section>
    <Section title="Weekly cohorts">{!data ? state : data.cohorts.length ? <div className={styles.tableWrap}><table><thead><tr><th>Week</th><th>n</th><th>+1</th><th>+2</th><th>+3</th><th>+4 weeks</th></tr></thead><tbody>{data.cohorts.map(row => <tr key={row.week}><td>{row.week}</td><td>{row.n}</td>{[0, 1, 2, 3].map(index => <td key={index}>{row.weeks[index] ?? "—"}</td>)}</tr>)}</tbody></table></div> : <Empty />}<p className={styles.note}>All time; ignores the date range.</p></Section>
    <Section title="People">
      <div className={styles.days} aria-label="People filter">{(["all", "returning", "dormant"] as const).map(option => <button key={option} type="button" aria-pressed={filter === option} onClick={() => { setFilter(option); setLimit(100); }}>{option}</button>)}</div>
      {!data ? state : people.length ? <><div className={styles.tableWrap}><table><thead><tr><th>Person</th><th>First seen</th><th>Last seen</th><th>Active days (window)</th><th>Active days (all time)</th><th>Sessions</th><th>Problems completed</th><th>USD</th><th>Came from</th></tr></thead><tbody>{people.slice(0, limit).map(person => <tr key={person.person_id}><td><button type="button" className={styles.idButton} onClick={() => onGuestOpen(person.guest_id)}>{person.label ?? "guest"}</button>{(person.school || person.grade !== null) && <div className={styles.personDetail}>{[person.school, person.grade === null ? null : `Grade ${person.grade}`].filter(value => value !== null && value !== "").join(" · ")}</div>}</td><td>{person.first_day}</td><td>{daysAgo(person.last_day)}</td><td>{person.active_days_window}</td><td>{person.active_days_total}</td><td>{person.sessions}</td><td>{person.completions}</td><td>{money(person.usd)}</td><td>{person.came_from}</td></tr>)}</tbody></table></div>{limit < people.length && <button type="button" className={styles.signOut} onClick={() => setLimit(value => value + 100)}>Show more</button>}</> : <Empty />}
    </Section>
    {children}
    <Section title="Shared links">{!data ? state : <>{data.links.length ? <div className={styles.tableWrap}><table><thead><tr><th>Link</th><th>Sharer</th><th>Created</th><th>Opened</th><th>New to D-Friend</th><th>Did something</th><th>Came back</th><th>Started own problem</th></tr></thead><tbody>{data.links.map(link => <tr key={`${link.type}-${link.id}`}><td>{link.type} · {link.id.slice(0, 8)}{link.type === "sheet" && link.title && <> · {link.title}</>}<div><code>{link.path}</code></div></td><td>{link.sharer ?? "—"}</td><td>{when(link.created)}</td><td>{link.opened}</td><td>{countPercent(link.new_to_dfriend, link.opened)}</td><td>{countPercent(link.did_something, link.opened)}</td><td>{countPercent(link.came_back, link.opened)}</td><td>{countPercent(link.started_own, link.opened)}</td></tr>)}</tbody><tfoot><tr><td colSpan={8}>{data.unknown_link_opens} opens with unknown link</td></tr></tfoot></table></div> : <><Empty /><p className={styles.note}>{data.unknown_link_opens} opens with unknown link</p></>}</>}</Section>
  </>;
}
