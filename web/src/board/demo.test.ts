// ボードのデモの reducer（Issue #102）。メモリの中の在庫の足し引きと時刻だけを確かめる
import { describe, expect, it } from "vitest";
import { HQ, INBOUND, STOCK, SYNC } from "./data";
import { chartsFor, clockText, demoReducer, initialDemo, minutesAt, patientsWithExtra, type DemoAction } from "./demo";
import { caseRows, stockStatus } from "./summary";
import { SITES } from "./data";

const find = (s: ReturnType<typeof initialDemo>, site: string, item: string) => s.stock.find((r) => r.site === site && r.item === item)!;

describe("架空の時計", () => {
  it("開始は 11/05 09:30 で、分を足すと進む。日付もまたぐ", () => {
    expect(clockText(0)).toBe("11/05 09:30");
    expect(clockText(90)).toBe("11/05 11:00");
    expect(clockText(24 * 60)).toBe("11/06 09:30");
    expect(minutesAt("2026-11-06", 10 * 60)).toBe(24 * 60 + 30);
  });

  it("最初の状態は架空データの写しで、元のデータを書き換えない", () => {
    const s = initialDemo();
    expect(s.minutes).toBe(0);
    expect(s.running).toBe(false);
    expect(s.stock).toEqual(STOCK);
    expect(s.stock).not.toBe(STOCK);
    const t = demoReducer(s, { type: "tick", hours: 24 });
    expect(STOCK.find((r) => r.site === "救護所A" && r.item === "降圧薬A")?.onHand).toBe(420);
    expect(t.stock).not.toBe(s.stock);
    expect(find(s, "救護所A", "降圧薬A").onHand).toBe(420);
  });
});

describe("時計を進める", () => {
  it("出庫のペースで救護所の在庫が減り、0 で止まる。本部備蓄・未確認・ペース不明は変わらない", () => {
    const s = demoReducer(initialDemo(), { type: "tick", hours: 24 });
    expect(find(s, "救護所A", "降圧薬A").onHand).toBe(420 - 60);
    expect(find(s, "救護所B", "抗てんかん薬C").onHand).toBe(0);
    expect(find(s, HQ, "降圧薬A").onHand).toBe(3000);
    expect(find(s, "救護所D", "吸入薬D").onHand).toBeNull();
    expect(find(s, "救護所A", "骨粗鬆症薬G（週1）").onHand).toBe(12);
    expect(s.log.some((l) => l.text.includes("救護所B：抗てんかん薬C が在庫切れ"))).toBe(true);
    expect(stockStatus(find(s, "救護所B", "抗てんかん薬C"))).toBe("在庫切れ");
  });

  it("到着見込みの日の 10:00 を過ぎると入荷・搬送が受領になり、届け先の在庫が増える。照会中・融通の調整中は動かない", () => {
    const before = demoReducer(initialDemo(), { type: "tick", hours: 24 }); // 11/06 09:30
    expect(before.inbound.find((r) => r.id === "2")?.status).toBe("搬送中");
    const s = demoReducer(before, { type: "tick", hours: 1 }); // 11/06 10:30
    expect(s.inbound.find((r) => r.id === "2")?.status).toBe("受領");
    // 救護所B の吸入薬D：3本は 24 時間で 0 になり（0 で止まる）、受領の 12本が足される
    expect(find(before, "救護所B", "吸入薬D").onHand).toBe(0);
    expect(find(s, "救護所B", "吸入薬D").onHand).toBe(12);
    expect(s.inbound.find((r) => r.id === "1")?.status).toBe("受領");
    expect(find(s, HQ, "抗てんかん薬C").onHand).toBe(200);
    expect(s.inbound.find((r) => r.id === "5")?.status).toBe("卸に照会中・到着未定");
    expect(s.inbound.find((r) => r.id === "4")?.status).toBe("融通の調整中");
    expect(s.inbound.find((r) => r.id === "6")?.status).toBe("確定"); // 11/08
    // 時計で新しく出た発注の提案も記録に載る（Issue #107）ので、先頭とは限らない
    expect(s.log.find((l) => l.kind === "受領")?.text).toContain("受領");
  });

  it("搬送便・連絡員の時刻に紙の記録が本部に届き、届いていない数が 0 になる", () => {
    const s = demoReducer(initialDemo(), { type: "tick", hours: 7 }); // 16:30 → B の 16:00 便、D の 15:00 連絡員、C の 10:00・14:00
    expect(s.sync.find((r) => r.site === "救護所B")).toMatchObject({ pending: 0, lastSync: "2026-11-05 16:00" });
    expect(s.sync.find((r) => r.site === "救護所D")).toMatchObject({ pending: 0, lastSync: "2026-11-05 15:00" });
    expect(s.sync.find((r) => r.site === "救護所C")).toMatchObject({ pending: 0, lastSync: "2026-11-05 14:00" });
    expect(s.sync.find((r) => r.site === "救護所A")?.lastSync).toBe(SYNC.find((r) => r.site === "救護所A")?.lastSync);
    expect(s.log.some((l) => l.text.includes("救護所B：記録 42 件が本部に届いた"))).toBe(true);
  });

  it("最初に戻すと元の架空データに戻る", () => {
    const s = demoReducer(demoReducer(initialDemo(), { type: "tick", hours: 48 }), { type: "reset" });
    expect(s).toEqual(initialDemo());
  });
});

