import { Fragment, type ReactNode } from "react";
import { TeX } from "./TeX";

// Order matters: $$ before $, ** before *.
const INLINE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|\*\*(.+?)\*\*|\*([^*\n]+?)\*/g;

// Math only: for text that may hold a typed `*`, where bold and italic would misfire.
const MATH = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

function inline(s: string, re = INLINE): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const k = out.length;
    if (m[1] !== undefined) out.push(<TeX key={k} tex={m[1]} display />);
    else if (m[2] !== undefined) out.push(<TeX key={k} tex={m[2]} display={false} />);
    else if (m[3] !== undefined) out.push(<strong key={k}>{inline(m[3])}</strong>);
    else out.push(<em key={k}>{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

// Inline subset only (math, bold, italic), no block wrapper: safe inside headings and figcaptions.
export function MdInline({ text }: { text: string }): ReactNode {
  return inline(text);
}

export function MathInline({ text }: { text: string }): ReactNode {
  return inline(text, MATH);
}

const UL = /^- /;
const OL = /^\d+\. /;

// shortcut: one list level and no tables; upgrade if docs need them.
export function Md({ text }: { text: string }): ReactNode {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block, i) => {
      const lines = block.split("\n");
      if (lines.every((l) => UL.test(l)) || lines.every((l) => OL.test(l))) {
        const Tag = UL.test(lines[0]) ? "ul" : "ol";
        const strip = Tag === "ul" ? UL : OL;
        return (
          <Tag key={i}>
            {lines.map((l, j) => (
              <li key={j}>{inline(l.replace(strip, ""))}</li>
            ))}
          </Tag>
        );
      }
      return (
        <p key={i}>
          {lines.map((l, j) => (
            // A fragment per line: inline() keys restart at 0 on every line, so they would clash across lines.
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(l)}
            </Fragment>
          ))}
        </p>
      );
    });
}
