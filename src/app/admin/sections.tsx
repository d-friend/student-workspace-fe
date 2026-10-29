"use client";

import { useEffect, useState } from "react";
import { adminGet, adminPut, type Cost, type Features, type FeedbackRow, type GuestDetail, type GuestRow, type Health, type Latency, type Pct, type Thesis, type Users } from "@/lib/admin";
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
// While no model has a price the backend's total is 0, and a headline "$0.0000" would read as free.
const spend = (c: Cost, value: number | null) => (c.unpriced_models.length > 0 && c.total_usd === 0 ? "—" : money(value));
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
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
  return <Section title="Cost">{error ? <Failure /> : !data ? <p>Loading…</p> : <>{data.unpriced_models.length > 0 && <p className={styles.notice}>Partial: no price for {data.unpriced_models.join(", ")}</p>}<div className={styles.metrics}><Metric label="Total" value={spend(data, data.total_usd)} /><Metric label="$ per active guest-day" value={spend(data, data.per_active_guest_day_usd)} /><Metric label="$ per completed problem" value={spend(data, data.per_completed_problem_usd)} /><Metric label="Cache-read ratio" value={percent(data.cache_read_ratio)} /><Metric label="Searches" value={data.searches} /></div>{data.per_day.length ? <div className={styles.bars}>{data.per_day.map((row) => <div className={styles.barRow} key={row.day}><span>{row.day}</span><div><i style={{ width: `${(row.usd / Math.max(...data.per_day.map((item) => item.usd), 1)) * 100}%` }} /></div><b>{spend(data, row.usd)}</b></div>)}</div> : <Empty />}<div className={styles.tableWrap}><table><thead><tr><th>Role</th><th>Model</th><th>Calls</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cache write</th><th>USD</th></tr></thead><tbody>{data.by_role_model.map((row, index) => <tr key={`${row.role}-${row.model}-${index}`}><td>{row.role}</td><td>{row.model ?? "—"}</td><td>{row.calls}</td><td>{row.input_tokens}</td><td>{row.output_tokens}</td><td>{row.cache_read_tokens}</td><td>{row.cache_write_tokens}</td><td>{money(row.usd)}</td></tr>)}</tbody></table></div></>}</Section>;
}

export function LatencySection({ token, days, onGuestOpen }: Props) {
  const { data, error } = useAdmin<Latency>("/latency", token, days);
  return <Section title="Latency">{error ? <Failure /> : !data ? <p>Loading…</p> : <><div className={styles.metrics}><Percentiles label="Master first text" value={data.master_first_text_ms} /><Percentiles label="Master total" value={data.master_total_ms} /><Percentiles label="Planner total" value={data.planner_total_ms} /><Percentiles label="Simulator total" value={data.simulator_total_ms} /><Percentiles label="First workspace" value={data.time_to_first_workspace_ms} /><Percentiles label="Workspace shown" value={data.workspace_shown_ms} /></div>{data.slowest.length ? <div className={styles.tableWrap}><table><thead><tr><th>Turn</th><th>Guest</th><th>Total</th><th>Route</th><th>Model</th><th>Result</th></tr></thead><tbody>{data.slowest.map((row) => <tr key={row.turn_id}><td>{row.turn_id}</td><td><button type="button" className={styles.idButton} onClick={() => onGuestOpen?.(row.guest_id)}>{row.guest_id}</button></td><td>{ms(row.total_ms)}</td><td>{row.route ?? "—"}</td><td>{row.model ?? "—"}</td><td>{row.error_code ?? (row.ok === null ? "—" : row.ok ? "ok" : "failed")}</td></tr>)}</tbody></table></div> : <Empty />}{data.slowest_calls.length > 0 && <><h3>Slowest planner and simulator calls</h3><div className={styles.tableWrap}><table><thead><tr><th>Turn</th><th>Guest</th><th>Total</th><th>Role</th><th>Model</th><th>Result</th></tr></thead><tbody>{data.slowest_calls.map((row) => <tr key={`${row.turn_id}-${row.role}-${row.total_ms}`}><td>{row.turn_id}</td><td><button type="button" className={styles.idButton} onClick={() => onGuestOpen?.(row.guest_id)}>{row.guest_id}</button></td><td>{ms(row.total_ms)}</td><td>{row.role}</td><td>{row.model ?? "—"}</td><td>{row.error_code ?? "ok"}</td></tr>)}</tbody></table></div></>}</>}</Section>;
}

