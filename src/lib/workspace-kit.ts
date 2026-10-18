// Workspace kit (spec 8.2): the CSS every agent-built workspace gets, inlined by frameDoc().
// It is a string in a .ts file because Turbopack cannot import a .css file as text (no ?raw).
// The iframe cannot read the app's variables, so the tokens are repeated here.

// Tabler outline paths, as mask images so each icon takes the text colour.
const icon = (body: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  )}")`;

const ICON_CHECK = icon('<path d="M5 12l5 5l10 -10"/>');
const ICON_ALERT = icon('<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>');
const ICON_BULB = icon(
  '<path d="M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7"/><path d="M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3"/><path d="M9.7 17l4.6 0"/>',
);
const ICON_BOOK = icon(
  '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/>',
);

export const KIT_CSS = `
:root {
  --bg: #f3f5f7; --panel: #ffffff; --text: #15171c; --muted: #4a4f5c;
  --border: #d9dee6; --control-border: #7d8696; --hairline: #e3e6ec; --accent: #15171c; --accent-text: #ffffff; --brand: #b4461a; --pet: #f27a3d;
  --student: #15171c; --student-text: #ffffff; --agent: #f1f3f6; --idea-bg: #eef3ff; --review-bg: #fff5ec; --review-border: #f3d3b8;
  --review-text: #a14400; --error-bg: #fde8e8; --error-text: #8a1c1c;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #12151b; --panel: #1a1e26; --text: #e7e9ee; --muted: #a3abb8;
    --border: #343a46; --control-border: #6b7486; --hairline: #262b35; --accent: #e7e9ee; --accent-text: #12151b; --brand: #f7b48c; --pet: #f27a3d;
    --student: #2a3142; --student-text: #e7e9ee; --agent: #222833; --idea-bg: #1c2640; --review-bg: #2b1d10; --review-border: #5a3b22;
    --review-text: #ffb27a; --error-bg: #3a1717; --error-text: #ffb4b4;
  }
}
:root[data-theme="dark"] {
  --bg: #12151b; --panel: #1a1e26; --text: #e7e9ee; --muted: #a3abb8;
  --border: #343a46; --control-border: #6b7486; --hairline: #262b35; --accent: #e7e9ee; --accent-text: #12151b; --brand: #f7b48c; --pet: #f27a3d;
  --student: #2a3142; --student-text: #e7e9ee; --agent: #222833; --idea-bg: #1c2640; --review-bg: #2b1d10; --review-border: #5a3b22;
  --review-text: #ffb27a; --error-bg: #3a1717; --error-text: #ffb4b4;
}
body {
  box-sizing: border-box; margin: 0 auto; padding: 40px clamp(20px, 4vw, 64px);
  max-width: calc(760px + 2 * clamp(20px, 4vw, 64px));
  background: var(--bg); color: var(--text); font-family: "Be Vietnam Pro", system-ui, sans-serif;
}
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }

/* Problem: the card with the label and the problem text. */
.df-problem {
  margin: 0 0 20px; padding: 22px 24px; display: flex; flex-direction: column; gap: 6px;
  background: var(--panel); border: 1px solid var(--hairline); border-radius: 14px;
}
.df-problem h2 { margin: 0; font-size: 13px; font-weight: 600; color: var(--muted); }
.df-problem p { margin: 0; font-size: 20px; line-height: 1.5; font-weight: 600; }

/* Steps: one row per line of the student's working. */
.df-steps {
  list-style: none; margin: 0 0 20px; padding: 4px 24px;
  background: var(--panel); border: 1px solid var(--hairline); border-radius: 14px;
}
.df-step {
  display: flex; align-items: center; gap: 16px; padding: 16px 0;
  border-bottom: 1px solid var(--hairline); font-size: 18px; font-weight: 500;
}
.df-step:last-child { border-bottom: 0; }
.df-step-n { width: 24px; flex: none; font-size: 14px; color: var(--muted); font-variant-numeric: tabular-nums; }
.df-step[data-state="ok"]::before, .df-step[data-state="review"]::before {
  content: ""; order: 3; margin-left: auto; width: 18px; height: 18px; flex: none;
  background: var(--accent); -webkit-mask: ${ICON_CHECK} no-repeat center / contain; mask: ${ICON_CHECK} no-repeat center / contain;
}
.df-step[data-state="review"]::before {
  background: var(--review-text); -webkit-mask: ${ICON_ALERT} no-repeat center / contain; mask: ${ICON_ALERT} no-repeat center / contain;
}
.df-step[data-state="ok"]::after, .df-step[data-state="review"]::after {
  order: 4; font-size: 14px; font-weight: 600; color: var(--brand);
}
.df-step[data-state="ok"]::after { content: "Đúng"; }
.df-step[data-state="review"]::after { content: "Xem lại"; color: var(--review-text); }
.df-step[data-state="review"] {
  margin: 0 -24px; padding: 16px 24px; background: var(--review-bg); border-bottom-color: transparent;
}
.df-step[data-state="pending"] { color: var(--muted); }

/* Entry: the next line, with its label, input and check button. */
.df-entry {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 10px; align-items: center;
  margin: 0; padding: 18px 0 0;
}
.df-entry label { grid-column: 1 / -1; font-size: 14px; font-weight: 600; }
.df-entry input {
  font: inherit; height: 52px; box-sizing: border-box; min-width: 0; padding: 0 16px;
  font-size: 18px; color: var(--text); background: var(--panel);
  border: 1.5px solid var(--accent); border-radius: 10px;
}
.df-entry button {
  font: inherit; height: 52px; padding: 0 22px; cursor: pointer;
  font-size: 16px; font-weight: 600; color: var(--accent-text); background: var(--accent);
  border: 0; border-radius: 10px;
}

/* Actions: help buttons, wrapping. */
.df-entry + .df-actions { margin-top: 20px; }
.df-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 0 0 20px; }
.df-hint {
  font: inherit; height: 48px; padding: 0 18px; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
  font-size: 15px; font-weight: 600; color: var(--text); background: var(--panel);
  border: 1px solid var(--control-border); border-radius: 10px;
}
.df-hint::before {
  content: ""; width: 20px; height: 20px; flex: none; background: var(--text);
  -webkit-mask: ${ICON_BULB} no-repeat center / contain; mask: ${ICON_BULB} no-repeat center / contain;
}
/* Three 14x6 segments; the ones up to data-level are filled. */
.df-hint::after { content: ""; width: 48px; height: 6px; flex: none; margin-left: 4px; border-radius: 3px; }
.df-hint[data-level="0"]::after {
  background: linear-gradient(90deg, var(--border) 0 14px, transparent 14px 17px, var(--border) 17px 31px, transparent 31px 34px, var(--border) 34px 48px);
}
.df-hint[data-level="1"]::after {
  background: linear-gradient(90deg, var(--accent) 0 14px, transparent 14px 17px, var(--border) 17px 31px, transparent 31px 34px, var(--border) 34px 48px);
}
.df-hint[data-level="2"]::after {
  background: linear-gradient(90deg, var(--accent) 0 14px, transparent 14px 17px, var(--accent) 17px 31px, transparent 31px 34px, var(--border) 34px 48px);
}
.df-hint[data-level="3"]::after {
  background: linear-gradient(90deg, var(--accent) 0 14px, transparent 14px 17px, var(--accent) 17px 31px, transparent 31px 34px, var(--accent) 34px 48px);
}
.df-idea {
  font: inherit; height: 48px; padding: 0 18px; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
  font-size: 15px; font-weight: 600; color: var(--brand); background: transparent; border: 0; border-radius: 10px;
}
.df-idea::before {
  content: ""; width: 20px; height: 20px; flex: none; background: currentColor;
  -webkit-mask: ${ICON_BOOK} no-repeat center / contain; mask: ${ICON_BOOK} no-repeat center / contain;
}

/* Done: the result banner. */
.df-done {
  margin: 0 0 20px; padding: 24px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 20px;
  color: var(--accent-text); background: var(--accent); border-radius: 14px;
}
.df-done small { font-size: 14px; opacity: 0.85; }
.df-done b { font-size: 20px; }
`;
