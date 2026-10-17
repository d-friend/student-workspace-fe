import katex from "katex";
import styles from "./TeX.module.css";

// Named TeX, not Math: a component called Math would shadow the global.
export function TeX({ tex, display }: { tex: string; display: boolean }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    output: "htmlAndMathml",
  });
  // The only dangerouslySetInnerHTML in the codebase: KaTeX output, trust: false.
  const inner = <span dangerouslySetInnerHTML={{ __html: html }} />;
  return display ? <div className={styles.scroll}>{inner}</div> : inner;
}
