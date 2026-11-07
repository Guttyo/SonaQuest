import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Puppet2D, Puppet2DFace } from "../screens/Puppet2D";
import { GESTURE_DELAY_MS, GESTURE_MS, WAIT_GESTURES, gestureAt } from "./gesture";
import { BANZAI_RAISE, REST_GESTURE, blendGesture, gesturePoseAt } from "./pose";

describe("返事を長く待つ間の身ぶり（Issue #221）", () => {
  it("考え中が3秒を超えるまでは、身ぶりを出さない（オーナーの答え「待ちが3秒を超えたら」）", () => {
    expect(GESTURE_DELAY_MS).toBe(3000);
    expect(gestureAt(0)).toBeNull();
    expect(gestureAt(GESTURE_DELAY_MS - 1)).toBeNull();
    expect(gestureAt(Number.NaN)).toBeNull();
    expect(gestureAt(GESTURE_DELAY_MS)).toBe(WAIT_GESTURES[0]);
  });

  it("手帳・スマホを見る → 手を振る → 回る → 万歳 の順に出し、繰り返す。紙吹雪は無い", () => {
    expect(WAIT_GESTURES).toEqual(["handbook", "phone", "wave", "spin", "banzai"]);
    const seen = WAIT_GESTURES.map((_, i) => gestureAt(GESTURE_DELAY_MS + i * GESTURE_MS + 1));
    expect(seen).toEqual([...WAIT_GESTURES]);
    expect(gestureAt(GESTURE_DELAY_MS + WAIT_GESTURES.length * GESTURE_MS + 1)).toBe(WAIT_GESTURES[0]);
  });

  it("待つ上限（24秒）までのどの時刻でも、5つの身ぶりのどれか", () => {
    for (let ms = GESTURE_DELAY_MS; ms <= 24_000; ms += 100) {
      expect(WAIT_GESTURES).toContain(gestureAt(ms));
    }
  });
});

describe("3D の身ぶりの姿勢（Issue #221）", () => {
  const times = Array.from({ length: 72 }, (_, i) => i / 30);

  it("身ぶりが無いときは、腕を下ろしたまま回らず、手に何も持たない", () => {
    expect(gesturePoseAt(null, 1)).toEqual(REST_GESTURE);
  });

  it("手帳を見るときだけ手帳を、スマホを見るときだけスマホを持ち、頭を前に倒す", () => {
    const book = gesturePoseAt("handbook", 0.5);
    expect(book.handbook).toBe(1);
    expect(book.phone).toBe(0);
    expect(book.headNod).toBeGreaterThan(0);
    const phone = gesturePoseAt("phone", 0.5);
    expect(phone.phone).toBe(1);
    expect(phone.handbook).toBe(0);
    for (const g of ["wave", "spin", "banzai"] as const) {
      expect(gesturePoseAt(g, 0.5).handbook).toBe(0);
      expect(gesturePoseAt(g, 0.5).phone).toBe(0);
    }
  });

  it("回るのは1回だけで、回り終えると向きが元に戻る", () => {
    const spins = times.map((t) => gesturePoseAt("spin", t).spin);
    expect(Math.max(...spins)).toBeGreaterThan(Math.PI);
    expect(gesturePoseAt("spin", 1.3).spin).toBe(0);
    expect(gesturePoseAt("spin", 2.3).spin).toBe(0);
  });

  it("万歳は両手を上げ、上げすぎない。手を振るのは右手だけ", () => {
    const lefts = times.map((t) => gesturePoseAt("banzai", t).armLeft);
    expect(Math.max(...lefts)).toBeGreaterThan(BANZAI_RAISE * 0.9);
    expect(Math.max(...lefts)).toBeLessThanOrEqual(BANZAI_RAISE);
    for (const t of times) {
      const wave = gesturePoseAt("wave", t);
      expect(wave.armLeft).toBe(0);
      expect(wave.armRight).toBeGreaterThan(1.5);
    }
  });

  it("身ぶりが替わるとき、腕は少しずつ動く（回る量はそのまま）", () => {
    const next = blendGesture(REST_GESTURE, gesturePoseAt("banzai", 0.4), 1 / 30);
    expect(next.armLeft).toBeGreaterThan(0);
    expect(next.armLeft).toBeLessThan(gesturePoseAt("banzai", 0.4).armLeft);
    expect(blendGesture(REST_GESTURE, gesturePoseAt("spin", 0.6), 1 / 30).spin).toBe(gesturePoseAt("spin", 0.6).spin);
  });
});

describe("2D の身ぶり（Issue #221）", () => {
  it("身ぶりの名前を絵に付け、手帳とスマホの絵を持つ。文字は入れない", () => {
    const html = renderToStaticMarkup(
      createElement(Puppet2D, { activity: "thinking", relief: false, gesture: "handbook" }),
    );
    expect(html).toContain('data-gesture="handbook"');
    expect(html).toContain("p2d-prop-handbook");
    expect(html).toContain("p2d-prop-phone");
    expect(html.replace(/<[^>]*>/g, "").trim()).toBe("");
  });

  it("身ぶりが無いときと、吹き出しの横の小さな顔には、身ぶりの名前を付けない", () => {
    expect(renderToStaticMarkup(createElement(Puppet2D, { activity: "thinking", relief: false }))).not.toContain(
      "data-gesture",
    );
    expect(renderToStaticMarkup(createElement(Puppet2DFace, { activity: "thinking" }))).not.toContain("data-gesture");
  });
});
