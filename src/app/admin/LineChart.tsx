"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import styles from "./admin.module.css";

export type Series = { label: string; color: string; dash?: string; values: number[] };

// The API only returns days that have rows, and its days are Asia/Ho_Chi_Minh dates, so rebuild the window ending on the local today.
export function windowDays(days: number): string[] {
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }) + "T00:00:00Z");
  return Array.from({ length: days }, (_, i) => new Date(today.getTime() - (days - 1 - i) * 864e5).toISOString().slice(0, 10));
}

export const countsByDay = (labels: string[], rows: { day: string; n: number }[]) => {
  const byDay = new Map(rows.map((row) => [row.day, row.n]));
  return labels.map((day) => byDay.get(day) ?? 0);
};

const W = 640, H = 240, L = 34, R = 12, T = 12, B = 26;
const dayName = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export function LineChart({ labels, series, label }: { labels: string[]; series: Series[]; label: string }) {
  const [active, setActive] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const max = Math.max(1, ...series.flatMap((line) => line.values));
  const x = (i: number) => L + (labels.length > 1 ? (i / (labels.length - 1)) * (W - L - R) : (W - L - R) / 2);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, all) => all.indexOf(v) === i);
  const step = Math.max(1, Math.ceil(labels.length / 6));

  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || !box.width) return setActive(0);
    const viewX = ((event.clientX - box.left) / box.width) * W;
    const index = labels.length > 1 ? Math.round(((viewX - L) / (W - L - R)) * (labels.length - 1)) : 0;
    setActive(Math.min(labels.length - 1, Math.max(0, index)));
  };
  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = (active ?? (event.key === "ArrowLeft" ? labels.length : -1)) + (event.key === "ArrowLeft" ? -1 : 1);
    setActive(Math.min(labels.length - 1, Math.max(0, next)));
  };

  const leftPct = active === null ? 0 : (x(active) / W) * 100;
  return <figure className={styles.chart}>
    <figcaption className={styles.legend}>{series.map((line) => <span key={line.label}><svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={line.dash} /></svg>{line.label}</span>)}</figcaption>
    <div className={styles.plot}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} tabIndex={0}
        onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)} onKeyDown={key}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--hairline)" /><text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{v}</text></g>)}
        {labels.map((day, i) => i % step === 0 || i === labels.length - 1 ? <text key={day} x={x(i)} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--muted)">{day.slice(5)}</text> : null)}
        {active !== null && <line data-testid="guide" x1={x(active)} x2={x(active)} y1={T} y2={H - B} stroke="var(--control-border)" strokeDasharray="3 3" />}
        {series.map((line) => <g key={line.label}>
          <polyline fill="none" stroke={line.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={line.dash} strokeLinejoin="round" points={line.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          {line.values.map((v, i) => <circle key={labels[i]} cx={x(i)} cy={y(v)} r={active === i ? 5 : labels.length <= 31 ? 2.5 : 0} fill={active === i ? line.color : "var(--panel)"} stroke={line.color} strokeWidth="2" />)}
        </g>)}
      </svg>
      {active !== null && <div className={styles.tooltip} role="status" data-flip={leftPct > 60 || undefined} style={{ left: `${leftPct}%` }}>
        <b>{dayName(labels[active])}</b>
        {series.map((line) => <span key={line.label}><i style={{ background: line.color }} />{line.label}<strong>{line.values[active]}</strong></span>)}
      </div>}
    </div>
  </figure>;
}
