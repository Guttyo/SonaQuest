import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TalkButton, talkButtonHandlers } from "./TalkButton";
import type { TalkSnapshot } from "./talk";

const ready: TalkSnapshot = { mic: "ready", listening: false, interim: "", notice: null };

function counter() {
  const calls = { press: 0, release: 0 };
  return { calls, onPress: () => void calls.press++, onRelease: () => void calls.release++ };
}

/** 試験用の偽の事件（使う部分だけ） */
const pointer = (button = 0) =>
  ({ button, pointerId: 1, preventDefault: () => {}, currentTarget: { setPointerCapture: () => {} } }) as unknown as PointerEvent<HTMLButtonElement>;
const key = (k: string, repeat = false) => ({ key: k, repeat, preventDefault: () => {} }) as unknown as KeyboardEvent<HTMLButtonElement>;

describe("「押して話す」の押し方ごとのハンドラー（Issue #295）", () => {
  it("tap（訓練の既定）：click だけで、1回押すと onPress がちょうど1回呼ばれる。pointerdown・keydown は付けない", () => {
    const { calls, onPress, onRelease } = counter();
    const h = talkButtonHandlers("tap", onPress, onRelease);
    expect(Object.keys(h)).toEqual(["onClick"]);
    expect(h.onPointerDown).toBeUndefined();
    expect(h.onKeyDown).toBeUndefined();
    expect(h.onKeyUp).toBeUndefined();
    h.onClick?.({} as MouseEvent<HTMLButtonElement>);
    expect(calls).toEqual({ press: 1, release: 0 });
  });

  it("hold（ボードの文字起こし）：click は付けず、pointerdown・Enter・Space で onPress、離すと onRelease（今までどおり）", () => {
    const { calls, onPress, onRelease } = counter();
    const h = talkButtonHandlers("hold", onPress, onRelease);
    expect(h.onClick).toBeUndefined();
    h.onPointerDown?.(pointer());
    expect(calls.press).toBe(1);
    // 左ボタン以外は押したことにしない
    h.onPointerDown?.(pointer(2));
    expect(calls.press).toBe(1);
    h.onPointerUp?.(pointer());
    expect(calls.release).toBe(1);
    h.onKeyDown?.(key(" "));
    h.onKeyDown?.(key("Enter"));
    // 押しっぱなしの繰り返しと、ほかのキーは数えない
    h.onKeyDown?.(key(" ", true));
    h.onKeyDown?.(key("a"));
    expect(calls.press).toBe(3);
    h.onKeyUp?.(key(" "));
    h.onKeyUp?.(key("a"));
    expect(calls.release).toBe(2);
    expect(h.onPointerCancel).toBe(onRelease);
    expect(h.onLostPointerCapture).toBe(onRelease);
    expect(h.onBlur).toBe(onRelease);
  });
});

describe("「押して話す」の状態の文の id（Issue #295）", () => {
  it("固定の id を使わず、2つ並べても別の id になり、それぞれ自分の状態の文を指す", () => {
    const html = renderToStaticMarkup(
      <>
        <TalkButton snapshot={ready} inserted={false} onPress={() => {}} onRelease={() => {}} />
        <TalkButton snapshot={ready} inserted={false} onPress={() => {}} onRelease={() => {}} style="hold" />
      </>,
    );
    expect(html).not.toContain('id="talk-status"');
    const described = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map((m) => m[1]);
    const statuses = [...html.matchAll(/<p id="([^"]+)" class="talk-status/g)].map((m) => m[1]);
    expect(described).toHaveLength(2);
    expect(statuses).toEqual(described);
    expect(new Set(described).size).toBe(2);
  });
});
