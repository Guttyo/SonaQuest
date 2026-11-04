import { describe, expect, it } from "vitest";
import { MAIN_PALETTE, RELIEF_PALETTE, paletteFor } from "./palette";
import { MOUTH_MAX, MOUTH_REST, NOD_SECONDS, blendPose, eyeOpenAt, mouthAt, nodAt, poseAt, type Pose } from "./pose";
import type { ListenerActivity } from "./types";

const ACTIVITIES: ListenerActivity[] = ["idle", "listening", "speaking", "thinking"];
/** 10秒を1/30秒ごとに見る */
const TIMES = Array.from({ length: 300 }, (_, i) => i / 30);

function range(activity: ListenerActivity, key: keyof Pose) {
  const values = TIMES.map((t) => poseAt(activity, t)[key]);
  return { min: Math.min(...values), max: Math.max(...values) };
}

describe("状態ごとの姿勢（ADR-0032）", () => {
  it("話している間だけ、口が開け閉めする", () => {
    const speaking = range("speaking", "mouth");
    expect(speaking.max).toBeGreaterThan(MOUTH_MAX * 0.5);
    expect(speaking.min).toBeLessThan(MOUTH_MAX * 0.15);
    for (const activity of ["idle", "listening", "thinking"] as const) {
      const other = range(activity, "mouth");
      expect(other.max).toBe(MOUTH_REST);
      expect(other.min).toBe(MOUTH_REST);
    }
  });

  it("口は開きすぎない（0 から MOUTH_MAX の間）", () => {
    for (const t of TIMES) {
      const m = mouthAt(t);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(MOUTH_MAX);
    }
  });

  it("待機はゆっくり揺れる（左右に揺れ、頭はほぼまっすぐ）", () => {
    const sway = range("idle", "sway");
    expect(sway.max).toBeGreaterThan(0.03);
    expect(sway.min).toBeLessThan(-0.03);
    expect(Math.abs(range("idle", "headTilt").max)).toBeLessThan(0.1);
  });

  it("聞いているときは頭を少し傾け、うなずく", () => {
    expect(range("listening", "headTilt").min).toBeGreaterThan(0.15);
    expect(range("listening", "headNod").max).toBeGreaterThan(0.05);
  });

  it("考え中は上を見る", () => {
    expect(range("thinking", "lookUp").min).toBe(1);
    expect(range("thinking", "headNod").max).toBeLessThan(0);
    for (const activity of ["idle", "listening", "speaking"] as const) {
      expect(range(activity, "lookUp").max).toBe(0);
    }
  });

  it("4つの状態は、同じ時刻でも姿勢が違う（見分けられる）", () => {
    const t = 1.3;
    const poses = ACTIVITIES.map((a) => JSON.stringify(poseAt(a, t)));
    expect(new Set(poses).size).toBe(ACTIVITIES.length);
  });

  it("ときどきまばたきする", () => {
    const values = TIMES.map(eyeOpenAt);
    expect(values.filter((v) => v < 1).length).toBeGreaterThan(0);
    expect(values.filter((v) => v === 1).length).toBeGreaterThan(values.length * 0.9);
  });
});

describe("blendPose（状態の切り替えで姿勢を飛ばさない）", () => {
  it("目標へ少しずつ近づき、口は体より速く追う", () => {
    const from = poseAt("idle", 0);
    const to: Pose = { ...poseAt("speaking", 0), mouth: MOUTH_MAX, headTilt: 0.3 };
    const next = blendPose(from, to, 1 / 30);
    const mouthProgress = (next.mouth - from.mouth) / (to.mouth - from.mouth);
    const tiltProgress = (next.headTilt - from.headTilt) / (to.headTilt - from.headTilt);
    expect(mouthProgress).toBeGreaterThan(0);
    expect(mouthProgress).toBeLessThan(1);
    expect(tiltProgress).toBeGreaterThan(0);
    expect(tiltProgress).toBeLessThan(mouthProgress);
  });

  it("時間がたてば目標に追いつく", () => {
    let pose = poseAt("idle", 0);
    const target = poseAt("thinking", 0);
    for (let i = 0; i < 60; i++) pose = blendPose(pose, target, 1 / 30);
    expect(pose.lookUp).toBeCloseTo(target.lookUp, 2);
    expect(pose.headNod).toBeCloseTo(target.headNod, 2);
  });
});

describe("係の交代の色", () => {
  it("交代すると別の色のパペットになる", () => {
    expect(paletteFor(false)).toBe(MAIN_PALETTE);
    expect(paletteFor(true)).toBe(RELIEF_PALETTE);
    expect(RELIEF_PALETTE.body).not.toBe(MAIN_PALETTE.body);
    expect(RELIEF_PALETTE.accent).not.toBe(MAIN_PALETTE.accent);
  });
});

describe("顔の向きとうなずき（Issue #55）", () => {
  it("待機ではゆっくり見回し、聞いている間は利用者のほうを向く", () => {
    const idle = range("idle", "headTurn");
    expect(idle.max).toBeGreaterThan(0.1);
    expect(idle.min).toBeLessThan(-0.1);
    expect(range("listening", "headTurn")).toEqual({ min: 0, max: 0 });
  });

  it("うなずきは決まった長さの間だけ頭を前に倒し、前後は 0 に戻る", () => {
    expect(nodAt(-0.01)).toBe(0);
    expect(nodAt(-Infinity)).toBe(0);
    expect(nodAt(Number.NaN)).toBe(0);
    expect(nodAt(NOD_SECONDS)).toBe(0);
    expect(nodAt(10)).toBe(0);
    const values = Array.from({ length: 70 }, (_, i) => nodAt((i / 70) * NOD_SECONDS));
    expect(Math.max(...values)).toBeGreaterThan(0.25);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
  });
});
