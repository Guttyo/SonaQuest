// 発注の提案と承認（Issue #107）。在庫と未交付の算数、承認の状態、却下を確かめる。薬の中身は判断しない
import { describe, expect, it } from "vitest";
import { DISTRICTS, HQ, INBOUND, NEEDS, SHELTERS, STOCK, districtOf, type SiteId } from "./data";
import {
  DISPATCH_DELAY_MINUTES,
  changesSince,
  demoReducer,
  initialDemo,
  proposalStage,
  suggestOrders,
  type DemoAction,
  type DemoState,
} from "./demo";
import { orderQtyText } from "./text";
import { sessionFor } from "./access";

/** 発注の提案を承認・却下する人（本部でログインした架空の担当者。Issue #289） */
const HQ_ACTOR = sessionFor(HQ);

const run = (s: DemoState, ...actions: DemoAction[]) => actions.reduce(demoReducer, s);
const onHand = (s: DemoState, site: string, item: string) => s.stock.find((r) => r.site === site && r.item === item)!.onHand;
const prop = (s: DemoState, site: string, item: string) => s.proposals.find((p) => p.site === site && p.item === item);
const recordB: DemoAction = {
  type: "add_record",
  site: "救護所B",
  name: "架空 太郎",
  items: [{ label: "薬の名前・量（本人の言葉のまま）", value: "（未記入）" }],
  prescription: { item: "抗凝固薬F", qty: 60, days: 7 },
};

describe("地区（架空）", () => {
  it("救護所A〜D はどれか1つの地区に入り、重ならない", () => {
    const all = DISTRICTS.flatMap((d) => d.sites);
    expect([...all].sort()).toEqual([...SHELTERS].sort());
    expect(new Set(all).size).toBe(all.length);
    expect(districtOf("救護所A")?.id).toBe("east");
    expect(districtOf("救護所B")?.id).toBe("west");
    expect(districtOf(HQ)).toBeUndefined();
  });
});

