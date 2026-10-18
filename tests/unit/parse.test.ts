import { expect, test } from "vitest";
import { type Parsed, parse } from "@/lib/parse";

const empty: Parsed = {
  chat: "",
  html: null,
  building: false,
  silent: false,
  ask: null,
  line: null,
  offer: false,
  opts: null,
  restate: false,
  mode: null,
};
const p = (over: Partial<Parsed>): Parsed => ({ ...empty, ...over });

// Same cases as backend/tests/test_parse.py: spec 5.4 first, then the legacy test/parse.test.mjs cases.
const CASES: [string, Partial<Parsed>][] = [
  ["[silent]", { silent: true }],
  ["[sil", {}],
  ["[why] Vì sao bước này đúng?", { ask: "why", chat: "Vì sao bước này đúng?" }],
  ["[how][line 2] Bạn ra dòng này bằng cách nào?", { ask: "how", line: 2, chat: "Bạn ra dòng này bằng cách nào?" }],
  ["[line 3] Dấu “<” ở dòng 3 cần xem lại.", { line: 3, chat: "Dấu “<” ở dòng 3 cần xem lại." }],
  ["[li", {}],
  ["[offer] Có một bài tương tự nếu bạn muốn.", { offer: true, chat: "Có một bài tương tự nếu bạn muốn." }],
  ["Mình đọc đề là: tìm m.", { restate: true, chat: "Mình đọc đề là: tìm m." }],
  ["Hi\n```html\n<p>x</p>", { chat: "Hi", building: true }],
  ["Hi\n```html\n<p>x</p>\n```\nBye", { chat: "Hi\n\nBye", html: "<p>x</p>" }],
  ["Try `h` ", { chat: "Try `h`" }],
  ["[line 0] x", { chat: "[line 0] x" }],
  // legacy test/parse.test.mjs
  ["Try h = 0.1.\n", { chat: "Try h = 0.1." }],
  ["Look right.\n``", { chat: "Look right." }],
  ["Look right.\n```ht", { chat: "Look right." }],
  ["Look right.\n```html\n<p>hi", { chat: "Look right.", building: true }],
  [
    "Look right.\n\n```html\n<p>a</p>\n<script>`x`</script>\n```\nGo on.",
    { chat: "Look right.\n\nGo on.", html: "<p>a</p>\n<script>`x`</script>" },
  ],
  ["Hi.\n```html\n```", { chat: "Hi.", html: "" }],
  [" [silent]\n", { silent: true }],
  ["[", {}],
  ["[silent] but not really", { chat: "[silent] but not really" }],
  ["[note] hi", { chat: "[note] hi" }],
  ["[silent]\n```html\n<p>x</p>\n```", { html: "<p>x</p>" }],
  [
    "[how] Bạn ra dòng 3 bằng cách nào?\n```html\n<p>x</p>\n```",
    { ask: "how", chat: "Bạn ra dòng 3 bằng cách nào?", html: "<p>x</p>" },
  ],
  ["[wh", {}],
  ["[how]", { ask: "how" }],
  ["Xem [why] này", { chat: "Xem [why] này" }],
  // new tag handling
  ["[how] [line 2] [offer] Thử nhé.", { ask: "how", line: 2, offer: true, chat: "Thử nhé." }],
  ["[line 3", {}],
  ["[how][li", { ask: "how" }],
  ["Đúng rồi.", { chat: "Đúng rồi." }],
  // pilot spec 4: mode tag
  ["[mode:learn] Mình đọc đề là: x", { mode: "learn", restate: true, chat: "Mình đọc đề là: x" }],
  ["[mode:practice][offer] Thử bài này", { mode: "practice", offer: true, chat: "Thử bài này" }],
  ["[mode:solve] [why] Vì sao?", { mode: "solve", ask: "why", chat: "Vì sao?" }],
  ["[mode:lea", {}],
  ["[mode:other] hi", { chat: "[mode:other] hi" }],
  ["[why] [mode:learn] x", { ask: "why", chat: "[mode:learn] x" }],
  ["[mode:solve] [silent]", { mode: "solve", silent: true }],
  // spec_v2 3.1: options tag
  [
    "[why] [line 2] [opts: Vì A | Vì B | Mình cũng không chắc] Vì sao?",
    { ask: "why", line: 2, opts: ["Vì A", "Vì B", "Mình cũng không chắc"], chat: "Vì sao?" },
  ],
  ["[opts: a | | b | " + "x".repeat(61) + " | c | d] hi", { opts: ["a", "b", "c"], chat: "hi" }],
  ["[opts: Vì A | Vì", {}],
  ["[opts", {}],
  ["Chào", { chat: "Chào" }],
  // V12: trailing options tag
  [
    "Vì sao? [opts: A | B | Mình cũng không chắc]",
    { opts: ["A", "B", "Mình cũng không chắc"], chat: "Vì sao?" },
  ],
  [
    "[why] Vì sao từ t = √x lại có dx = 2t dt? [opts: Vì x = t² | Vì √x = t² | Mình cũng không chắc]",
    {
      ask: "why",
      opts: ["Vì x = t²", "Vì √x = t²", "Mình cũng không chắc"],
      chat: "Vì sao từ t = √x lại có dx = 2t dt?",
    },
  ],
  ["[opts: a] Vì sao? [opts: b]", { opts: ["a"], chat: "Vì sao? [opts: b]" }],
  ["Vì sao? [opts: a | | b | " + "x".repeat(61) + " | c | d]\n", { opts: ["a", "b", "c"], chat: "Vì sao?" }],
  ["Vì sao? [opts: A | B", { chat: "Vì sao?" }],
  ["Vì sao? [opt", { chat: "Vì sao?" }],
  ["Vì sao? [o", { chat: "Vì sao?" }],
  ["Vì sao? [", { chat: "Vì sao? [" }],
  ["Dùng [opt giữa câu rồi nói tiếp", { chat: "Dùng [opt giữa câu rồi nói tiếp" }],
  ["Xem [opts: x] rồi làm tiếp.", { chat: "Xem [opts: x] rồi làm tiếp." }],
  ["[silent] [opts: a]", { opts: ["a"], silent: true }],
  ["Mình đọc đề là: x. [opts: a | b]", { opts: ["a", "b"], restate: true, chat: "Mình đọc đề là: x." }],
  [
    "Hi\n```html\n<p>x</p>\n```\nVì sao? [opts: a | b]",
    { opts: ["a", "b"], chat: "Hi\n\nVì sao?", html: "<p>x</p>" },
  ],
];

test.each(CASES)("parse(%j)", (raw, expected) => {
  expect(parse(raw)).toEqual(p(expected));
});
