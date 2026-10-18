// Port of backend/app/parse.py (and public/parse.js). Spec 5.2 to 5.4 are the contract.

export type Parsed = {
  chat: string;
  html: string | null;
  building: boolean;
  silent: boolean;
  ask: "how" | "why" | null;
  line: number | null;
  offer: boolean;
  restate: boolean;
  mode: "learn" | "solve" | "practice" | null;
};

const OPEN = "```html";
const CLOSE = "\n```";
const SILENT = "[silent]";
export const RESTATE = "Mình đọc đề là:";

// Leading tags, in this order: [mode:X], then [how]|[why], then [line N] (N >= 1), then [offer].
// Whitespace may separate them.
const MODE_TAG = /^\s*\[mode:(learn|solve|practice)\]/;
const ASK_TAG = /^\s*\[(how|why)\]/;
const LINE_TAG = /^\s*\[line ([1-9]\d*)\]/;
const OFFER_TAG = /^\s*\[offer\]/;

// While streaming, a chat that is still a prefix of one of these tags is hidden.
const PARTIAL_MARKERS = [
  SILENT,
  "[how]",
  "[why]",
  "[offer]",
  "[line ",
  "[mode:learn]",
  "[mode:solve]",
  "[mode:practice]",
];
const PARTIAL_LINE = /^\[line \d+$/;
// Line-start anchor: a closing inline-code backtick ("Try `h`") is not a fence.
const TRAILING_FENCE = /(^|\n)`{1,3}[a-z]*$/;

function hidePartial(chat: string): string {
  if (chat && (PARTIAL_MARKERS.some((m) => m.startsWith(chat)) || PARTIAL_LINE.test(chat))) return "";
  return chat;
}

export function parse(raw: string): Parsed {
  let mode: Parsed["mode"] = null;
  let ask: Parsed["ask"] = null;
  let line: number | null = null;
  let offer = false;
  let body = raw;

  const modeTag = MODE_TAG.exec(body);
  if (modeTag) {
    mode = modeTag[1] as NonNullable<Parsed["mode"]>;
    body = body.slice(modeTag[0].length);
  }
  const askTag = ASK_TAG.exec(body);
  if (askTag) {
    ask = askTag[1] as "how" | "why";
    body = body.slice(askTag[0].length);
  }
  const lineTag = LINE_TAG.exec(body);
  if (lineTag) {
    line = Number(lineTag[1]);
    body = body.slice(lineTag[0].length);
  }
  const offerTag = OFFER_TAG.exec(body);
  if (offerTag) {
    offer = true;
    body = body.slice(offerTag[0].length);
  }

  const common = { mode, ask, line, offer };
  const open = body.indexOf(OPEN);
  if (open === -1) {
    const chat = body.replace(TRAILING_FENCE, "").trim();
    return {
      ...common,
      chat: hidePartial(chat),
      html: null,
      building: false,
      silent: chat === SILENT,
      restate: chat.startsWith(RESTATE),
    };
  }

  const before = body.slice(0, open).trim();
  const nl = body.indexOf("\n", open);
  const close = body.lastIndexOf(CLOSE);
  // An empty block closes on the newline that ends its opening line.
  if (nl === -1 || close < nl) {
    const chat = hidePartial(before);
    return { ...common, chat, html: null, building: true, silent: false, restate: chat.startsWith(RESTATE) };
  }

  const after = body.slice(close + CLOSE.length).trim();
  const chat = hidePartial([before, after].filter(Boolean).join("\n\n"));
  return {
    ...common,
    chat,
    html: body.slice(nl + 1, close),
    building: false,
    silent: false,
    restate: chat.startsWith(RESTATE),
  };
}