export function UsersSection({ token, days }: Props) {
  const { data, error } = useAdmin<Users>("/users", token, days);
  return <Section title="Users">{error ? <Failure /> : !data ? <p>Loading…</p> : <>
    <div className={styles.metrics}>
      <Metric label="Accounts total" value={data.accounts_total} />
      <Metric label="Accounts under 16" value={data.accounts_under_16} />
      <Metric label="Accounts with parent consent" value={data.accounts_with_parent_consent} />
      <Metric label="Linked guests" value={data.guests_linked} />
    </div>
    <p className={styles.note}>Account totals cover all time; daily counts and funnels use the selected window. Accounts have at least one non-internal linked guest; the table shows the newest 100.</p>
    {data.new_guests_per_day.length || data.active_guests_per_day.length || data.new_accounts_per_day.length ? <div className={styles.userBars}>
      <div><h3>New guests</h3><BarList rows={data.new_guests_per_day} value={(row) => row.n} /></div>
      <div><h3>Active guests</h3><BarList rows={data.active_guests_per_day} value={(row) => row.n} /></div>
      <div><h3>New accounts</h3><BarList rows={data.new_accounts_per_day} value={(row) => row.n} /></div>
    </div> : <Empty />}
    <h3>Accounts</h3>
    {data.accounts.length ? <div className={styles.tableWrap}><table>
      <thead><tr><th>Email</th><th>Name</th><th>Age</th><th>Parent consent</th><th>Created</th><th>Last login</th><th>Guests</th></tr></thead>
      <tbody>{data.accounts.map(account => <tr key={account.user_id}><td title={account.user_id}>{account.email}</td><td>{account.name ?? "—"}</td><td>{account.age ?? "—"}</td><td>{account.parent_consent ? "Yes" : "No"}</td><td>{when(account.created_at)}</td><td>{account.last_login_at ? when(account.last_login_at) : "—"}</td><td>{account.guests}</td></tr>)}</tbody>
    </table></div> : <Empty />}
    <div className={styles.userBars}>{([
      ["Funnel by guest", data.funnel], ["Funnel by person", data.funnel_by_person],
    ] as const).map(([title, funnel]) => <div key={title}><h3>{title}</h3><div className={styles.funnel}>{([
      ["Opened", funnel.opened], ["Sent problem", funnel.sent_problem],
      ["Saw workspace", funnel.saw_workspace], ["Completed", funnel.completed],
    ] as const).map(([label, count], index, all) => <div key={label}><span>{label}</span><strong>{count}</strong><small>{index ? (all[index - 1][1] ? percent(count / all[index - 1][1]) : "—") : count ? "100%" : "—"}</small></div>)}</div></div>)}</div>
  </>}</Section>;
}

export function FeaturesSection({ token, days }: Props) {
  const { data, error } = useAdmin<Features>("/features", token, days);
  return <Section title="Features">{error ? <Failure /> : !data ? <p>Loading…</p> : <>
    <p className={styles.note}>Persons merge guests linked to the same account. Unsigned guests count as individual persons.</p>
    {data.events.some(event => event.count > 0) ? <div className={styles.tableWrap}><table>
      <thead><tr><th>Event type</th><th>Split</th><th>Count</th><th>Guests</th><th>Persons</th></tr></thead>
      <tbody>{data.events.flatMap(event => [
        <tr key={event.type}><th>{event.type}</th><td>All</td><td>{event.count}</td><td>{event.guests}</td><td>{event.persons}</td></tr>,
        ...[
          ...event.by_method.map(row => ({ label: `Method: ${row.method}`, ...row })),
          ...event.by_kind.map(row => ({ label: `Kind: ${row.kind}`, ...row })),
          ...event.by_new_user.map(row => ({ label: `New user: ${row.new_user ? "Yes" : "No"}`, ...row })),
        ].map(row => <tr key={`${event.type}-${row.label}`}><td>{event.type}</td><td>{row.label}</td><td>{row.count}</td><td>{row.guests}</td><td>{row.persons}</td></tr>),
      ])}</tbody>
    </table></div> : <Empty />}
    <h3>Tabs per session</h3>
    {data.tabs_per_session.some(row => row.sessions > 0) ? <div className={styles.bars}>{data.tabs_per_session.map(row => <div className={styles.barRow} key={row.tabs}><span>{row.tabs} {row.tabs === "1" ? "tab" : "tabs"}</span><div><i style={{ width: `${row.sessions / Math.max(1, ...data.tabs_per_session.map(item => item.sessions)) * 100}%` }} /></div><b>{row.sessions}</b></div>)}</div> : <Empty />}
  </>}</Section>;
}

