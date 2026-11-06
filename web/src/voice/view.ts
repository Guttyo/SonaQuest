// ソナの見せ方に渡す値（Listener.tsx の props、Issue #37）。声を使うかは mode だけで決まる（ADR-0033）。

import type { TrainingMode } from "../flow/mode";

/** ソナの様子（3D のパペットと 2D の姿の動かし方。Listener.tsx の props、Issue #37） */
export type ListenerActivity = "idle" | "listening" | "speaking" | "thinking";

/**
 * Listener に渡す値。3D のセッション（Issue #37）が Listener.tsx に足す省略できる props と同じ名前。
 * その props が main に入るまでは、Listener は受け取らずに無視する（画面は今のまま）
 */
export interface ListenerVoiceView {
  mode?: TrainingMode;
  activity?: ListenerActivity;
  relief?: boolean;
}

/** 返事を待つ間は thinking、マイクが開いている間は listening、声が出ている間は speaking */
export function listenerActivity(state: { waiting: boolean; listening: boolean; speaking: boolean }): ListenerActivity {
  if (state.waiting) return "thinking";
  if (state.listening) return "listening";
  if (state.speaking) return "speaking";
  return "idle";
}
