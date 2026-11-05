// ボードの集計（Issue #97）。架空データからの算数だけを確かめる
import { describe, expect, it } from "vitest";
import { COVER_GUIDE_DAYS, DEMAND, HQ, INBOUND, PATIENTS, SHELTERS, STOCK, SYNC } from "./data";
import {
  criticalItems,
  daysLeft,
  heatCell,
  inboundSummary,
  levelOf,
  pendingSummary,
  shelterRows,
  todaySummary,
  trendSeries,
} from "./summary";

describe("架空データの形", () => {
  it("救護所は4か所で、どの救護所にも全品目の在庫の行がある", () => {
    expect(SHELTERS).toHaveLength(4);
    for (const site of [...SHELTERS, HQ]) {
      expect(STOCK.filter((r) => r.site === site)).toHaveLength(9);
    }
  });

  it("人物の名前・実在の製品名らしい語を含まない（薬は仮名）", () => {
    const text = JSON.stringify({ STOCK, PATIENTS, INBOUND, DEMAND, SYNC });
    expect(text).not.toMatch(/さん|様|氏名|名前は[^分]/);
    for (const item of new Set(STOCK.map((r) => r.item))) {
      expect(item).toMatch(/[A-H]|消毒薬/);
    }
  });
});

describe("集計", () => {
  it("残り日数は在庫÷1日の出庫。本部備蓄は null", () => {
    expect(daysLeft({ site: "救護所A", item: "x", category: "", unit: "錠", onHand: 96, dailyUse: 48 })).toBe(2);
    expect(daysLeft({ site: HQ, item: "x", category: "", unit: "錠", onHand: 100, dailyUse: 0 })).toBeNull();
  });

  it("段階は目安の日数で決まる", () => {
    expect(levelOf(COVER_GUIDE_DAYS - 0.5)).toBe("bad");
    expect(levelOf(COVER_GUIDE_DAYS)).toBe("warn");
    expect(levelOf(COVER_GUIDE_DAYS + 2)).toBe("ok");
  });

  it("今日の患者は最新の日付の4か所の合計", () => {
    const t = todaySummary(PATIENTS);
    expect(t.date).toBe("2026-11-05");
    expect(t.patients).toBe(55 + 40 + 30 + 29);
    expect(t.chronic).toBe(36 + 25 + 19 + 18);
  });

  it("切れる見込みは本部備蓄を除き、短い順。在庫0は0日", () => {
    const c = criticalItems(STOCK);
    expect(c.every((x) => x.site !== HQ)).toBe(true);
    expect(c[0]).toEqual({ site: "救護所C", item: "骨粗鬆症薬G（週1）", days: 0 });
    for (let i = 1; i < c.length; i++) expect(c[i].days).toBeGreaterThanOrEqual(c[i - 1].days);
    expect(c.every((x) => x.days < COVER_GUIDE_DAYS)).toBe(true);
  });

  it("届いていない記録の合計と、通信なしの救護所の数", () => {
    expect(pendingSummary(SYNC)).toEqual({ pending: 42 + 6 + 55, offlineSites: 2 });
  });

  it("入荷の件数と、日付が未定のもの", () => {
    expect(inboundSummary(INBOUND)).toEqual({ count: 9, undated: 1 });
  });

  it("救護所ごとの行は、在庫でまかなえる日数が短い順で、4行", () => {
    const rows = shelterRows(STOCK, PATIENTS, SYNC, DEMAND);
    expect(rows.map((r) => r.site)).toEqual(["救護所B", "救護所D", "救護所A", "救護所C"]);
    expect(rows[0].patients).toBe(40);
    expect(rows[0].pending).toBe(42);
    expect(rows[0].critical.join("")).toContain("抗てんかん薬C（あと1日）");
  });

  it("表のセル：救護所は日数、本部備蓄は有無、在庫0は「切れ」", () => {
    expect(heatCell(STOCK, "救護所A", "血糖降下薬B")).toMatchObject({ label: "2", level: "bad" });
    expect(heatCell(STOCK, HQ, "降圧薬A")).toMatchObject({ label: "有", level: "hq" });
    expect(heatCell(STOCK, HQ, "抗てんかん薬C")).toMatchObject({ label: "切れ", level: "bad" });
    expect(heatCell(STOCK, "救護所A", "無い薬")).toBeNull();
  });

  it("推移は救護所ごとに日付順の5点", () => {
    const s = trendSeries(PATIENTS);
    expect(s).toHaveLength(4);
    for (const x of s) {
      expect(x.points).toHaveLength(5);
      expect(x.points.map((p) => p.date)).toEqual([...x.points.map((p) => p.date)].sort());
    }
  });
});