describe("架空の問診を加える", () => {
  const add: DemoAction = {
    type: "add_record",
    site: "救護所B",
    name: "架空 太郎",
    items: [
      { label: "薬の名前・量（本人の言葉のまま）", value: "てんかんの薬を朝晩1錠ずつ" },
      { label: "記録の在りか", value: "手帳は自宅" },
    ],
    prescription: { item: "抗てんかん薬C", qty: 14, days: 7 },
  };

  it("記録に架空の氏名と番号で加わり、文は入れたまま。今日の患者が1人増え、通信なしの救護所では未着の記録が1件増える", () => {
    const s = demoReducer(initialDemo(), add);
    expect(s.records).toHaveLength(1);
    expect(s.records[0]).toMatchObject({ id: "B-D01", site: "救護所B", name: "架空 太郎", at: 0 });
    expect(s.records[0].items[0].value).toBe("てんかんの薬を朝晩1錠ずつ");
    const today = patientsWithExtra(s).find((r) => r.date === "2026-11-05" && r.site === "救護所B");
    expect(today).toMatchObject({ patients: 41, chronic: 26 });
    expect(s.sync.find((r) => r.site === "救護所B")).toMatchObject({ pending: 43, pendingKind: "未着" });
    expect(demoReducer(s, { ...add, name: "架空 花子" }).records[0].id).toBe("B-D02");
  });

  it("処方の数量だけ現地の在庫が減り、足りない分は未交付として需要に載る", () => {
    const s = demoReducer(initialDemo(), add);
    // 救護所B の抗てんかん薬C は 8錠。14錠の処方 → 8 出庫、6 未交付
    expect(find(s, "救護所B", "抗てんかん薬C").onHand).toBe(0);
    expect(s.records[0]).toMatchObject({ prescription: { item: "抗てんかん薬C", qty: 14, days: 7, unit: "錠" }, undelivered: 6 });
    const need = s.needs.find((n) => n.site === "救護所B" && n.item === "抗てんかん薬C" && n.qty === 6);
    expect(need).toMatchObject({ by: "2026-11-05 15:30" });
    const c = caseRows(s.stock, s.inbound, s.needs, SITES, s.sync).find((x) => x.site === "救護所B" && x.item === "抗てんかん薬C");
    expect(c?.status).toBe("在庫切れ");
    expect(s.log.some((l) => l.text.includes("6錠 が未交付"))).toBe(true);
    // 処方なしなら在庫は変わらない
    const t = demoReducer(initialDemo(), { ...add, prescription: null });
    expect(find(t, "救護所B", "抗てんかん薬C").onHand).toBe(8);
    expect(t.records[0].prescription).toBeNull();
  });

  it("カルテ：同じ救護所・同じ架空の氏名の記録は1枚にまとまり履歴が増える。最初からある記録は番号だけで1枚ずつ", () => {
    const initial = [
      { id: "A-012", site: "救護所A" as const, recordedAt: "2026-11-05 09:40", source: "紙の問診票", items: [{ label: "x", value: "y" }], prescription: "医師が入力：…" },
      { id: "B-007", site: "救護所B" as const, recordedAt: "2026-11-05 08:15", source: "紙の問診票", items: [], prescription: "" },
    ];
    let s = demoReducer(initialDemo(), add);
    s = demoReducer(s, { type: "tick", hours: 2 });
    s = demoReducer(s, { ...add, items: [{ label: "飲めていない日数・残薬", value: "まだ無い" }], prescription: { item: "抗てんかん薬C", qty: 4, days: 2 } });
    s = demoReducer(s, { ...add, name: "仮名 花子", prescription: null });
    const charts = chartsFor(s, initial);
    // 加えたものが新しい順（花子 → 太郎）、その後に最初からあるもの
    expect(charts.map((c) => c.key)).toEqual(["救護所B|仮名 花子", "救護所B|架空 太郎", "救護所A|#A-012", "救護所B|#B-007"]);
    const taro = charts[1];
    expect(taro).toMatchObject({ name: "架空 太郎", id: "B-D02", added: true, hasPrescription: true, undelivered: 6 + 4 });
    // 履歴も新しい順。最新の記録が先頭
    expect(taro.visits.map((v) => v.id)).toEqual(["B-D02", "B-D01"]);
    expect(taro.visits[0]).toMatchObject({ at: "11/05 11:30", prescription: "抗てんかん薬C 4錠・2日分", undelivered: 4 });
    expect(taro.visits[1]).toMatchObject({ at: "11/05 09:30", prescription: "抗てんかん薬C 14錠・7日分", undelivered: 6 });
    expect(charts[0]).toMatchObject({ name: "仮名 花子", id: "B-D03", hasPrescription: false, undelivered: 0 });
    expect(charts[2]).toMatchObject({ name: null, id: "A-012", added: false, hasPrescription: true });
    expect(charts[2].visits[0].at).toBe("11/05 09:40");
    expect(charts[3].hasPrescription).toBe(false);
  });

  it("入荷の元データ・在庫の元データを書き換えない", () => {
    demoReducer(demoReducer(initialDemo(), add), { type: "tick", hours: 30 });
    expect(STOCK.find((r) => r.site === "救護所B" && r.item === "抗てんかん薬C")?.onHand).toBe(8);
    expect(INBOUND.find((r) => r.id === "2")?.status).toBe("搬送中");
    expect(SYNC.find((r) => r.site === "救護所B")?.pending).toBe(42);
  });
});