describe("発注の提案の算数", () => {
  const s = suggestOrders(STOCK, NEEDS, INBOUND);

  it("必要な数量 ＝ 未交付・必要な数 ＋ 目安3日分の出庫 − 現地の在庫 − 向かっている搬送・入荷", () => {
    // 救護所B の抗てんかん薬C：必要24 ＋ 8×3 − 8 − 0 ＝ 40。本部備蓄は 0 なので全部が卸へ
    const b = s.find((x) => x.key === "救護所B|抗てんかん薬C")!;
    expect(b.basis).toEqual({ need: 24, cover: 24, onHand: 8, incoming: 0, raw: 40 });
    expect(b.qty).toBe(40);
    expect(b.fromHq).toBe(0);
    expect(b.fromVendor).toBe(40);
    // 救護所B の抗凝固薬F に必要な数 1 が届くと：1 ＋ 16×3 − 40 ＝ 9 → 10錠（1シート）単位に切り上げて 10。本部備蓄から出せる（Issue #167）
    const f = suggestOrders(STOCK, [...NEEDS, { site: "救護所B", item: "抗凝固薬F", qty: 1, by: "" }], INBOUND).find((x) => x.key === "救護所B|抗凝固薬F")!;
    expect(f.basis.raw).toBe(9);
    expect(f.qty).toBe(10);
    expect(f.fromHq).toBe(10);
    expect(f.fromVendor).toBe(0);
  });

  it("向かっている搬送（搬送中・引当済み）を差し引き、足りていれば出さない。融通の調整中は差し引かない", () => {
    // 救護所B の吸入薬D：6 ＋ 9 − 3 − 12（搬送中）＝ 0 → 出さない
    expect(s.find((x) => x.key === "救護所B|吸入薬D")).toBeUndefined();
    // 救護所D の解熱鎮痛薬H：210 − 150 − 600（引当済み）< 0 → 出さない
    expect(s.find((x) => x.key === "救護所D|解熱鎮痛薬H")).toBeUndefined();
    // 救護所C の貼付鎮痛薬E（必要な数 1）：1 ＋ 36 − 30 ＝ 7。救護所B からの融通（調整中）は確かでないので差し引かない
    const e = suggestOrders(STOCK, [...NEEDS, { site: "救護所C", item: "貼付鎮痛薬E", qty: 1, by: "" }], INBOUND);
    expect(e.find((x) => x.key === "救護所C|貼付鎮痛薬E")?.qty).toBe(7);
  });

  it("未交付・必要な数が無いときは、1日の出庫分以上足りないときだけ出す", () => {
    // 救護所A の抗てんかん薬C：36 − 30 ＝ 6 は 1日の出庫 12 より少ないので出さない
    expect(s.find((x) => x.key === "救護所A|抗てんかん薬C")).toBeUndefined();
    // 在庫が 24 まで減ると 36 − 24 ＝ 12（1日分）で出す。10錠単位に切り上げて 20（出すかの判定は切り上げる前の 12 で行う）
    const stock = STOCK.map((r) => (r.site === "救護所A" && r.item === "抗てんかん薬C" ? { ...r, onHand: 24 } : r));
    expect(suggestOrders(stock, NEEDS, INBOUND).find((x) => x.key === "救護所A|抗てんかん薬C")).toMatchObject({ qty: 20, basis: { raw: 12 } });
  });

  it("在庫が未確認のものは出さない。本部備蓄は行にしない。並びは残り日数が短い順（在庫0が先）", () => {
    expect(s.find((x) => x.key === "救護所D|吸入薬D")).toBeUndefined();
    expect(s.every((x) => x.site !== HQ)).toBe(true);
    expect(s[0].key).toBe("救護所C|骨粗鬆症薬G（週1）");
    expect(s.map((x) => x.key)).toEqual(["救護所C|骨粗鬆症薬G（週1）", "救護所B|抗てんかん薬C"]);
    for (const x of s) expect(x.fromHq + x.fromVendor).toBe(x.qty);
  });

  it("本部備蓄は並びの順に割り当て、使い切ったら残りは卸へ", () => {
    const stock = STOCK.map((r) => (r.site === HQ && r.item === "抗凝固薬F" ? { ...r, onHand: 10 } : r));
    const needs = [...NEEDS, { site: "救護所B" as const, item: "抗凝固薬F", qty: 1, by: "" }, { site: "救護所D" as const, item: "抗凝固薬F", qty: 1, by: "" }];
    const t = suggestOrders(stock, needs, INBOUND);
    const b = t.find((x) => x.key === "救護所B|抗凝固薬F")!;
    const d = t.find((x) => x.key === "救護所D|抗凝固薬F")!;
    // 9 → 10錠、7 → 10錠に切り上げ。本部の 10錠は先の救護所B に出し、救護所D は全部を卸へ
    expect([b.fromHq, b.fromVendor]).toEqual([10, 0]);
    expect([d.fromHq, d.fromVendor]).toEqual([0, 10]);
  });

  it("錠の品目は 10錠単位（1シート）、本部備蓄から出す分も 10錠単位。本・枚の品目は 1単位のまま（Issue #167）", () => {
    // 本部の抗凝固薬F が 25錠のとき、出せるのは 20錠（2シート）まで
    const stock = STOCK.map((r) => (r.site === HQ && r.item === "抗凝固薬F" ? { ...r, onHand: 25 } : r));
    const needs = [...NEEDS, { site: "救護所B" as const, item: "抗凝固薬F", qty: 25, by: "" }];
    const b = suggestOrders(stock, needs, INBOUND).find((x) => x.key === "救護所B|抗凝固薬F")!;
    expect(b.basis.raw).toBe(33);
    expect([b.qty, b.fromHq, b.fromVendor]).toEqual([40, 20, 20]);
    for (const x of suggestOrders(STOCK, needs, INBOUND)) {
      if (x.unit === "錠") expect(x.qty % 10).toBe(0);
      if (x.unit === "錠") expect(x.fromHq % 10).toBe(0);
    }
    // 枚の品目は切り上げない
    const e = suggestOrders(STOCK, [...NEEDS, { site: "救護所C", item: "貼付鎮痛薬E", qty: 1, by: "" }], INBOUND);
    expect(e.find((x) => x.key === "救護所C|貼付鎮痛薬E")?.qty).toBe(7);
  });

  it("数量は少なければシート、多ければ箱で示す（100錠＝1箱、10錠＝1シート）", () => {
    expect(orderQtyText(230, "錠")).toBe("2箱＋3シート（230錠）");
    expect(orderQtyText(30, "錠")).toBe("3シート（30錠）");
    expect(orderQtyText(200, "錠")).toBe("2箱（200錠）");
    expect(orderQtyText(1200, "錠")).toBe("12箱（1,200錠）");
    expect(orderQtyText(0, "錠")).toBe("0錠");
    expect(orderQtyText(12, "本")).toBe("12本");
  });

  it("最初の状態に提案が載っていて、どれも「提案」", () => {
    const st = initialDemo();
    expect(st.proposals.map((p) => p.key)).toEqual(s.map((x) => x.key));
    expect(st.proposals.every((p) => p.status === "提案")).toBe(true);
    expect(st.proposals[0].id).toBe("P-01");
  });
});

