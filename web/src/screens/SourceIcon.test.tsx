import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EVENTS } from "../flow/content";
import type { EventId } from "../flow/types";
import { EVENT_FOCUS, LOST_BY_EVENT, SourceChip, SourceIcon, type IllustrationId } from "./SourceIcon";

const EVENT_IDS = Object.keys(EVENTS) as EventId[];

describe("出来事で使えなくなる情報源（PRD「出来事で使えなくなるもの」）", () => {
  it("すべての出来事に対応があり、大きく示すものは使えなくなるものに含まれる", () => {
    for (const id of EVENT_IDS) {
      const focus = EVENT_FOCUS[id];
      if (focus !== null) expect(LOST_BY_EVENT[id]).toContain(focus);
    }
  });

  it("使えなくなるものが無い出来事（係の交代）では、何も使えなくならない", () => {
    for (const id of EVENT_IDS) {
      if (EVENTS[id].unavailable === null) {
        expect(LOST_BY_EVENT[id]).toEqual([]);
        expect(EVENT_FOCUS[id]).toBeNull();
      }
    }
  });

  it("電池切れではアプリも使えないが、通信の途絶ではスマホに保存したものは使える", () => {
    expect(LOST_BY_EVENT.battery).toEqual(expect.arrayContaining(["smartphone", "online"]));
    expect(LOST_BY_EVENT.network).not.toContain("smartphone");
  });
});

describe("頼りにしているもの", () => {
  it("使えなくなったことを、色だけでなく文字でも示す", () => {
    const html = renderToStaticMarkup(<SourceChip source="smartphone" lost />);
    expect(html).toContain("スマートフォン");
    expect(html).toContain("（使えない）");
    expect(renderToStaticMarkup(<SourceChip source="smartphone" lost={false} />)).not.toContain("使えない");
  });
});

describe("情報源と薬のまわりのものの絵（A-04）", () => {
  const ids: IllustrationId[] = ["smartphone", "online", "notebook", "family", "clinic", "leaflet", "bag"];

  it("お薬の説明書と薬の袋を含め、どの絵も描かれ、読み上げない飾りで、字を含まない", () => {
    for (const id of ids) {
      const html = renderToStaticMarkup(<SourceIcon id={id} />);
      expect(html).toMatch(/^<svg class="source-icon"[^>]*aria-hidden="true"/);
      expect(html).toContain('focusable="false"');
      expect(html).toMatch(/<(path|rect|circle)/);
      expect(html).not.toContain("<text");
      expect(html).not.toContain("<title");
    }
  });

  it("説明書と袋はそれぞれ別の絵で、ほかの絵と同じものではない", () => {
    const drawn = ids.map((id) => renderToStaticMarkup(<SourceIcon id={id} />));
    expect(new Set(drawn).size).toBe(ids.length);
  });
});

describe("スマホと雲の絵（2026-11-05 オーナーの指摘：電池・波線は要らない）", () => {
  it("カードなどで使うスマホの絵には電池の印が無く、電池切れの場面でだけ出す", () => {
    expect(renderToStaticMarkup(<SourceIcon id="smartphone" />)).not.toContain("battery-level");
    expect(renderToStaticMarkup(<SourceIcon id="smartphone" battery />)).toContain("battery-level");
  });

  it("アプリ・マイナポータルの絵は雲だけ（線は1本）", () => {
    const html = renderToStaticMarkup(<SourceIcon id="online" />);
    expect(html.match(/<path/g)).toHaveLength(1);
  });
});
