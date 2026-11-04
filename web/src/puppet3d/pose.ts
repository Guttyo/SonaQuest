import type { ListenerActivity } from "./types";

/**
 * パペットの姿勢（ADR-0032）。時刻と状態だけで決まる純粋な関数にして、three を使わずに試験できるようにする。
 * 角度はラジアン、位置はパペットの頭の半径を1とした長さ。
 */
export interface Pose {
  /** 体全体の左右の揺れ */
  sway: number;
  /** 体全体の上下 */
  bob: number;
  /** 頭の傾き（首をかしげる） */
  headTilt: number;
  /** 頭の前後（正でうなずく、負で上を見る） */
  headNod: number;
  /** 頭の左右の向き（0 で利用者のほうを向く。待機のときはゆっくり見回す） */
  headTurn: number;
  /** 口の開き（0 で閉じる。最大 MOUTH_MAX） */
  mouth: number;
  /** 目線を上に向ける量（0〜1） */
  lookUp: number;
  /** 目の開き（1 で開く。まばたきで小さくなる） */
  eyeOpen: number;
}

export const MOUTH_MAX = 0.6;
/** 閉じているときも、口の線が見える程度に少しだけ開く */
export const MOUTH_REST = 0.03;

const TAU = Math.PI * 2;

/** 話している間の口の開け閉め。1秒に4回ほど開き、開き方に強弱を付ける */
export function mouthAt(t: number): number {
  const syllable = 0.5 - 0.5 * Math.cos(t * TAU * 4.2);
  const phrase = 0.65 + 0.35 * Math.sin(t * TAU * 0.37);
  return MOUTH_REST + (MOUTH_MAX - MOUTH_REST) * syllable * phrase;
}

/** 約3.7秒ごとに、短くまばたきする */
export function eyeOpenAt(t: number): number {
  const phase = ((t % 3.7) + 3.7) % 3.7;
  return phase < 0.12 ? 0.15 : 1;
}

export function poseAt(activity: ListenerActivity, t: number): Pose {
  const eyeOpen = eyeOpenAt(t);
  switch (activity) {
    case "idle":
      // ゆっくり揺れる
      return {
        sway: 0.06 * Math.sin(t * 0.9),
        bob: 0.03 * Math.sin(t * 1.8),
        headTilt: 0.04 * Math.sin(t * 0.6),
        headNod: 0,
        headTurn: 0.22 * Math.sin(t * 0.5),
        mouth: MOUTH_REST,
        lookUp: 0,
        eyeOpen,
      };
    case "listening":
      // 利用者のほうを向き、少し前に乗り出して傾き、ときどきうなずく
      return {
        sway: 0.02 * Math.sin(t * 0.9),
        bob: 0.015 * Math.sin(t * 1.8),
        headTilt: 0.22,
        headNod: 0.06 + 0.1 * Math.max(0, Math.sin(t * 2.4)),
        headTurn: 0,
        mouth: MOUTH_REST,
        lookUp: 0,
        eyeOpen,
      };
    case "speaking": {
      // 口が開け閉めする
      const mouth = mouthAt(t);
      return {
        sway: 0.03 * Math.sin(t * 1.1),
        bob: 0.03 * (mouth / MOUTH_MAX),
        headTilt: 0.03 * Math.sin(t * 0.8),
        headNod: -0.06 * (mouth / MOUTH_MAX),
        headTurn: 0.04 * Math.sin(t * 0.5),
        mouth,
        lookUp: 0,
        eyeOpen,
      };
    }
    case "thinking":
      // 少し上を見て、ゆっくり揺れる
      return {
        sway: 0.05 * Math.sin(t * 0.6),
        bob: 0.02 * Math.sin(t * 1.2),
        headTilt: -0.14,
        headNod: -0.12,
        headTurn: -0.12,
        mouth: MOUTH_REST,
        lookUp: 1,
        eyeOpen,
      };
  }
}

/**
 * 状態が変わったときに、姿勢が飛ばないよう少しずつ近づける。
 * 口は速く、体は遅く追う。まばたきはそのまま使う
 */
export function blendPose(current: Pose, target: Pose, dt: number): Pose {
  const slow = 1 - Math.exp(-dt * 8);
  const fast = 1 - Math.exp(-dt * 30);
  const mix = (a: number, b: number, k: number) => a + (b - a) * k;
  return {
    sway: mix(current.sway, target.sway, slow),
    bob: mix(current.bob, target.bob, slow),
    headTilt: mix(current.headTilt, target.headTilt, slow),
    headNod: mix(current.headNod, target.headNod, slow),
    headTurn: mix(current.headTurn, target.headTurn, slow),
    mouth: mix(current.mouth, target.mouth, fast),
    lookUp: mix(current.lookUp, target.lookUp, slow),
    eyeOpen: target.eyeOpen,
  };
}

/** 回答を受け取ったときのうなずきの長さ（秒） */
export const NOD_SECONDS = 0.7;

/**
 * 回答を受け取ったときの、1回だけのうなずき（Issue #55 の一部）。うなずき始めてからの秒数で、頭を前に倒す量を返す。
 * 大きく1回、小さく1回うなずく。それ以外の時刻は 0。状態の姿勢に足して使う
 */
export function nodAt(elapsed: number): number {
  if (!(elapsed >= 0) || elapsed >= NOD_SECONDS) return 0;
  const first = 0.4;
  if (elapsed < first) return 0.32 * Math.sin((Math.PI * elapsed) / first);
  return 0.14 * Math.sin((Math.PI * (elapsed - first)) / (NOD_SECONDS - first));
}
