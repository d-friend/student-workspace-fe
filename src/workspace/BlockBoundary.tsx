import { Component, type ContextType, type ReactNode } from "react";
import { WorkspaceCopy } from "./WorkspaceCopy";
import type { BlockCtx } from "./types";
import styles from "./blocks/blocks.module.css";

type Props = { blockId: string; report: BlockCtx["report"]; children: ReactNode };

export class BlockBoundary extends Component<Props, { failed: boolean }> {
  static contextType = WorkspaceCopy;
  declare context: ContextType<typeof WorkspaceCopy>;
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    // Once per boundary instance: componentDidCatch fires only on the transition to failed.
    this.props.report("render_error", { block_id: this.props.blockId, message: error.message });
  }
  render() {
    return this.state.failed ? <p className={styles.failed}>{this.context.blockFailed}</p> : this.props.children;
  }
}
