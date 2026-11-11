// ボードで1か所にまとめた決まり（時刻の定数・最終報告の求め方・カルテの key のハッシュ・日時の文字）が、
// まとめる前と同じ値を返すこと（Issue #299）
import { describe, expect, it } from "vitest";
import { lastReportMinutes } from "../screens/Board";
import { chatStatus } from "./chat/status";
import { HQ, SHELTERS, SITES, SYNC } from "./data";
import { ARRIVAL_MINUTE_OF_DAY, DEPART_MINUTE_OF_DAY, clockText, demoReducer, initialDemo, lastReportAt } from "./demo";
import { sampleForChart } from "./karte/client";
import { KARTE_SAMPLES } from "./karte/samples";
import { keyHash, sampleDraft } from "./review";
import { SAMPLE_DRAFTS } from "./accessText";

/** まとめる前の式（review.ts の sampleIndex と karte/client.ts の sampleForChart にあったもの） */
function hashBefore(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

const KEYS = ["", "x", "A", "救護所A|架空 一郎", "救護所C|x", "救護所D|見本 花子|2", "🙂 絵文字"];

describe("時刻の定数（Issue #299）", () => {
  it("出発は 07:00、到着は 10:00（demo.ts だけで定める）", () => {
    expect(DEPART_MINUTE_OF_DAY).toBe(7 * 60);
    expect(ARRIVAL_MINUTE_OF_DAY).toBe(10 * 60);
  });
});

describe("最終報告の求め方（Issue #299）", () => {
  it("demo.ts の lastReportAt は、ボードの lastReportMinutes と同じ値（時計を進めても）", () => {
    let state = initialDemo();
    for (let i = 0; i < 4; i += 1) {
      for (const site of [...SHELTERS, HQ]) expect(lastReportAt(state.sync, site)).toBe(lastReportMinutes(state, site));
      state = demoReducer(state, { type: "tick", hours: 3 });
    }
  });

  it("チャットの状況の「最終報告から何分」は、同じ求め方から出す", () => {
    const state = demoReducer(initialDemo(), { type: "tick", hours: 2 });
    for (const s of chatStatus(state).sites) {
      const site = SITES.find((x) => x.site === `救護所${s.site}`)!.site;
      const at = lastReportAt(state.sync, site);
      expect(s.lastReportMinutesAgo).toBe(at === null ? null : Math.max(0, state.minutes - at));
    }
  });

  it("同期の行を渡さなければ、在庫の確認の時刻だけから求める", () => {
    for (const site of SHELTERS) {
      const checked = SITES.find((s) => s.site === site)?.stockCheckedAt;
      const withSync = lastReportAt(SYNC, site);
      const withoutSync = lastReportAt([], site);
      if (!checked) expect(withoutSync).toBeNull();
      else expect(withoutSync).not.toBeNull();
      if (withoutSync !== null && withSync !== null) expect(withSync).toBeGreaterThanOrEqual(withoutSync);
    }
  });
});

describe("カルテの key のハッシュ（Issue #299）", () => {
  it("keyHash は、まとめる前の式と同じ値", () => {
    for (const key of KEYS) expect(keyHash(key)).toBe(hashBefore(key));
  });

  it("同じカルテには、まとめる前と同じ見本を選ぶ", () => {
    for (const key of KEYS) {
      expect(sampleForChart(key)).toBe(KARTE_SAMPLES[hashBefore(key) % KARTE_SAMPLES.length]);
      const lines = hashBefore(key) % 2 === 0 ? SAMPLE_DRAFTS.clean : SAMPLE_DRAFTS.withError;
      expect(sampleDraft(key).lines).toBe(lines);
    }
  });
});

describe("日時の文字（Issue #299）", () => {
  it("日をまたぐ・前の日に戻るときも、今までと同じ形", () => {
    expect(clockText(0)).toBe("11/05 09:30");
    expect(clockText(14 * 60 + 29)).toBe("11/05 23:59");
    expect(clockText(14 * 60 + 30)).toBe("11/06 00:00");
    expect(clockText(-10 * 60)).toBe("11/04 23:30");
  });
});