export function ThesisSection({ token }: Props) {
  const { data, error } = useAdmin<Thesis>("/thesis", token, 7);
  const [unit, setUnit] = useState<"guest" | "person">("guest");
  const cohorts = unit === "guest" ? data?.cohorts : data?.cohorts_by_person;
  const cell = (original: number, reinforcement: number) => data?.hint_table.find((item) => item.original_max_hint === original && item.reinforcement_max_hint === reinforcement)?.n ?? 0;
  return <Section title="Thesis"><div className={styles.days} aria-label="Cohort identity"><button type="button" aria-pressed={unit === "guest"} onClick={() => setUnit("guest")}>Guest</button><button type="button" aria-pressed={unit === "person"} onClick={() => setUnit("person")}>Person</button></div><p className={styles.note}>Whole pilot · {unit === "guest" ? "each guest separately" : "persons across linked guests"}.</p>{error ? <Failure /> : !data ? <p>Loading…</p> : <>{cohorts?.length ? <div className={styles.tableWrap}><table><thead><tr><th>First completion</th><th>Completers</th><th>D1</th><th>D7</th></tr></thead><tbody>{cohorts.map((row) => <tr key={row.first_completion_day}><td>{row.first_completion_day}</td><td>{row.completers}</td><td>{row.eligible_d1 ? `${row.returned_d1} / ${row.eligible_d1}` : "—"}</td><td>{row.eligible_d7 ? `${row.returned_d7} / ${row.eligible_d7}` : "—"}</td></tr>)}</tbody></table></div> : <Empty />}<div className={styles.funnel}>{([ ["Original done", data.funnel.sessions_original_done], ["Offered", data.funnel.sessions_offered], ["Accepted (offer or 'Bài tương tự' chip)", data.funnel.sessions_accepted], ["Reinforcement done", data.funnel.sessions_reinforcement_done] ] as const).map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div><p className={styles.note}>{data.pairs.length} {data.pairs.length === 1 ? "pair" : "pairs"}{data.mean_drop === null ? "" : ` · mean drop ${data.mean_drop}`} — read with the table, not alone</p><div className={styles.tableWrap}><table><thead><tr><th>Original \ Reinforcement</th>{[0, 1, 2, 3].map((n) => <th key={n}>{n}</th>)}</tr></thead><tbody>{[0, 1, 2, 3].map((original) => <tr key={original}><th>{original}</th>{[0, 1, 2, 3].map((reinforcement) => <td key={reinforcement}>{cell(original, reinforcement)}</td>)}</tr>)}</tbody></table></div></>}</Section>;
}

export function GuestsSection({ token, onGuestOpen }: Omit<Props, "days">) {
  const [guests, setGuests] = useState<GuestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  useEffect(() => {
    void adminGet<GuestRow[]>("/guests", token).then(setGuests, () => setError("Could not load this section."));
  }, [token]);
  const toggle = async (guest: GuestRow) => {
    const internal = !guest.internal;
    setSaving(guest.id);
    setError(null);
    setGuests((current) => current?.map((item) => item.id === guest.id ? { ...item, internal } : item) ?? null);
    try {
      await adminPut(`/guests/${guest.id}/internal`, token, { internal });
    } catch {
      setGuests((current) => current?.map((item) => item.id === guest.id ? { ...item, internal: guest.internal } : item) ?? null);
      setError("Could not update internal status.");
      setSaving(null);
      return;
    }
    try {
      setGuests(await adminGet<GuestRow[]>("/guests", token));
    } catch {
      setError("Updated internal status, but could not refresh the list.");
    } finally {
      setSaving(null);
    }
  };
  return <Section title="Guests">{error && <p className={styles.error} role="alert">{error}</p>}{!guests ? error ? null : <p>Loading…</p> : guests.length === 0 ? <Empty /> : <div className={styles.tableWrap}><table><thead><tr><th>Guest</th><th>User</th><th>Created</th><th>Last seen</th><th>Sessions</th><th>Turns</th><th>Completions</th><th>USD</th><th>Internal</th></tr></thead><tbody>{guests.map((guest) => <tr key={guest.id}><td><button className={styles.idButton} type="button" title={guest.id} onClick={() => onGuestOpen?.(guest.id)}>{guest.id.slice(0, 8)}</button></td><td title={guest.user_id ?? undefined}>{guest.email ?? "—"}</td><td>{when(guest.created_at)}</td><td>{when(guest.last_seen_at)}</td><td>{guest.sessions}</td><td>{guest.turns}</td><td>{guest.completions}</td><td>{money(guest.usd)}</td><td><input type="checkbox" aria-label={`Mark internal for ${guest.id}`} checked={guest.internal} disabled={saving === guest.id} onChange={() => void toggle(guest)} /></td></tr>)}</tbody></table></div>}</Section>;
}

export function FeedbackSection({ token, onGuestOpen }: Omit<Props, "days">) {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void adminGet<FeedbackRow[]>("/feedback", token).then(setRows, () => setError(true));
  }, [token]);
  return <Section title="Feedback">{error ? <Failure /> : !rows ? <p>Loading…</p> : rows.length === 0 ? <Empty /> : <div className={styles.tableWrap}><table><thead><tr><th>When</th><th>Guest</th><th>Message</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{when(row.created_at)}</td><td><button className={styles.idButton} type="button" title={row.guest_id} onClick={() => onGuestOpen?.(row.guest_id)}>{row.guest_id.slice(0, 8)}</button>{row.internal && " (internal)"}</td><td style={{ whiteSpace: "pre-wrap", minWidth: 320 }}>{row.message}</td></tr>)}</tbody></table></div>}</Section>;
}

