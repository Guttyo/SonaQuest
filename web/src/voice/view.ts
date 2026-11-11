// ソナの様子を、対話の画面の状態から決める（Issue #37）。Dialogue.tsx が ListenerStage の activity に渡す。
// 声を使うかは mode だけで決まる（ADR-0033）。

import type { ListenerActivity } from "../puppet3d/types";

/** 返事を待つ間は thinking、マイクが開いている間は listening、声が出ている間は speaking */
export function listenerActivity(state: { waiting: boolean; listening: boolean; speaking: boolean }): ListenerActivity {
  if (state.waiting) return "thinking";
  if (state.listening) return "listening";
  if (state.speaking) return "speaking";
  return "idle";
}
