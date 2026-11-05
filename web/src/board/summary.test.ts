// ボードの集計（Issue #97、#101）。架空データからの算数だけを確かめる
import { describe, expect, it } from "vitest";
import {
  COVER_GUIDE_DAYS,
  DEMAND,
  HQ,
  INBOUND,
  NEEDS,
  PATIENTS,
  SHELTERS,
  SITES,
  STOCK,
  SYNC,
  inboundKind,
  type StockRow,
} from "./data";
import {
  caseRows,
  criticalItems,
  daysLeft,
  heatCell,
  inboundSummary,
  levelOf,
  nextAction,
  pendingSummary,
  roundDays,
  shelterRows,
  stockStatus,
  todaySummary,
  trendSeries,
  unknownCounts,
} from "./summary";

const stock = (site: StockRow["site"], onHand: number | null, dailyUse: number | null): StockRow => ({
  site,
  item: "x",
  category: "",
  unit: "錠",
  onHand,
  dailyUse,
});

describe("架空データの形", () => {
  it("救護所は4か所で、どの救護所にも全品目の在庫の行がある", () => {
    expect(SHELTERS).toHaveLength(4);
    for (const site of [...SHELTERS, HQ]) {
      expect(STOCK.filter((r) => r.site === site)).toHaveLength(9);
    }
  });

  it("人物の名前・実在の製品名らしい語を含まず、連絡先の番号は架空と明記されリンクにしない", () => {
    const text = JSON.stringify({ STOCK, PATIENTS, INBOUND, DEMAND, SYNC, SITES, NEEDS });
    expect(text).not.toMatch(/さん|様|氏名|名前は[^分]/);
    for (const item of new Set(STOCK.map((r) => r.item))) {
      expect(item).toMatch(/[A-H]|消毒薬/);
    }
    for (const s of SITES) {
      expect(s.phone).toMatch(/^000-0000-000\d（架空/);
      expect(s.phone).not.toMatch(/tel:/);
    }
  });

  it("在庫 0・未確認（null）・出庫のペース不明（null）の例がそれぞれある", () => {
    const shelters = STOCK.filter((r) => r.site !== HQ);
    expect(shelters.some((r) => r.onHand === 0)).toBe(true);
    expect(shelters.some((r) => r.onHand === null)).toBe(true);
    expect(shelters.some((r) => r.onHand !== null && r.onHand > 0 && r.dailyUse === null)).toBe(true);
  });

  it("入荷・融通は本部向け・現地向け・融通に分かれ、照会中は到着未定", () => {
    expect(INBOUND.map(inboundKind)).toEqual(expect.arrayContaining(["本部向けの入荷", "現地向けの搬送", "救護所どうしの融通"]));
    for (const r of INBOUND.filter((x) => x.status === "卸に照会中・到着未定")) expect(r.eta).toBe("未定");
  });
});

