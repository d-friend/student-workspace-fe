"use client";

// Temporary: every component state side by side, with static props, for comparing against the canvas.
// Delete this route in F8 (plan-frontend F5).
import { type ReactNode, useState } from "react";
import { Shell } from "@/components/Shell";
import { Bubble } from "@/components/rail/Bubble";
import { ChatLog } from "@/components/rail/ChatLog";
import { Composer } from "@/components/rail/Composer";
import { OfferChips } from "@/components/rail/OfferChips";
import { RailHeader } from "@/components/rail/RailHeader";
import { RestateChips } from "@/components/rail/RestateChips";
import { WatchingCue } from "@/components/rail/WatchingCue";
import { BuildingSkeleton } from "@/components/work/BuildingSkeleton";
import { EmptyState } from "@/components/work/EmptyState";
import { PhotoCheck } from "@/components/work/PhotoCheck";
import { WorkspaceFrame } from "@/components/work/WorkspaceFrame";

const noop = () => {};
const PHOTO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#fdfdfb"/><text x="24" y="60" font-size="22" fill="#23304f">Bài 3. Tìm m để hàm số</text><text x="24" y="100" font-size="22" fill="#23304f">y = x³ − 3x² + mx</text></svg>`,
)}`;

function Box({ title, width, height, children }: { title: string; width?: number; height: number; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 8px" }}>{title}</h2>
      <div style={{ width: width ?? "100%", height, border: "1px solid var(--border)", display: "flex", overflow: "hidden", background: "var(--bg)" }}>
        {children}
      </div>
    </section>
  );
}

function ComposerDemo({ withPhoto }: { withPhoto: boolean }) {
  const [value, setValue] = useState("");
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSend={noop}
      onPickPhoto={noop}
      placeholder={withPhoto ? "Hỏi D-Friend" : "Gõ đề bài hoặc câu hỏi của bạn"}
      photo={withPhoto ? { src: PHOTO, onRemove: noop } : null}
    />
  );
}

export default function DevPage() {
  return (
    <main style={{ padding: 24, display: "flex", flexDirection: "column", gap: 0 }}>
      <Box title="Work · 1 Empty state" height={640}>
        <div style={{ flex: 1, display: "flex" }}>
          <EmptyState onSnap={noop} onType={noop} onStarter={noop} />
        </div>
      </Box>
      <Box title="Work · 2 Photo check" height={640}>
        <div style={{ flex: 1, display: "flex" }}>
          <PhotoCheck src={PHOTO} onSend={noop} onRetake={noop} />
        </div>
      </Box>
      <Box title="Work · 3 Building skeleton" height={640}>
        <div style={{ flex: 1, display: "flex" }}>
          <BuildingSkeleton />
        </div>
      </Box>
      <Box title="Work · 4 to 6 Workspace frame (building pill)" height={640}>
        <div style={{ flex: 1, display: "flex" }}>
          <WorkspaceFrame srcDoc={`<p style="font-family:sans-serif;padding:24px">Bản làm bài mẫu</p>`} building />
        </div>
      </Box>
      <Box title="Rail · header, with and without Bài mới" width={380} height={64}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <RailHeader showNewProblem onNewProblem={noop} />
        </div>
      </Box>
      <Box title="Rail · empty log and composer" width={380} height={260}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--panel)" }}>
          <ChatLog empty />
          <ComposerDemo withPhoto={false} />
        </div>
      </Box>
      <Box title="Rail · every bubble variant, with photo composer" width={380} height={720}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--panel)" }}>
          <ChatLog>
            <Bubble variant="student">
              {/* eslint-disable-next-line @next/next/no-img-element -- temporary dev route, base64 preview */}
              <img src={PHOTO} alt="" style={{ width: 160, height: 120, objectFit: "cover", display: "block" }} />
              Bài 3. Mình tính được y′ rồi mà không biết làm tiếp
            </Bubble>
            <Bubble variant="agent" muted>
              Mình đọc đề là: tìm m để hàm số đồng biến trên ℝ.
            </Bubble>
            <RestateChips onConfirm={noop} onCorrect={noop} />
            <Bubble variant="agent-review" line={2}>
              Dấu “&lt;” ở dòng 2 cần xem lại.
            </Bubble>
            <Bubble variant="agent">Có một bài tương tự nếu bạn muốn.</Bubble>
            <OfferChips onAccept={noop} onLater={noop} />
            <Bubble variant="error">Không kết nối được với D-Friend: mạng yếu</Bubble>
            <Bubble variant="note">Không đọc được ảnh này. Thử chụp lại nhé.</Bubble>
            <WatchingCue />
          </ChatLog>
          <ComposerDemo withPhoto />
        </div>
      </Box>
      <Shell
        rail={
          <>
            <RailHeader showNewProblem onNewProblem={noop} />
            <ChatLog empty />
            <ComposerDemo withPhoto={false} />
          </>
        }
        work={<EmptyState onSnap={noop} onType={noop} onStarter={noop} />}
      />
    </main>
  );
}
