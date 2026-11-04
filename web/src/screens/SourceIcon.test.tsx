import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EVENTS } from "../flow/content";
import type { EventId } from "../flow/types";
import { EVENT_FOCUS, LOST_BY_EVENT, SourceChip } from "./SourceIcon";

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
