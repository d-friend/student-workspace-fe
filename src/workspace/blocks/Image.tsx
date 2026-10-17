import { useState } from "react";
import { MdInline } from "../md";
import type { Block, BlockProps } from "../types";
import styles from "./blocks.module.css";

export function ImageBlock({ block }: BlockProps<Extract<Block, { type: "image" }>>) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <figure className={styles.figure}>
      {failed ? (
        <div className={styles.imgFail}>
          <span>{block.alt}</span>
          <small>{block.credit}</small>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- remote source, natural ratio needed
        <img
          src={block.src}
          alt={block.alt}
          className={styles.img}
          style={loaded ? undefined : { aspectRatio: "16 / 9" }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {!failed && (
        <figcaption className={styles.small}>
          {block.caption && (
            <span style={{ display: "block" }}>
              <MdInline text={block.caption} />
            </span>
          )}
          <span style={{ display: "block" }}>{block.credit}</span>
        </figcaption>
      )}
    </figure>
  );
}
