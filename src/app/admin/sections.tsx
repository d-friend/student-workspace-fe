"use client";

import { useEffect, useState } from "react";
import { adminGet, type Cost, type Health, type Latency, type Pct, type Thesis, type Users } from "@/lib/admin";
import styles from "./admin.module.css";

type Props = { token: string; days: number; onGuestOpen?: (guestId: string) => void };
type Loadable<T> = { data: T | null; error: boolean };

function useAdmin<T>(path: string, token: string, days: number): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ data: null, error: false });
  useEffect(() => {
    let current = true;
    queueMicrotask(() => current && setState({ data: null, error: false }));
    void adminGet<T>(`${path}?days=${days}`, token).then(
      (data) => current && setState({ data, error: false }),
      () => current && setState({ data: null, error: true }),
    );
    return () => { current = false; };
  }, [path, token, days]);
  return state;
}

const money = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: value < 1 ? 4 : 2, maximumFractionDigits: value < 1 ? 4 : 2 }).format(value);
const percent = (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%`;
const ms = (value: number | null) => value === null ? "—" : `${Math.round(value)} ms`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={styles.section}><h2>{title}</h2>{children}</section>;
}
function Failure() { return <p className={styles.error} role="alert">Could not load this section.</p>; }
function Empty() { return <p className={styles.empty}>No data yet.</p>; }
function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
function BarList({ rows, value }: { rows: { day: string; n: number }[]; value: (row: { day: string; n: number }) => number }) {
  const max = Math.max(1, ...rows.map(value));
  return <div className={styles.bars}>{rows.map((row) => <div className={styles.barRow} key={row.day}><span>{row.day}</span><div><i style={{ width: `${(value(row) / max) * 100}%` }} /></div><b>{value(row)}</b></div>)}</div>;
}
function Percentiles({ label, value }: { label: string; value: Pct }) {
  return <Metric label={label} value={value.n ? `${ms(value.p50)} / ${ms(value.p90)}` : "—"} detail={value.n ? `${value.n} measured` : undefined} />;
}

export function HealthSection({ token, days }: Props) {
  const { data, error } = useAdmin<Health>("/health", token, days);
  return <Section title="Health">{error ? <Failure /> : !data ? <p>Loading…</p> : <><div className={styles.metrics}><Metric label="Turns today" value={`${data.turns_today} / ${data.daily_turn_budget}`} detail="UTC day" /><Metric label="Error rate" value={data.turns ? percent(data.failed / data.turns) : "—"} /><Metric label="Planner errors" value={data.planner_errors} /></div>{data.turns === 0 && data.errors_by_code.length === 0 && data.client_turn_failed.length === 0 ? <Empty /> : <div className={styles.codeLists}><div><h3>Top error codes</h3>{data.errors_by_code.map((item) => <p key={item.code}>{item.code} <b>{item.n}</b></p>)}</div><div><h3>Client turn_failed</h3>{data.client_turn_failed.map((item) => <p key={item.code}>{item.code} <b>{item.n}</b></p>)}</div></div>}</>}</Section>;
}

export function CostSection({ token, days }: Props) {
  const { data, error } = useAdmin<Cost>("/cost", token, days);
  return <Section title="Cost">{error ? <Failure /> : !data ? <p>Loading…</p> : <>{data.unpriced_models.length > 0 && <p className={styles.notice}>Partial: no price for {data.unpriced_models.join(", ")}</p>}<div className={styles.metrics}><Metric label="Total" value={money(data.total_usd)} /><Metric label="$ per active guest-day" value={money(data.per_active_guest_day_usd)} /><Metric label="$ per completed problem" value={money(data.per_completed_problem_usd)} /><Metric label="Cache-read ratio" value={percent(data.cache_read_ratio)} /><Metric label="Searches" value={data.searches} /></div>{data.per_day.length ? <div className={styles.bars}>{data.per_day.map((row) => <div className={styles.barRow} key={row.day}><span>{row.day}</span><div><i style={{ width: `${(row.usd / Math.max(...data.per_day.map((item) => item.usd), 1)) * 100}%` }} /></div><b>{money(row.usd)}</b></div>)}</div> : <Empty />}<div className={styles.tableWrap}><table><thead><tr><th>Role</th><th>Model</th><th>Calls</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cache write</th><th>USD</th></tr></thead><tbody>{data.by_role_model.map((row, index) => <tr key={`${row.role}-${row.model}-${index}`}><td>{row.role}</td><td>{row.model ?? "—"}</td><td>{row.calls}</td><td>{row.input_tokens}</td><td>{row.output_tokens}</td><td>{row.cache_read_tokens}</td><td>{row.cache_write_tokens}</td><td>{money(row.usd)}</td></tr>)}</tbody></table></div></>}</Section>;
}

export function LatencySection({ token, days, onGuestOpen }: Props) {
  const { data, error } = useAdmin<Latency>("/latency", token, days);
  return <Section title="Latency">{error ? <Failure /> : !data ? <p>Loading…</p> : <><div className={styles.metrics}><Percentiles label="Master first text" value={data.master_first_text_ms} /><Percentiles label="Master total" value={data.master_total_ms} /><Percentiles label="Planner total" value={data.planner_total_ms} /><Percentiles label="First workspace" value={data.time_to_first_workspace_ms} /><Percentiles label="Workspace shown" value={data.workspace_shown_ms} /></div>{data.slowest.length ? <div className={styles.tableWrap}><table><thead><tr><th>Turn</th><th>Guest</th><th>Total</th><th>Route</th><th>Model</th><th>Result</th></tr></thead><tbody>{data.slowest.map((row) => <tr key={row.turn_id}><td>{row.turn_id}</td><td><button type="button" className={styles.idButton} onClick={() => onGuestOpen?.(row.guest_id)}>{row.guest_id}</button></td><td>{ms(row.total_ms)}</td><td>{row.route ?? "—"}</td><td>{row.model ?? "—"}</td><td>{row.error_code ?? (row.ok === null ? "—" : row.ok ? "ok" : "failed")}</td></tr>)}</tbody></table></div> : <Empty />}</>}</Section>;
}

export function UsersSection({ token, days }: Props) {
  const { data, error } = useAdmin<Users>("/users", token, days);
  return <Section title="Users">{error ? <Failure /> : !data ? <p>Loading…</p> : <>{data.new_guests_per_day.length || data.active_guests_per_day.length ? <div className={styles.userBars}><div><h3>New guests</h3><BarList rows={data.new_guests_per_day} value={(row) => row.n} /></div><div><h3>Active guests</h3><BarList rows={data.active_guests_per_day} value={(row) => row.n} /></div></div> : <Empty />}<div className={styles.funnel}>{([ ["Opened", data.funnel.opened], ["Sent problem", data.funnel.sent_problem], ["Saw workspace", data.funnel.saw_workspace], ["Completed", data.funnel.completed] ] as const).map(([label, count], index, all) => <div key={label}><span>{label}</span><strong>{count}</strong><small>{index ? (all[index - 1][1] ? `${Math.round((count / all[index - 1][1]) * 100)}%` : "—") : "100%"}</small></div>)}</div></>}</Section>;
}

export function ThesisSection({ token }: Props) {
  const { data, error } = useAdmin<Thesis>("/thesis", token, 7);
  const cell = (original: number, reinforcement: number) => data?.hint_table.find((item) => item.original_max_hint === original && item.reinforcement_max_hint === reinforcement)?.n ?? 0;
  return <Section title="Thesis">{error ? <Failure /> : !data ? <p>Loading…</p> : <>{data.cohorts.length ? <div className={styles.tableWrap}><table><thead><tr><th>First completion</th><th>Completers</th><th>D1</th><th>D7</th></tr></thead><tbody>{data.cohorts.map((row) => <tr key={row.first_completion_day}><td>{row.first_completion_day}</td><td>{row.completers}</td><td>{row.eligible_d1 ? `${row.returned_d1} / ${row.eligible_d1}` : "—"}</td><td>{row.eligible_d7 ? `${row.returned_d7} / ${row.eligible_d7}` : "—"}</td></tr>)}</tbody></table></div> : <Empty />}<div className={styles.funnel}>{([ ["Original done", data.funnel.sessions_original_done], ["Offered", data.funnel.sessions_offered], ["Accepted", data.funnel.sessions_accepted], ["Reinforcement done", data.funnel.sessions_reinforcement_done] ] as const).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div><p className={styles.note}>{data.pairs.length} pairs{data.mean_drop === null ? "" : ` · mean drop ${data.mean_drop}`} — read with the table, not alone</p><div className={styles.tableWrap}><table><thead><tr><th>Original \ Reinforcement</th>{[0, 1, 2, 3].map((n) => <th key={n}>{n}</th>)}</tr></thead><tbody>{[0, 1, 2, 3].map((original) => <tr key={original}><th>{original}</th>{[0, 1, 2, 3].map((reinforcement) => <td key={reinforcement}>{cell(original, reinforcement)}</td>)}</tr>)}</tbody></table></div></>}</Section>;
}
