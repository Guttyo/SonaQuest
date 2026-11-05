import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BGM_EXTRA_LABELS, BGM_LABELS } from "../flow/content";
import { BgmControls } from "./BgmControls";
import type { BgmSnapshot } from "./bgm";

const off: BgmSnapshot = {
  available: true,
  on: false,
  volume: 40,
  ducked: false,
  reducedMotion: false,
  locked: false,
};
const noop = () => {};

function render(snapshot: BgmSnapshot, initialOpen = false): string {
  return renderToStaticMarkup(
    <BgmControls snapshot={snapshot} onToggle={noop} onVolume={noop} initialOpen={initialOpen} />,
  );
}

/** ヘッダーに常に見えている最初のボタン（開いた欄の外） */
function headerToggle(html: string): string {
  return html.slice(0, html.indexOf("</button>"));
}

describe("BGM の操作（B-03）", () => {
  it("閉じた状態でも、ヘッダーの「BGM」ボタンが1回で鳴らす・止める（aria-pressed）で、今の状態を文字で出す", () => {
    const html = render(off);
    const toggle = headerToggle(html);
    expect(toggle).toContain(BGM_LABELS.name);
    expect(toggle).toContain(BGM_LABELS.off);
    expect(toggle).toContain('aria-pressed="false"');
    expect(toggle).not.toContain("disabled");
    expect(headerToggle(render({ ...off, on: true }))).toContain('aria-pressed="true"');
    expect(headerToggle(render({ ...off, on: true }))).toContain(BGM_LABELS.on);
    // 音量の欄は隣の「音量」ボタンで開く
    expect(html).toContain(BGM_EXTRA_LABELS.volumeOpener);
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('type="range"');
  });

  it("「音量」を押して開くと、鳴らす・止めるボタン（aria-pressed）と音量の欄が出る", () => {
    const html = render(off, true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(BGM_LABELS.toggle);
    expect(html).toContain('type="range"');
    expect(html).toContain(`${BGM_LABELS.volume}：40%`);
    expect(html).toContain('aria-valuetext="40%"');
    expect(render({ ...off, on: true }, true).match(/aria-pressed="true"/g)).toHaveLength(2);
  });

  it("Web Audio が使えないときは、BGM ボタンを押せなくし、使えないことを文字で示す", () => {
    const html = render({ ...off, available: false }, true);
    expect(headerToggle(html)).toContain("disabled");
    expect(html).toContain(BGM_LABELS.unavailable);
    expect(html).not.toContain(BGM_LABELS.toggle);
    expect(html).not.toContain('type="range"');
  });

  it("動きを減らす設定のときは、BGM ボタンを押せなくし、鳴らさない理由を文字で示す", () => {
    const html = render({ ...off, reducedMotion: true }, true);
    expect(headerToggle(html)).toContain("disabled");
    expect(html).toContain(BGM_EXTRA_LABELS.reducedMotion);
    expect(html).not.toContain(BGM_LABELS.toggle);
    expect(html).not.toContain('type="range"');
  });

  it("終わりの画面では、BGM ボタンを押せなくし、止めたことを文字で示す", () => {
    const html = render({ ...off, locked: true }, true);
    expect(headerToggle(html)).toContain("disabled");
    expect(html).toContain(BGM_EXTRA_LABELS.ended);
    expect(html).not.toContain(BGM_LABELS.toggle);
  });
});
