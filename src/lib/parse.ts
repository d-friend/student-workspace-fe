// Port of backend/app/parse.py (and public/parse.js). Spec 5.2 to 5.4 are the contract.

export type Parsed = {
  chat: string;
  html: string | null;
  building: boolean;
  silent: boolean;
  ask: "how" | "why" | null;
  line: number | null;
  offer: boolean;
  opts: string[] | null;
  restate: boolean;
  mode: "learn" | "solve" | "practice" | null;
};

const OPEN = "```html";
const CLOSE = "\n```";
const SILENT = "[silent]";
export const RESTATES = ["Mình đọc đề là:", "I read the problem as:"];
export const isRestate = (chat: string) => RESTATES.some((p) => chat.startsWith(p));

// Leading tags, in this order: [mode:X], then [how]|[why], then [line N] (N >= 1), then [offer], then [opts: A | B].
// Whitespace may separate them.
const MODE_TAG = /^\s*\[mode:(learn|solve|practice)\]/;
const ASK_TAG = /^\s*\[(how|why)\]/;
const LINE_TAG = /^\s*\[line ([1-9]\d*)\]/;
const OFFER_TAG = /^\s*\[offer\]/;
// Hidden tags for the learner signal engine: [obs <kind> <kebab-signature>: <note>] and [level <x>]. Never shown, so
// they are eaten among the leading tags (any order) and stripped from the chat anywhere else, even malformed or
// still streaming. The server records the leading ones; see backend/app/parse.py.
const HIDDEN_TAG = /^\s*\[(?:obs|level)\b[^\]\n]*\]/;
const STRAY_HIDDEN = /\s*\[(?:obs|level)\b[^\]\n]*(?:\]|$)/g;
const OPTS_TAG = /^\s*\[opts: ([^\]\n]{1,200})\]/;
// The model sometimes writes the tag after the question text; accept it at the very end of the message.
const TRAILING_OPTS_TAG = /\s*\[opts: ([^\]\n]{1,200})\]\s*$/;

// While streaming, a chat that is still a prefix of one of these tags is hidden.
const PARTIAL_MARKERS = [
  SILENT,
  "[how]",
  "[why]",
  "[offer]",
  "[opts:",
  "[obs ",
  "[level ",
  "[line ",
  "[mode:learn]",
  "[mode:solve]",
  "[mode:practice]",
];
const PARTIAL_LINE = /^\[line \d+$/;
// A trailing, still-open options tag or a prefix of "[opts:" (2+ chars), so it never flashes while streaming.
// A "[ob" or "[lev" is held back too; once the next character rules it out ("[obst", "[0;1]") it shows.
const TRAILING_PARTIAL_OPTS = /\s*\[(?:opts:[^\]]*|o(?:p(?:t(?:s)?)?|b(?:s)?)?|of(?:f(?:e(?:r)?)?)?|le(?:v(?:e(?:l)?)?)?)$/;
// The model sometimes writes [offer] inside the text instead of before it; read it anywhere in the chat.
const STRAY_OFFER = /\s*\[offer\]\s*/;
// Line-start anchor: a closing inline-code backtick ("Try `h`") is not a fence.
const TRAILING_FENCE = /(^|\n)`{1,3}[a-z]*$/;

const stripHidden = (text: string): string => text.replace(STRAY_HIDDEN, "").trim();

function hidePartial(chat: string): string {
  if (chat && (PARTIAL_MARKERS.some((m) => m.startsWith(chat)) || PARTIAL_LINE.test(chat))) return "";
  return chat.replace(TRAILING_PARTIAL_OPTS, "");
}

function parseOpts(list: string): string[] | null {
  const parts = list.split("|").map((x) => x.trim()).filter((x) => x && x.length <= 60);
  return parts.length ? parts.slice(0, 3) : null;
}

export function parse(raw: string): Parsed {
  const parsed = parseTags(raw);
  if (!STRAY_OFFER.test(parsed.chat)) return parsed;
  return { ...parsed, offer: true, chat: parsed.chat.replace(STRAY_OFFER, " ").trim() };
}

function parseTags(raw: string): Parsed {
  let mode: Parsed["mode"] = null;
  let ask: Parsed["ask"] = null;
  let line: number | null = null;
  let offer = false;
  let opts: string[] | null = null;
  let body = raw;
  const eatHidden = () => {
    for (let tag = HIDDEN_TAG.exec(body); tag; tag = HIDDEN_TAG.exec(body)) body = body.slice(tag[0].length);
  };

  eatHidden();
  const modeTag = MODE_TAG.exec(body);
  if (modeTag) {
    mode = modeTag[1] as NonNullable<Parsed["mode"]>;
    body = body.slice(modeTag[0].length);
    eatHidden();
  }
  const askTag = ASK_TAG.exec(body);
  if (askTag) {
    ask = askTag[1] as "how" | "why";
    body = body.slice(askTag[0].length);
    eatHidden();
  }
  const lineTag = LINE_TAG.exec(body);
  if (lineTag) {
    line = Number(lineTag[1]);
    body = body.slice(lineTag[0].length);
    eatHidden();
  }
  const offerTag = OFFER_TAG.exec(body);
  if (offerTag) {
    offer = true;
    body = body.slice(offerTag[0].length);
    eatHidden();
  }
  const optsTag = OPTS_TAG.exec(body);
  if (optsTag) {
    opts = parseOpts(optsTag[1]);
    body = body.slice(optsTag[0].length);
    eatHidden();
  }

  const open = body.indexOf(OPEN);
  const nl = body.indexOf("\n", open);
  const close = body.lastIndexOf(CLOSE);
  // An empty block closes on the newline that ends its opening line.
  const building = open !== -1 && (nl === -1 || close < nl);
  if (!opts && !building) {
    const trailing = TRAILING_OPTS_TAG.exec(body);
    if (trailing) {
      opts = parseOpts(trailing[1]);
      body = body.slice(0, trailing.index);
    }
  }

  const common = { mode, ask, line, offer, opts };
  if (open === -1) {
    const chat = stripHidden(body.replace(TRAILING_FENCE, "").trim());
    return {
      ...common,
      chat: hidePartial(chat),
      html: null,
      building: false,
      silent: chat === SILENT,
      restate: isRestate(chat),
    };
  }

  const before = stripHidden(body.slice(0, open));
  if (building) {
    const chat = hidePartial(before);
    return { ...common, chat, html: null, building: true, silent: false, restate: isRestate(chat) };
  }

  const after = stripHidden(body.slice(close + CLOSE.length));
  const chat = hidePartial([before, after].filter(Boolean).join("\n\n"));
  return {
    ...common,
    chat,
    html: body.slice(nl + 1, close),
    building: false,
    silent: false,
    restate: isRestate(chat),
  };
}