describe("残り日数と状態（0 と不明を混ぜない）", () => {
  it("残り日数は在庫÷1日の出庫を丸めない。未確認・ペース不明・本部備蓄は null", () => {
    expect(daysLeft(stock("救護所A", 96, 48))).toBe(2);
    expect(daysLeft(stock("救護所A", 10, 3))).toBeCloseTo(3.3333, 3);
    expect(roundDays(10 / 3)).toBe(3.3);
    expect(daysLeft(stock("救護所A", null, 48))).toBeNull();
    expect(daysLeft(stock("救護所A", 10, null))).toBeNull();
    expect(daysLeft(stock(HQ, 100, 0))).toBeNull();
  });

  it("状態：在庫 0 は在庫切れ、null は未確認、在庫ありでペース不明は見込み算出不可", () => {
    expect(stockStatus(stock("救護所A", 0, 10))).toBe("在庫切れ");
    expect(stockStatus(stock("救護所A", null, 10))).toBe("未確認");
    expect(stockStatus(stock("救護所A", 10, null))).toBe("見込み算出不可");
    expect(stockStatus(stock("救護所A", 20, 10))).toBe("在庫切れ見込み");
    expect(stockStatus(stock("救護所A", 100, 10))).toBe("余裕あり");
    expect(stockStatus(stock(HQ, 100, 0))).toBe("余裕あり");
  });

  it("判定は丸める前の値で行う（2.96 日は 3.0 と表示されても目安より短い）", () => {
    const r = stock("救護所A", 74, 25); // 2.96
    expect(roundDays(daysLeft(r) ?? 0)).toBe(3);
    expect(stockStatus(r)).toBe("在庫切れ見込み");
    expect(levelOf(daysLeft(r) ?? 0)).toBe("bad");
  });

  it("段階は目安の日数で決まる", () => {
    expect(levelOf(COVER_GUIDE_DAYS - 0.5)).toBe("bad");
    expect(levelOf(COVER_GUIDE_DAYS)).toBe("warn");
    expect(levelOf(COVER_GUIDE_DAYS + 2)).toBe("ok");
  });
});

