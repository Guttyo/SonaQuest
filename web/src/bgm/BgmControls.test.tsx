import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BGM_LABELS } from "../flow/content";
import { BgmControls } from "./BgmControls";
import type { BgmSnapshot } from "./bgm";

const off: BgmSnapshot = { available: true, on: false, volume: 40, ducked: false };
const noop = () => {};

function render(snapshot: BgmSnapshot, initialOpen = false): string {
  return renderToStaticMarkup(
    <BgmControls snapshot={snapshot} onToggle={noop} onVolume={noop} initialOpen={initialOpen} />,
  );
}

describe("BGM の操作（B-03）", () => {
  it("閉じた状態でも、ヘッダーのボタンに今の状態を文字で出す", () => {
    const html = render(off);
    expect(html).toContain(BGM_LABELS.name);
    expect(html).toContain(BGM_LABELS.off);
    expect(html).toContain('aria-expanded="false"');
    expect(render({ ...off, on: true })).toContain(BGM_LABELS.on);
  });

  it("開くと、鳴らす・止めるボタン（aria-pressed）と音量の欄が出る", () => {
    const html = render(off, true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain(BGM_LABELS.toggle);
    expect(html).toContain('type="range"');
    expect(html).toContain(`${BGM_LABELS.volume}：40%`);
    expect(html).toContain('aria-valuetext="40%"');
    expect(render({ ...off, on: true }, true)).toContain('aria-pressed="true"');
  });

  it("Web Audio が使えないときは、使えないことを文字で示し、鳴らすボタンを出さない", () => {
    const html = render({ ...off, available: false }, true);
    expect(html).toContain(BGM_LABELS.unavailable);
    expect(html).not.toContain("aria-pressed");
    expect(html).not.toContain('type="range"');
  });
});
