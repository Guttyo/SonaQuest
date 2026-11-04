import type { ReactNode } from "react";
import { PuppetView } from "../puppet3d/PuppetView";
import { ACTIVITY_LABELS, type ListenerActivity, type ListenerMode } from "../puppet3d/types";
import { useRenderMode } from "../puppet3d/useRenderMode";
import "../puppet3d/puppet3d.css";

/** 訓練の進み具合（Issue #55 の一部）。点数や残りの回数ではなく、いまどの段階かだけを示す */
export type DialoguePhase = "first" | "event" | "second";

const PHASES: readonly { id: DialoguePhase | "review"; label: string }[] = [
  { id: "first", label: "前半" },
  { id: "event", label: "出来事" },
  { id: "second", label: "後半" },
  { id: "review", label: "ふりかえり" },
];

/**
 * 対話の画面の上に固定する聞き取り係（Issue #46）。やり取りが流れても、係の姿はここに残る。
 * 3D はこの1か所だけで描く（WebGL の文脈を1つにする）。3D が使えないときと 2D のときは光（ADR-0020）。
 * 状態の文字は 3D の対話モードのときだけ出す（2D の見た目は変えない。Listener.tsx と同じ決まり）
 */
export function ListenerStage({
  mode,
  activity,
  relief,
  showState,
  phase,
  children,
}: {
  mode: ListenerMode;
  activity: ListenerActivity;
  relief: boolean;
  showState: boolean;
  phase: DialoguePhase;
  /** 読み上げの操作など、係の横に置くもの */
  children?: ReactNode;
}) {
  const shown = useRenderMode(mode);
  const current = PHASES.findIndex((p) => p.id === phase);
  const lightClass = [
    "listener-light",
    "listener-light-stage",
    relief ? "listener-light-relief" : "",
    activity === "thinking" ? "listener-light-thinking" : "",
  ]
    .filter((c) => c !== "")
    .join(" ");

  return (
    <div className="dialogue-stage">
      <div className="dialogue-stage-figure">
        {shown === "3d" ? (
          <PuppetView activity={activity} relief={relief} />
        ) : (
          <span className={lightClass} aria-hidden="true" />
        )}
        <div className="dialogue-stage-side">
          <span className="listener-name">
            聞き取り係
            {showState && <span className="listener-state">（{ACTIVITY_LABELS[activity]}）</span>}
          </span>
          {children}
        </div>
      </div>
      <ol className="progress" aria-label="訓練の進み具合">
        {PHASES.map((p, i) => (
          <li
            key={p.id}
            className={i < current ? "progress-step progress-done" : i === current ? "progress-step progress-current" : "progress-step"}
            aria-current={i === current ? "step" : undefined}
          >
            {p.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
