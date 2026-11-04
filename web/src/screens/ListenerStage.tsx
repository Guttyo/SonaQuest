import type { ReactNode } from "react";
import { PuppetView } from "../puppet3d/PuppetView";
import { ACTIVITY_LABELS, type ListenerActivity, type ListenerMode } from "../puppet3d/types";
import { useRenderMode } from "../puppet3d/useRenderMode";
import "../puppet3d/puppet3d.css";

/**
 * 訓練の場面（Issue #55 の一部）。点数や残りの回数ではなく、いまどの場面かだけを示す。
 * 場面の名前はオーナーの案（2026-11-04、チャット）
 */
export type SceneId = "arrive" | "tell" | "event" | "retell" | "review";

export const SCENES: readonly { id: SceneId; title: string }[] = [
  { id: "arrive", title: "避難所に到着" },
  { id: "tell", title: "普段の薬を伝える" },
  { id: "event", title: "想定外の出来事" },
  { id: "retell", title: "それでも伝えられる？" },
  { id: "review", title: "あなたの備えを振り返る" },
];

export function sceneNumber(id: SceneId): string {
  return `SCENE ${String(SCENES.findIndex((s) => s.id === id) + 1).padStart(2, "0")}`;
}

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
  scene,
  nodKey = 0,
  children,
}: {
  mode: ListenerMode;
  activity: ListenerActivity;
  relief: boolean;
  showState: boolean;
  scene: SceneId;
  /** 増えるたびに、係が1回うなずく（回答を受け取ったとき） */
  nodKey?: number;
  /** 読み上げの操作や、頼りにしているものなど、係の横に置くもの */
  children?: ReactNode;
}) {
  const shown = useRenderMode(mode);
  const current = SCENES.findIndex((s) => s.id === scene);
  const lightClass = [
    "listener-light",
    "listener-light-stage",
    relief ? "listener-light-relief" : "",
    activity === "thinking" ? "listener-light-thinking" : "",
    nodKey > 0 ? "listener-light-nod" : "",
  ]
    .filter((c) => c !== "")
    .join(" ");

  return (
    <div className="dialogue-stage">
      <div className="dialogue-stage-figure">
        <div className="stage-figure-enter">
          {shown === "3d" ? (
            <PuppetView activity={activity} relief={relief} nodKey={nodKey} />
          ) : (
            // 2D の光は、作り直して小さく沈む動きをもう一度出す
            <span key={nodKey} className={lightClass} aria-hidden="true" />
          )}
        </div>
        <div className="dialogue-stage-side">
          <span className="listener-name">
            聞き取り係
            {showState && <span className="listener-state">（{ACTIVITY_LABELS[activity]}）</span>}
          </span>
          {children}
        </div>
      </div>
      <div className="scene-bar">
        {/* 場面が変わるたびに、見出しが入れ替わる（key で作り直して、入る動きをもう一度出す） */}
        <p key={scene} className="scene-title">
          <span className="scene-number">{sceneNumber(scene)}</span>
          {SCENES[current].title}
        </p>
        <ol className="scene-dots" aria-label="訓練の場面">
          {SCENES.map((s, i) => (
            <li
              key={s.id}
              className={i < current ? "scene-dot scene-dot-done" : i === current ? "scene-dot scene-dot-current" : "scene-dot"}
              aria-current={i === current ? "step" : undefined}
            >
              <span className="visually-hidden">{s.title}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