describe("集計", () => {
  it("今日の患者は最新の日付の4か所の合計", () => {
    const t = todaySummary(PATIENTS);
    expect(t.date).toBe("2026-11-05");
    expect(t.patients).toBe(55 + 40 + 30 + 29);
    expect(t.chronic).toBe(36 + 25 + 19 + 18);
  });

  it("切れる見込みは本部備蓄を除き短い順。在庫 0 は 0 日で、未確認・ペース不明は含めない", () => {
    const c = criticalItems(STOCK);
    expect(c.every((x) => x.site !== HQ)).toBe(true);
    expect(c[0]).toEqual({ site: "救護所C", item: "骨粗鬆症薬G（週1）", days: 0 });
    for (let i = 1; i < c.length; i++) expect(c[i].days).toBeGreaterThanOrEqual(c[i - 1].days);
    expect(c.every((x) => x.days < COVER_GUIDE_DAYS)).toBe(true);
    expect(c.some((x) => x.site === "救護所D" && x.item === "吸入薬D")).toBe(false);
    expect(c.some((x) => x.site === "救護所A" && x.item === "骨粗鬆症薬G（週1）")).toBe(false);
    expect(unknownCounts(STOCK)).toEqual({ unconfirmed: 1, noPace: 1 });
  });

  it("記録の形になっていない数は、未着と転記待ちの合計。通信なしの救護所の数", () => {
    expect(pendingSummary(SYNC)).toEqual({ pending: 42 + 6 + 55, undelivered: 42 + 55, awaiting: 6, offlineSites: 2 });
  });

  it("入荷の件数は受領済みを除き、日付が未定のものを数える", () => {
    expect(inboundSummary(INBOUND)).toEqual({ count: 9, undated: 1 });
  });

  it("救護所ごとの行は、在庫でまかなえる日数が短い順で、4行", () => {
    const rows = shelterRows(STOCK, PATIENTS, SYNC, DEMAND);
    expect(rows.map((r) => r.site)).toEqual(["救護所B", "救護所D", "救護所A", "救護所C"]);
    expect(rows[0].patients).toBe(40);
    expect(rows[0].pending).toBe(42);
    expect(rows[0].critical.join("")).toContain("抗てんかん薬C（あと1日）");
  });

  it("表のセル：救護所は日数、本部備蓄は有無、在庫 0 は「切れ」、null は「未確認」「算出不可」", () => {
    expect(heatCell(STOCK, "救護所A", "血糖降下薬B")).toMatchObject({ label: "2", level: "bad" });
    expect(heatCell(STOCK, HQ, "降圧薬A")).toMatchObject({ label: "有", level: "hq" });
    expect(heatCell(STOCK, HQ, "抗てんかん薬C")).toMatchObject({ label: "切れ", level: "bad" });
    expect(heatCell(STOCK, "救護所D", "吸入薬D")).toMatchObject({ label: "未確認", level: "none" });
    expect(heatCell(STOCK, "救護所A", "骨粗鬆症薬G（週1）")).toMatchObject({ label: "算出不可", level: "none" });
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

describe("確認・手配が必要な品目（Issue #101）", () => {
  const cases = caseRows(STOCK, INBOUND, NEEDS, SITES, SYNC);

  it("余裕ありを除き、在庫切れ → 未確認 → 見込みが近い順 → 見込み算出不可。本部備蓄は行にしない", () => {
    expect(cases.every((c) => c.site !== HQ && c.status !== "余裕あり")).toBe(true);
    const order = ["在庫切れ", "未確認", "在庫切れ見込み", "見込み算出不可"];
    const idx = cases.map((c) => order.indexOf(c.status));
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
    const forecast = cases.filter((c) => c.status === "在庫切れ見込み").map((c) => c.days ?? 0);
    for (let i = 1; i < forecast.length; i++) expect(forecast[i]).toBeGreaterThanOrEqual(forecast[i - 1]);
    expect(cases.length).toBe(criticalItems(STOCK).length + 2);
  });

  it("救護所C の骨粗鬆症薬G：現地 0、本部 0、卸に照会中・到着未定、次の確認は卸の回答", () => {
    const c = cases[0];
    expect(c).toMatchObject({ site: "救護所C", item: "骨粗鬆症薬G（週1）", status: "在庫切れ", onHand: 0, hqOnHand: 0 });
    expect(c.hqInbound.map((r) => r.status)).toEqual(["卸に照会中・到着未定"]);
    expect(c.siteInbound).toEqual([]);
    expect(c.supply).toContain("卸に照会中・到着未定");
    expect(c.next).toBe("卸の回答を確認する");
    expect(c.need).toMatchObject({ qty: 3 });
  });

  it("未確認と見込み算出不可は在庫切れと区別され、次の確認が違う。通信なしの拠点は代わりの手段を添える", () => {
    const unconfirmed = cases.find((c) => c.status === "未確認");
    expect(unconfirmed).toMatchObject({ site: "救護所D", item: "吸入薬D", onHand: null, days: null });
    expect(unconfirmed?.next).toContain("現地の在庫を確認する");
    expect(unconfirmed?.next).toContain("通信なし");
    expect(unconfirmed?.next).toContain("連絡員");
    const noPace = cases.find((c) => c.status === "見込み算出不可");
    expect(noPace).toMatchObject({ site: "救護所A", item: "骨粗鬆症薬G（週1）", onHand: 12, days: null });
    expect(noPace?.next).toBe("現地の出庫のペースを確認する");
  });

  it("現地向けの搬送があれば到着の確認、本部に在庫があれば搬送の確認。照会中の数量は現地の在庫に足さない", () => {
    const b = cases.find((c) => c.site === "救護所B" && c.item === "吸入薬D");
    expect(b?.siteInbound.map((r) => r.id)).toEqual(["2"]);
    expect(b?.next).toContain("搬送の到着を確認する");
    expect(b?.onHand).toBe(3);
    expect(nextAction("在庫切れ見込み", 100, [], [], undefined, false)).toBe("本部備蓄からの搬送を確認する");
    expect(nextAction("在庫切れ", 0, [], [], undefined, false)).toBe("融通できる救護所を確認する");
    // 受領済みの搬送（id 10）は、これからの搬送として数えない
    expect(INBOUND.find((r) => r.id === "10")?.status).toBe("受領");
    expect(cases.some((c) => c.siteInbound.some((r) => r.id === "10"))).toBe(false);
  });

  it("次の確認の文に、薬の中身の判断や服薬の助言が無い", () => {
    for (const c of cases) {
      expect(c.next).not.toMatch(/飲|服用|処方|代替|代わりの薬|優先/);
    }
  });
});
