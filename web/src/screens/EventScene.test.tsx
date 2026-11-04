import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EVENTS, STOP_MESSAGE } from "../flow/content";
import type { EventId } from "../flow/types";
import { EventScene, EventVisual } from "./EventScene";
import { Stopped } from "./Stopped";

const EVENT_IDS = Object.keys(EVENTS) as EventId[];

function scene(id: EventId): string {
  return renderToStaticMarkup(<EventScene event={id} onContinue={() => {}} />);
}

/** 絵の部分（aria-hidden の囲み）だけを取り出す */
function visual(id: EventId): string {
  return renderToStaticMarkup(<EventVisual event={id} />);
}

describe("出来事の場面の絵と文（B-01、Issue #54）", () => {
  it("6候補がそろっている", () => {
    expect(EVENT_IDS).toHaveLength(6);
  });

  it.each(EVENT_IDS)("%s：読み上げない飾りの絵と、固定文の文がある", (id) => {
    const html = scene(id);
    expect(html).toContain(`<div class="event-visual event-visual-${id}" aria-hidden="true">`);
    expect(visual(id)).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(visual(id)).toMatch(/<(path|rect|circle)/);
    // 絵に文字を入れない（意味は文で示す）
    expect(visual(id)).not.toContain("<text");
    expect(visual(id)).not.toContain("<title");
    expect(html).toContain(EVENTS[id].text);
    const unavailable = EVENTS[id].unavailable;
    if (unavailable !== null) {
      expect(html).toContain("使えなくなったもの：");
      expect(html).toContain(unavailable);
    }
  });

  it("使えなくなったものがある5つは斜線を引き、係の交代では斜線を引かずに係の入れ替わりを描く", () => {
    for (const id of EVENT_IDS) {
      const html = visual(id);
      if (EVENTS[id].unavailable === null) {
        expect(html).not.toContain("event-slash");
        expect(html).toContain("event-handover");
        expect(scene(id)).not.toContain("使えなくなったもの：");
      } else {
        expect(html).toContain("event-slash");
        expect(html).toContain("event-mark");
      }
    }
  });

  it("6つの絵はそれぞれ違う", () => {
    expect(new Set(EVENT_IDS.map(visual)).size).toBe(EVENT_IDS.length);
  });

  it("「続ける」は演出を待たずに押せる（無効にしない）", () => {
    for (const id of EVENT_IDS) {
      const html = scene(id);
      expect(html).toContain("続ける");
      expect(html).not.toContain("disabled");
    }
  });

  it("中断の画面には出来事の絵を出さない", () => {
    const html = renderToStaticMarkup(<Stopped reason="manual" onRestart={() => {}} />);
    expect(html).toContain(STOP_MESSAGE[0]);
    expect(html).not.toContain("event-visual");
    expect(html).not.toContain("event-scene");
  });
});
