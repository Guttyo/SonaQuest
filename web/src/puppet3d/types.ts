/** ソナの見せ方（ADR-0031・ADR-0032）。"3d" でも、3D が使えないときは 2D で出す */
export type ListenerMode = "2d" | "3d";

/**
 * ソナの状態（ADR-0032）。アプリの状態だけで決める。Claude の出力は使わない（ADR-0025）。
 * 待機・聞いている・話しているはオーナーの決定。考え中は ADR-0030 の考え中の表示に合わせた下書き
 */
export type ListenerActivity = "idle" | "listening" | "speaking" | "thinking";

/**
 * 状態は動きだけでなく文字でも示す（ADR-0020）。
 * 決定済み：状態の文字の文面（Claude Code の下書き。ADR-0032 の状態の見せ方のマーカーとあわせて確かめる）
 * → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（訓練の画面の文言のうち安全に関わらないもの）
 */
export const ACTIVITY_LABELS: Record<ListenerActivity, string> = {
  idle: "待っています",
  listening: "聞いています",
  speaking: "話しています",
  thinking: "考えています",
};
