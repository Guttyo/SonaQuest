// ソナの姿勢（Issue #315）。アプリの web/src/puppet3d/pose.ts（ADR-0032）から、動画で使う分だけを写した。
// pose.ts をそのまま取り込むと、型をたどって web/ の依存（react）が要るので、video/ だけで型の検査が通るように写している。
// アプリの動き（口の開け閉め・まばたき・待っている間の揺れ・話している間の揺れ）を直したら、ここも合わせて直す。

export interface Pose {
  /** 体全体の左右の揺れ */
  sway: number;
  /** 体全体の上下 */
  bob: number;
  /** 頭の傾き */
  headTilt: number;
  /** 頭の前後（正でうなずく） */
  headNod: number;
  /** 頭の左右の向き（0 で見ている人のほうを向く） */
  headTurn: number;
  /** 口の開き（0 で閉じる。最大 MOUTH_MAX） */
  mouth: number;
  /** 目線を上に向ける量（0〜1） */
  lookUp: number;
  /** 目の開き（1 で開く） */
  eyeOpen: number;
}

/** 身ぶり。腕は肩を軸に、外へ持ち上げる量（0 で下ろしたまま。ラジアン） */
export interface GesturePose {
  spin: number;
  armLeft: number;
  armRight: number;
  headNod: number;
  handbook: number;
  phone: number;
}

export const REST_GESTURE: GesturePose = { spin: 0, armLeft: 0, armRight: 0, headNod: 0, handbook: 0, phone: 0 };

export const MOUTH_MAX = 0.6;
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

/** 待っている間：ゆっくり揺れる */
export function idlePoseAt(t: number): Pose {
  return {
    sway: 0.06 * Math.sin(t * 0.9),
    bob: 0.03 * Math.sin(t * 1.8),
    headTilt: 0.04 * Math.sin(t * 0.6),
    headNod: 0,
    headTurn: 0.22 * Math.sin(t * 0.5),
    mouth: MOUTH_REST,
    lookUp: 0,
    eyeOpen: eyeOpenAt(t),
  };
}

/** 話している間：口が開け閉めする */
export function speakingPoseAt(t: number): Pose {
  const mouth = mouthAt(t);
  return {
    sway: 0.03 * Math.sin(t * 1.1),
    bob: 0.03 * (mouth / MOUTH_MAX),
    headTilt: 0.03 * Math.sin(t * 0.8),
    headNod: -0.06 * (mouth / MOUTH_MAX),
    headTurn: 0.04 * Math.sin(t * 0.5),
    mouth,
    lookUp: 0,
    eyeOpen: eyeOpenAt(t),
  };
}
