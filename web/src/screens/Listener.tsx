import type { ReactNode } from "react";
import { PuppetView } from "../puppet3d/PuppetView";
import { ACTIVITY_LABELS, type ListenerActivity, type ListenerMode } from "../puppet3d/types";
import { useRenderMode } from "../puppet3d/useRenderMode";
import "../puppet3d/puppet3d.css";
import { Puppet2D } from "./Puppet2D";

export type { ListenerActivity, ListenerMode };

interface Props {
  children: ReactNode;
  /**
   * 見せ方（ADR-0031・ADR-0032）。既定は "2d"。
   * "3d" でも、WebGL 2 が使えない・動きを減らす設定・3D の失敗のときは 2D で出す
   */
  mode?: ListenerMode;
  /** 聞き取り係の状態。アプリの状態だけで決める（Claude の出力は使わない）。既定は "idle" */
  activity?: ListenerActivity;
  /** 係の交代（出来事「どれにも当てはまらない」）。別の色で出す */
  relief?: boolean;
}

/**
 * 聞き取り係の発言。2D は光の存在として表す（ADR-0020）。3D はパペット（ADR-0032）。
 * props を省いたときは、これまでと同じ表示（止まった光と発言）になる。
 * 2D の光は止まったまま。動くのは返事を待つ間の「考え中」だけ（Dialogue.tsx の Thinking、ADR-0030）。
 * 状態は動きだけでなく文字でも示す（mode か activity を渡したとき）。
 */
export function Listener({ children, mode = "2d", activity, relief = false }: Props) {
  const shown = useRenderMode(mode);
  const current = activity ?? "idle";
  const showState = mode === "3d" || activity !== undefined;

  return (
    <div className={shown === "3d" ? "listener listener-3d" : "listener listener-2d"}>
      {shown === "3d" ? (
        <PuppetView activity={current} relief={relief} />
      ) : (
        <Puppet2D activity={current} relief={relief} />
      )}
      <div className="listener-speech">
        <span className="listener-name">
          聞き取り係
          {showState && <span className="listener-state">（{ACTIVITY_LABELS[current]}）</span>}
        </span>
        {children}
      </div>
    </div>
  );
}
