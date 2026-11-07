import type { ReactNode } from "react";
import { useWaitGesture } from "../puppet3d/gesture";
import { PuppetView } from "../puppet3d/PuppetView";
import { ACTIVITY_LABELS, type ListenerActivity, type ListenerMode } from "../puppet3d/types";
import { useRenderMode } from "../puppet3d/useRenderMode";
import { listenerName } from "../flow/content";
import { Puppet2D } from "./Puppet2D";
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
 * 対話の画面の上に固定する話し相手（ソナ、交代の後はクエ。Issue #46、#164）。やり取りが流れても、係の姿はここに残る。
 * 3D はこの1か所だけで描く（WebGL の文脈を1つにする）。3D が使えないときと 2D のときは、パペットの 2D 版（Puppet2D、ADR-0038）。
 * 状態の文字は showState のときに出す（Dialogue は 2D・3D とも出す。Issue #47）
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
  // 返事を長く待つ間の身ぶり（Issue #221）。考え中が3秒を超えたら出し、返事が来たらすぐやめる
  const gesture = useWaitGesture(activity);
  return (
    <div className="dialogue-stage">
      <div className="dialogue-stage-figure">
        <div className="stage-figure-enter">
          {shown === "3d" ? (
            <PuppetView activity={activity} relief={relief} nodKey={nodKey} gesture={gesture} />
          ) : (
            // 2D はパペットの 2D 版（Issue #47、ADR-0038）。うなずきは頭だけを作り直して出す
            <Puppet2D activity={activity} relief={relief} nodKey={nodKey} gesture={gesture} />
          )}
        </div>
        <div className="dialogue-stage-side">
          <span className="listener-name">
            {listenerName(relief)}
            {showState && <span className="listener-state">（{ACTIVITY_LABELS[activity]}）</span>}
          </span>
          {children}
        </div>
      </div>
      <SceneBar scene={scene} />
    </div>
  );
}

/**
 * 場面の見出しと5つの点。対話の画面（係の下）と振り返りの画面で同じものを出す。
 * 見出しを包む要素は作り直さず、読み上げの領域（aria-live）にして、場面が変わったことを読み上げる
 */
export function SceneBar({ scene }: { scene: SceneId }) {
  const current = SCENES.findIndex((s) => s.id === scene);
  return (
    <div className="scene-bar">
      <div className="scene-title-live" aria-live="polite" aria-atomic="true">
        {/* 場面が変わるたびに、見出しが入れ替わる（key で作り直して、入る動きをもう一度出す） */}
        <p key={scene} className="scene-title">
          <span className="scene-number">{sceneNumber(scene)}</span>
          {SCENES[current].title}
        </p>
      </div>
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
  );
}