export function GuestTimeline({ token, guestId, onClose, onGuestOpen }: { token: string; guestId: string; onClose: () => void; onGuestOpen: (guestId: string) => void }) {
  const [detail, setDetail] = useState<GuestDetail | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    void adminGet<GuestDetail>(`/guests/${guestId}`, token).then((data) => current && setDetail(data), () => current && setError(true));
    return () => { current = false; };
  }, [guestId, token]);
  return <Section title="Guest timeline"><button type="button" className={styles.signOut} onClick={onClose}>Close timeline</button>{error ? <Failure /> : !detail ? <p>Loading…</p> : <div className={styles.timeline}><p>Guest <span title={detail.guest.id}>{detail.guest.id}</span></p><div className={styles.siblings}><span>Sibling guests:</span>{detail.sibling_guest_ids.length ? detail.sibling_guest_ids.map(id => <button key={id} type="button" className={styles.idButton} title={id} onClick={() => onGuestOpen(id)}>{id.slice(0, 8)}</button>) : <span>None</span>}</div>{detail.sessions.length === 0 && <Empty />}{detail.sessions.map((session) => <article key={session.id} className={styles.session}><h3>{session.id}</h3><p>{session.started_via} · {when(session.created_at)} · {session.mode ?? "—"}</p><p>Last active: {session.last_active_at ? when(session.last_active_at) : "—"} · resumed ×{session.resumed}</p><div className={styles.tabs}>{session.tabs.length ? session.tabs.map(tab => <span key={tab.workspace_id} className={styles.tab} data-active={tab.workspace_id === session.active_workspace_id || undefined} title={tab.workspace_id}>{tab.phase}{tab.workspace_id === session.active_workspace_id && " · active"}</span>) : <span className={styles.note}>No tabs.</span>}</div>{session.turns.map((turn) => <div className={styles.turn} key={turn.id}><b>{when(turn.started_at)}</b><span>{turn.kind} · {turn.route ?? "—"} · {turn.mode ?? "—"}</span><span>{turn.error_code ?? (turn.ok === null ? "—" : turn.ok ? "ok" : "failed")} · {ms(turn.total_ms)} · {turn.model ?? "—"} · {money(turn.usd)}</span><span>{turn.events.join(", ") || "—"}</span></div>)}</article>)}</div>}</Section>;
}