describe("カルテに登録 → 提案 → 承認 → 搬送中 → 受領", () => {
  it("登録で未交付が出ると、その救護所×品目の提案が出る。もう一度登録すると数量が増える（番号は引き継ぐ）", () => {
    const s0 = initialDemo();
    expect(prop(s0, "救護所B", "抗凝固薬F")).toBeUndefined();
    const s1 = run(s0, recordB);
    // 在庫 40 を出庫し、未交付 20。提案は 20 ＋ 48 − 0 ＝ 68 → 10錠単位に切り上げて 70
    expect(onHand(s1, "救護所B", "抗凝固薬F")).toBe(0);
    const after = prop(s1, "救護所B", "抗凝固薬F")!;
    expect(after.id).toBe("P-03");
    expect(after.basis.need).toBe(20);
    expect(after.basis.raw).toBe(68);
    expect(after.qty).toBe(70);
    expect(after.fromHq).toBe(70);
    const s2 = run(s1, recordB);
    expect(prop(s2, "救護所B", "抗凝固薬F")).toMatchObject({ id: "P-03", qty: 130 });
  });

  it("新しい提案は作った操作の番号（createdRev）、未交付が増えた提案は更新の番号（rev）を持つ。時計では印を付けない", () => {
    const s1 = run(initialDemo(), { ...recordB, site: "救護所A", prescription: { item: "吸入薬D", qty: 20, days: 7 } });
    const p = prop(s1, "救護所A", "吸入薬D")!;
    expect(p.createdRev).toBe(s1.rev);
    expect(prop(s1, "救護所C", "骨粗鬆症薬G（週1）")!.rev).toBe(0);
    const s2 = run(s1, recordB);
    expect(prop(s2, "救護所B", "抗凝固薬F")!.createdRev).toBe(s2.rev);
    const s3 = run(s2, recordB);
    const f = prop(s3, "救護所B", "抗凝固薬F")!;
    expect(f.createdRev).toBe(s2.rev);
    expect(f.rev).toBe(s3.rev);
    const s4 = run(s3, { type: "tick", hours: 1 });
    expect(prop(s4, "救護所B", "抗凝固薬F")!.rev).toBe(s3.rev);
  });

  it("承認すると本部の在庫が引き当てられ、搬送（引当済み）が入荷・搬送の一覧に載る。時計で搬送中 → 受領になり現地の在庫が増える", () => {
    const s1 = run(initialDemo(), recordB);
    const id = prop(s1, "救護所B", "抗凝固薬F")!.id;
    const hqBefore = onHand(s1, HQ, "抗凝固薬F")!;
    const s2 = run(s1, { type: "approve_proposal", id, actor: HQ_ACTOR });
    const p = s2.proposals.find((x) => x.id === id)!;
    expect(p.status).toBe("承認済み");
    expect(onHand(s2, HQ, "抗凝固薬F")).toBe(hqBefore - 70);
    const ship = s2.inbound.find((r) => r.id === p.shipmentId)!;
    expect(ship).toMatchObject({ from: HQ, to: "救護所B", item: "抗凝固薬F", qty: 70, status: "引当済み" });
    expect(ship.departAt).toBe(DISPATCH_DELAY_MINUTES);
    expect(ship.arriveAt).toBe(DISPATCH_DELAY_MINUTES + 70); // 救護所B は迂回で約70分
    expect(proposalStage(p, s2.inbound)).toBe("承認済み（引当済み）");
    // 承認した分が向かっているので、同じ救護所×品目の新しい提案は出ない
    expect(s2.proposals.filter((x) => x.key === p.key)).toHaveLength(1);
    expect(s2.log[0].text).toContain("承認");

    const s3 = run(s2, { type: "tick", hours: 1 });
    expect(proposalStage(s3.proposals.find((x) => x.id === id)!, s3.inbound)).toBe("搬送中");
    expect(onHand(s3, "救護所B", "抗凝固薬F")).toBe(0);

    // 2時間目（11:30）はまだ搬送中、到着は出発の70分後（11:40）
    expect(proposalStage(run(s3, { type: "tick", hours: 1 }).proposals.find((x) => x.id === id)!, run(s3, { type: "tick", hours: 1 }).inbound)).toBe("搬送中");
    const s4 = run(s3, { type: "tick", hours: 2 });
    expect(proposalStage(s4.proposals.find((x) => x.id === id)!, s4.inbound)).toBe("受領");
    expect(onHand(s4, "救護所B", "抗凝固薬F")).toBe(70);
    expect(s4.log.some((l) => l.text.includes("救護所B：抗凝固薬F 70錠 を受領"))).toBe(true);
  });

  it("本部に無い分は卸への照会（本部向け・到着未定）として載り、その救護所の提案から差し引かれる", () => {
    const s0 = initialDemo();
    const id = prop(s0, "救護所B", "抗てんかん薬C")!.id;
    const s1 = run(s0, { type: "approve_proposal", id, actor: HQ_ACTOR });
    const p = s1.proposals.find((x) => x.id === id)!;
    expect(p.fromHq).toBe(0);
    expect(p.fromVendor).toBe(40);
    expect(p.shipmentId).toBeNull();
    const v = s1.inbound.find((r) => r.id === p.vendorId)!;
    expect(v).toMatchObject({ from: "供給元（卸）", to: HQ, qty: 40, eta: "未定", status: "卸に照会中・到着未定", forSite: "救護所B" });
    expect(proposalStage(p, s1.inbound)).toBe("卸に照会中");
    expect(s1.proposals.filter((x) => x.key === p.key && x.status === "提案")).toHaveLength(0);
    // 照会中のものは時計を進めても動かない（人の手配が要る）
    const s2 = run(s1, { type: "tick", hours: 24 });
    expect(s2.inbound.find((r) => r.id === p.vendorId)?.status).toBe("卸に照会中・到着未定");
  });

  it("却下は提案を消すだけで、在庫・搬送は変わらない。時計を進めても出し直さず、未交付が増えたら出し直す", () => {
    const s0 = initialDemo();
    const id = prop(s0, "救護所B", "抗てんかん薬C")!.id;
    const s1 = run(s0, { type: "reject_proposal", id, actor: HQ_ACTOR });
    expect(prop(s1, "救護所B", "抗てんかん薬C")).toBeUndefined();
    expect(s1.stock).toEqual(s0.stock);
    expect(s1.inbound).toEqual(s0.inbound);
    expect(prop(run(s1, { type: "tick", hours: 6 }), "救護所B", "抗てんかん薬C")).toBeUndefined();
    // 在庫 8 に処方 10 で、未交付 2。必要な数が 24 → 26 に増えたので出し直す
    const s2 = run(s1, { ...recordB, prescription: { item: "抗てんかん薬C", qty: 10, days: 5 } }, recordB);
    expect(prop(s2, "救護所B", "抗てんかん薬C")?.basis.need).toBe(26);
    // 承認済みのものは却下できない
    const s3 = run(s2, { type: "approve_proposal", id: prop(s2, "救護所B", "抗凝固薬F")!.id, actor: HQ_ACTOR });
    const approvedId = s3.proposals.find((x) => x.status === "承認済み")!.id;
    expect(run(s3, { type: "reject_proposal", id: approvedId, actor: HQ_ACTOR }).proposals).toEqual(s3.proposals);
  });

  it("承認・却下は HQ の actor のときだけ効く。救護所の actor を渡しても state は変わらない（Issue #289 の 4）", () => {
    const s0 = initialDemo();
    const id = prop(s0, "救護所B", "抗てんかん薬C")!.id;
    for (const site of SHELTERS) {
      const actor = sessionFor(site);
      expect(demoReducer(s0, { type: "approve_proposal", id, actor })).toBe(s0);
      expect(demoReducer(s0, { type: "reject_proposal", id, actor })).toBe(s0);
    }
    const approved = run(s0, { type: "approve_proposal", id, actor: HQ_ACTOR });
    expect(approved.proposals.find((x) => x.id === id)?.status).toBe("承認済み");
    expect(prop(run(s0, { type: "reject_proposal", id, actor: HQ_ACTOR }), "救護所B", "抗てんかん薬C")).toBeUndefined();
  });

  it("最初からある引当済みの搬送も、到着見込みの日の 07:00 に搬送中、10:00 に受領になる", () => {
    const s1 = run(initialDemo(), { type: "tick", hours: 22 }); // 11/06 07:30
    expect(s1.inbound.find((r) => r.id === "8")?.status).toBe("搬送中");
    const s2 = run(s1, { type: "tick", hours: 1 });
    expect(s2.inbound.find((r) => r.id === "8")?.status).toBe("搬送中");
    const s3 = run(s2, { type: "tick", hours: 2 }); // 11/06 10:30
    expect(s3.inbound.find((r) => r.id === "8")?.status).toBe("受領");
  });

  it("元の架空データを書き換えない", () => {
    run(initialDemo(), recordB, { type: "approve_proposal", id: "P-03", actor: HQ_ACTOR }, { type: "tick", hours: 24 });
    expect(STOCK.find((r) => r.site === HQ && r.item === "抗凝固薬F")?.onHand).toBe(500);
    expect(INBOUND).toHaveLength(10);
  });
});

