import { useEffect, useState, useSyncExternalStore } from "react";
import { currentMatchMedia, prefersReducedMotion, subscribeReducedMotion } from "./support";
import type { ListenerActivity } from "./types";

/**
 * 返事を長く待つ間の、ソナの身ぶり（Issue #221。B-02 の一部）。
 * 2026-11-07 オーナーの答え（チャット）：場面は「待ちが3秒を超えたら」。動きは「くるっと回る」「万歳する」と、
 * 「パペットがお薬手帳やスマホアプリを見る、手を振るというようなジェスチャーがいいかも」（紙吹雪はやめる）。
 * アプリの状態（考え中の長さ）だけで決める。Claude の出力は使わない（ADR-0025）。
 * 手帳やスマホを見る身ぶりは待っている間の身ぶりで、利用者の薬を調べているのではない。状態の文字（「考えています」）は変えない。
 * 動きを減らす設定のときは出さない。three を import しない（2D と 3D の両方で使う）
 */
export type ListenerGesture = "handbook" | "phone" | "wave" | "spin" | "banzai";

/** 身ぶりを出す順（Claude Code の下書き）。手帳・スマホを見る → 手を振る → 回る → 万歳 → また手帳から */
export const WAIT_GESTURES: readonly ListenerGesture[] = ["handbook", "phone", "wave", "spin", "banzai"];

/** 考え中がこの長さを超えたら、身ぶりを出す（オーナーの答え「待ちが3秒を超えたら」） */
export const GESTURE_DELAY_MS = 3000;

/** 1つの身ぶりの長さ（Claude Code の下書き） */
export const GESTURE_MS = 2400;

/** 考え中になってからの時間で、出す身ぶりを返す。まだ出さないときは null */
export function gestureAt(elapsedMs: number): ListenerGesture | null {
  if (!(elapsedMs >= GESTURE_DELAY_MS)) return null;
  const index = Math.floor((elapsedMs - GESTURE_DELAY_MS) / GESTURE_MS) % WAIT_GESTURES.length;
  return WAIT_GESTURES[index];
}

const reducedMotionNow = () => prefersReducedMotion(currentMatchMedia());
const serverFalse = () => false;

/**
 * 考え中が続いている間の身ぶり。考え中でなくなったら（返事が来た・中断した）すぐ null に戻す。
 * 動きを減らす設定のときは null のまま。待っている途中で設定が変わっても、その場でやめる（PR #222 のレビュー）
 */
export function useWaitGesture(activity: ListenerActivity): ListenerGesture | null {
  const [gesture, setGesture] = useState<ListenerGesture | null>(null);
  const thinking = activity === "thinking";
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow, serverFalse);
  const active = thinking && !reducedMotion;
  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const elapsed = Date.now() - start;
      setGesture(gestureAt(elapsed));
      // 次の身ぶりに替わる時刻まで待つ
      const next = GESTURE_MS - ((elapsed - GESTURE_DELAY_MS) % GESTURE_MS);
      timer = setTimeout(tick, Math.max(50, next));
    };
    timer = setTimeout(tick, GESTURE_DELAY_MS);
    return () => {
      if (timer !== null) clearTimeout(timer);
      setGesture(null);
    };
  }, [active]);
  return active ? gesture : null;
}