describe("直近1時間で変わったこと（件数だけ。Issue #107 の追加。2026-11-06 オーナー決定で「前回から」をやめた）", () => {
  it("最初の記録は空で、最初の提案は数えない", () => {
    const s = initialDemo();
    expect(s.log).toEqual([]);
    expect(changesSince(s.log, s.minutes)).toEqual({ 登録: 0, 到着: 0, 未交付: 0, 提案: 0, 承認: 0, 受領: 0, 在庫切れ: 0 });
  });

  it("登録・未交付・提案・承認を数え、救護所で絞れる。却下は承認に数えない", () => {
    const s1 = run(initialDemo(), recordB);
    expect(changesSince(s1.log, s1.minutes)).toMatchObject({ 登録: 1, 未交付: 1, 提案: 1, 承認: 0 });
    expect(changesSince(s1.log, s1.minutes, "救護所A")).toMatchObject({ 登録: 0, 未交付: 0, 提案: 0 });
    const approved = run(s1, { type: "approve_proposal", id: "P-03", actor: HQ_ACTOR });
    expect(changesSince(approved.log, approved.minutes, "救護所B").承認).toBe(1);
    const rejected = run(s1, { type: "reject_proposal", id: "P-03", actor: HQ_ACTOR });
    expect(changesSince(rejected.log, rejected.minutes).承認).toBe(0);
  });

  it("デモの時計の直前1時間だけを数える（ちょうど60分前は数えず、59分前は数える）", () => {
    const log = [
      { at: 100, text: "", kind: "登録" as const, site: "救護所A" as const },
      { at: 41, text: "", kind: "登録" as const, site: "救護所A" as const },
      { at: 40, text: "", kind: "登録" as const, site: "救護所A" as const },
      { at: 101, text: "", kind: "登録" as const, site: "救護所A" as const },
      { at: -1, text: "", kind: "登録" as const, site: "救護所A" as const },
    ];
    expect(changesSince(log, 100).登録).toBe(2);
    expect(changesSince(log, 100, undefined, Infinity).登録).toBe(3);
  });

  it("承認した搬送が届くと受領を数える。1時間を過ぎた出来事は数えない", () => {
    const s = run(initialDemo(), recordB, { type: "approve_proposal", id: "P-03", actor: HQ_ACTOR }, { type: "tick", hours: 3 });
    expect(changesSince(s.log, s.minutes, "救護所B", Infinity).受領).toBeGreaterThanOrEqual(1);
    const long = run(s, ...Array.from({ length: 48 }, () => ({ type: "tick", hours: 1 }) as DemoAction));
    expect(changesSince(long.log, long.minutes).登録).toBe(0);
    // 記録は上限で切らないので、幅を広げればデモの開始からの件数も数えられる
    expect(changesSince(long.log, long.minutes, undefined, Infinity).登録).toBe(1);
  });
});

describe("PR #108 のレビューで直したこと", () => {
  const rec = (site: SiteId, qty: number): DemoAction => ({
    type: "add_record",
    site,
    name: "架空 花子",
    items: [{ label: "薬の名前・量（本人の言葉のまま）", value: "（未記入）" }],
    prescription: { item: "抗凝固薬F", qty, days: 7 },
  });
  const hqF = (s: DemoState) => onHand(s, HQ, "抗凝固薬F")!;

  it("承認は画面に出した内訳のとおり。ほかの救護所に割り当てた本部の在庫は使わない", () => {
    const s = run(initialDemo(), rec("救護所B", 450), rec("救護所D", 350));
    const b = prop(s, "救護所B", "抗凝固薬F")!;
    const d = prop(s, "救護所D", "抗凝固薬F")!;
    expect(b.fromHq + d.fromHq).toBeLessThanOrEqual(hqF(initialDemo()));
    const afterD = run(s, { type: "approve_proposal", id: d.id, actor: HQ_ACTOR });
    expect(hqF(s) - hqF(afterD)).toBe(d.fromHq);
    const ship = afterD.inbound.find((r) => r.proposalId === d.id && r.from === HQ);
    expect(ship?.qty ?? 0).toBe(d.fromHq);
    expect(afterD.inbound.find((r) => r.proposalId === d.id && r.status === "卸に照会中・到着未定")?.qty ?? 0).toBe(d.fromVendor);
  });

  it("却下した提案に本部の在庫を割り当てない（残りの提案が本部の在庫を使える）", () => {
    const s = run(initialDemo(), rec("救護所B", 450), rec("救護所D", 350));
    const b = prop(s, "救護所B", "抗凝固薬F")!;
    const after = run(s, { type: "reject_proposal", id: b.id, actor: HQ_ACTOR });
    const d = prop(after, "救護所D", "抗凝固薬F")!;
    expect(d.fromHq).toBe(Math.min(d.qty, hqF(after)));
  });

  it("本部の分が届いても、卸の分が残っていれば「一部受領・卸に照会中」で、「受領」にしない", () => {
    const s = run(initialDemo(), rec("救護所B", 450), rec("救護所D", 350));
    const b = prop(s, "救護所B", "抗凝固薬F")!;
    const s1 = run(s, { type: "approve_proposal", id: b.id, actor: HQ_ACTOR });
    const d = prop(s1, "救護所D", "抗凝固薬F")!;
    expect(d.fromHq).toBeGreaterThan(0);
    expect(d.fromVendor).toBeGreaterThan(0);
    const s2 = run(s1, { type: "approve_proposal", id: d.id, actor: HQ_ACTOR }, { type: "tick", hours: 24 });
    const dp = s2.proposals.find((x) => x.id === d.id)!;
    expect(s2.inbound.find((r) => r.id === dp.shipmentId)?.status).toBe("受領");
    expect(proposalStage(dp, s2.inbound)).toBe("一部受領・卸に照会中");
  });

  it("最初からある本部 → 救護所の搬送（引当済みなど）は、提案に割り当てられる本部の在庫から除く", () => {
    const reserved = INBOUND.filter((r) => r.from === HQ && (r.status === "確定" || r.status === "引当済み" || r.status === "搬送中"));
    expect(reserved.length).toBeGreaterThan(0);
    const r = reserved[0];
    const hq = STOCK.find((x) => x.site === HQ && x.item === r.item)!.onHand ?? 0;
    const big = suggestOrders(
      STOCK,
      [...NEEDS, { site: r.to, item: r.item, qty: 100000, by: "2026-11-05 12:00" }],
      INBOUND,
    ).find((x) => x.site === r.to && x.item === r.item)!;
    const reservedQty = reserved.filter((x) => x.item === r.item).reduce((a, x) => a + x.qty, 0);
    expect(big.fromHq).toBeLessThanOrEqual(Math.max(0, hq - reservedQty));
  });
});
