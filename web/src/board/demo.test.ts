// ボードのデモの reducer（Issue #102）。メモリの中の在庫の足し引きと時刻だけを確かめる
import { describe, expect, it } from "vitest";
import { HQ, INBOUND, STOCK, SYNC } from "./data";
import { chartUndelivered, chartsFor, clockText, demoReducer, initialDemo, minutesAt, patientsWithExtra, prescriptionTotals, type DemoAction } from "./demo";
import { caseRows, stockStatus } from "./summary";
import { syncStatusText } from "./text";
import { ITEMS, SHELTERS, SITES } from "./data";
import { arrivalRows, changesSince, FICTIONAL_NAMES, type DemoState } from "./demo";
import {
  CONDITIONS,
  DEFAULT_ARRIVAL_SEED,
  DISPENSE_DAYS,
  SIM_PATIENTS,
  arrivalPlan,
  dispenseQty,
  hasCondition,
  mulberry32,
  nextSeed,
  simPatient,
} from "./patients";

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
    expect(s.log.some((l) => l.text.includes("救護所B：抗てんかん薬C が在庫なし"))).toBe(true);
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

  it("記録が届いた後は、受領状況の文とログが「転記待ち」「件数の報告はまだない」「予定」のままにならない（Issue #243）", () => {
    const before = initialDemo();
    expect(syncStatusText(before.sync.find((r) => r.site === "救護所D")!)).toContain("件数の報告はまだない");
    expect(syncStatusText(before.sync.find((r) => r.site === "救護所C")!)).toContain("転記待ち 6 件");
    const s = demoReducer(before, { type: "tick", hours: 7 });
    for (const site of ["救護所C", "救護所D"] as const) {
      const text = syncStatusText(s.sync.find((r) => r.site === site)!);
      expect(text).toBe("届いた分は反映済み");
      for (const l of s.log.filter((x) => x.text.startsWith(`${site}：記録`))) expect(l.text).not.toContain("予定");
    }
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

  it("記録に架空の氏名と番号で加わり、文は入れたまま。今日の患者が1人増え、通信なしの救護所では本部が知らないので未着の数は増えない（Issue #217）", () => {
    const s = demoReducer(initialDemo(), add);
    expect(s.records).toHaveLength(1);
    expect(s.records[0]).toMatchObject({ id: "B-D01", site: "救護所B", name: "架空 太郎", at: 0 });
    expect(s.records[0].items[0].value).toBe("てんかんの薬を朝晩1錠ずつ");
    const today = patientsWithExtra(s).find((r) => r.date === "2026-11-05" && r.site === "救護所B");
    expect(today).toMatchObject({ patients: 41, chronic: 26 });
    expect(s.sync.find((r) => r.site === "救護所B")).toMatchObject({ pending: 42, pendingKind: "未着" });
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

describe("カルテの処方の累計（Issue #114）", () => {
  const rx = (site: "救護所A" | "救護所B", item: string, qty: number): DemoAction => ({
    type: "add_record",
    site,
    name: "架空 太郎",
    items: [],
    prescription: { item, qty, days: 7 },
  });

  it("最初は空。最初からある記録（処方が文だけ）は数えない", () => {
    expect(prescriptionTotals(initialDemo().records, "救護所A")).toEqual([]);
  });

  it("入力した数量を救護所×品目で足すだけ。渡せた数と未交付に分け、ほかの救護所の分は混ぜない", () => {
    let s = initialDemo();
    s = demoReducer(s, rx("救護所B", "抗てんかん薬C", 5));
    s = demoReducer(s, rx("救護所B", "抗てんかん薬C", 6));
    s = demoReducer(s, rx("救護所B", "降圧薬A", 10));
    s = demoReducer(s, rx("救護所A", "抗てんかん薬C", 4));
    s = demoReducer(s, { type: "add_record", site: "救護所B", name: "架空 花子", items: [], prescription: null });
    const b = prescriptionTotals(s.records, "救護所B");
    const c = b.find((t) => t.item === "抗てんかん薬C")!;
    // 在庫 8 錠：5 錠は渡せ、次の 6 錠は 3 錠だけ渡せて 3 錠が未交付
    expect(c).toEqual({ item: "抗てんかん薬C", unit: "錠", prescribed: 11, delivered: 8, undelivered: 3, count: 2 });
    expect(b.map((t) => t.item)).toEqual(["降圧薬A", "抗てんかん薬C"]);
    expect(prescriptionTotals(s.records, "救護所A")).toEqual([
      { item: "抗てんかん薬C", unit: "錠", prescribed: 4, delivered: 4, undelivered: 0, count: 1 },
    ]);
    expect(chartUndelivered(s.records, "救護所B", "抗てんかん薬C")).toBe(3);
    expect(chartUndelivered(s.records, "救護所A", "抗てんかん薬C")).toBe(0);
  });

  it("カルテの未交付は、発注の提案の「未交付・必要な数」に入っている（算数は変えない）", () => {
    const before = initialDemo();
    const needBefore = before.needs.filter((n) => n.site === "救護所B" && n.item === "抗てんかん薬C").reduce((a, n) => a + n.qty, 0);
    const s = demoReducer(before, rx("救護所B", "抗てんかん薬C", 20));
    const p = s.proposals.find((x) => x.site === "救護所B" && x.item === "抗てんかん薬C")!;
    expect(chartUndelivered(s.records, "救護所B", "抗てんかん薬C")).toBe(12);
    expect(p.basis.need).toBe(needBefore + 12);
  });
});

describe("架空の患者 100 人（Issue #122）", () => {
  it("番号は 1〜100。氏名は北海道の地名由来の架空の名前（Issue #151）で重ならず、入力の下書きの名前とも重ならない", () => {
    expect(SIM_PATIENTS).toHaveLength(100);
    expect(SIM_PATIENTS.map((p) => p.no)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    const names = SIM_PATIENTS.map((p) => p.name);
    expect(new Set(names).size).toBe(100);
    // 北海道の地名由来の架空の氏名（Issue #151）。表の先頭と、姓と名の間の空白
    expect(names.slice(0, 6)).toEqual(["北海 太郎", "石狩 花子", "札幌 清二郎", "幌加内 そば太郎", "石狩 鮭太郎", "小樽 ルタ夫"]);
    expect(names[99]).toBe("弟子屈 湯太");
    for (const n of names) expect(n).toMatch(/^\S+ \S+$/);
    for (const n of names) expect(n.replace(" ", "").length).toBeLessThanOrEqual(8);
    for (const n of FICTIONAL_NAMES) expect(names).not.toContain(n);
  });

  it("服薬は既存の仮名の品目から 1〜3 品目で重ならず、1日の量は正の整数。けが・体調は固定の候補から", () => {
    for (const p of SIM_PATIENTS) {
      expect(p.meds.length).toBeGreaterThanOrEqual(1);
      expect(p.meds.length).toBeLessThanOrEqual(3);
      expect(new Set(p.meds.map((m) => m.item)).size).toBe(p.meds.length);
      for (const m of p.meds) {
        expect(ITEMS).toContain(m.item);
        expect(Number.isInteger(m.perDay) && m.perDay > 0).toBe(true);
        expect(dispenseQty(m)).toBe(m.perDay * DISPENSE_DAYS);
      }
      expect(CONDITIONS).toContain(p.condition);
      expect(p.age).toBeGreaterThanOrEqual(20);
      expect(["男性", "女性"]).toContain(p.sex);
    }
    // けがのある人もない人もいる
    expect(SIM_PATIENTS.some(hasCondition)).toBe(true);
    expect(SIM_PATIENTS.some((p) => !hasCondition(p))).toBe(true);
  });

  it("種付きの乱数は同じ種で同じ並び。到着の予定は100人を1回ずつ、救護所4か所のどこかに、時間の順で", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const plan = arrivalPlan(DEFAULT_ARRIVAL_SEED);
    expect(plan).toEqual(arrivalPlan(DEFAULT_ARRIVAL_SEED));
    expect(new Set(plan.map((p) => p.no)).size).toBe(100);
    for (const p of plan) expect(SHELTERS).toContain(p.site);
    for (let i = 1; i < plan.length; i += 1) expect(plan[i].hour).toBeGreaterThanOrEqual(plan[i - 1].hour);
    const other = arrivalPlan(nextSeed(DEFAULT_ARRIVAL_SEED));
    expect(other).not.toEqual(plan);
    expect(nextSeed(DEFAULT_ARRIVAL_SEED)).toBe(nextSeed(DEFAULT_ARRIVAL_SEED));
    expect(nextSeed(DEFAULT_ARRIVAL_SEED)).not.toBe(DEFAULT_ARRIVAL_SEED);
  });
});

describe("架空の患者の到着（Issue #122）", () => {
  const start = (seed = DEFAULT_ARRIVAL_SEED) => demoReducer(initialDemo(seed), { type: "arrivals", active: true });
  const hours = (s: DemoState, n: number) => {
    let t = s;
    for (let i = 0; i < n; i += 1) t = demoReducer(t, { type: "tick", hours: 1 });
    return t;
  };

  it("最初は止めていて、時計を進めても誰も到着しない（既存のデモの動きは変わらない）", () => {
    const s = demoReducer(initialDemo(), { type: "tick", hours: 24 });
    expect(s.arrivals.active).toBe(false);
    expect(s.arrivals.arrived).toEqual([]);
    expect(s.records).toEqual([]);
  });

  it("到着すると、記録に架空の氏名と番号で加わり、今日の患者が増え、服薬の品目ごとに 1日の量×3日分 を現地の在庫から引く。足りない分は未交付として需要に載る", () => {
    const plan = arrivalPlan(DEFAULT_ARRIVAL_SEED);
    const first = plan[0].hour;
    // 到着の直前まで、止めたものと始めたものを並べて進める（ここまでは在庫が同じ）
    const on0 = hours(start(), first - 1);
    const off0 = { ...hours(initialDemo(), first - 1), arrivals: on0.arrivals };
    expect(on0.stock).toEqual(off0.stock);
    const on = demoReducer(on0, { type: "tick", hours: 1 });
    const off = demoReducer({ ...off0, arrivals: { ...off0.arrivals, active: false } }, { type: "tick", hours: 1 });
    const now = plan.filter((p) => p.hour === first);
    expect(now.length).toBeGreaterThan(0);
    expect(on.arrivals.arrived.map((a) => a.no).sort()).toEqual(now.map((p) => p.no).sort());
    // 救護所×品目ごとに、3日分の合計を在庫から引き、0 より下にはしない。足りない分が未交付
    const want = new Map<string, number>();
    for (const p of now) for (const m of simPatient(p.no)!.meds) want.set(`${p.site}|${m.item}`, (want.get(`${p.site}|${m.item}`) ?? 0) + dispenseQty(m));
    for (const [key, qty] of want) {
      const [site, item] = key.split("|");
      const before = find(off, site, item).onHand ?? 0;
      const out = Math.min(before, qty);
      expect(find(on, site, item).onHand).toBeCloseTo(before - out, 6);
      const added = on.needs.slice(off.needs.length).filter((n) => n.site === site && n.item === item).reduce((a, n) => a + n.qty, 0);
      expect(added).toBeCloseTo(qty - out, 6);
    }
    // 記録：架空の氏名・番号・服薬の品目（3日分）。今日の患者が到着の人数だけ増える
    for (const p of now) {
      const rec = on.records.find((r) => r.patientNo === p.no)!;
      const patient = simPatient(p.no)!;
      expect(rec).toMatchObject({ site: p.site, name: patient.name });
      expect(rec.prescriptions.map((x) => [x.item, x.qty, x.days])).toEqual(patient.meds.map((m) => [m.item, m.perDay * 3, 3]));
    }
    for (const site of SHELTERS) {
      const n = now.filter((p) => p.site === site).length;
      expect(on.extraPatients[site]?.patients ?? 0).toBe(n);
    }
    // 「直近1時間で変わったこと」は到着として数え（ここでは幅を広げてデモの開始から数える）、記録の文に氏名を入れない
    expect(changesSince(on.log, on.minutes, undefined, Infinity).到着).toBe(now.length);
    for (const p of SIM_PATIENTS) expect(on.log.some((l) => l.text.includes(p.name))).toBe(false);
  });

  it("100人が到着した後も、受領状況の文は件数と内訳に合う（Issue #243）", () => {
    const s = hours(start(), 400);
    for (const r of s.sync) {
      const text = syncStatusText(r);
      if (r.mode === "オンライン") expect(text).toBe("本部で入力");
      else if (r.pending === 0) expect(text).toBe("届いた分は反映済み");
      else if (r.pending === null) expect(text).toContain("件数の報告はまだない");
      else expect(text).toContain(`${r.pendingKind} ${r.pending} 件`);
      if (r.pending !== null) expect(text).not.toContain("件数の報告はまだない");
    }
  });

  it("100人全員が到着したら止まる。各品目は 渡せた数＋未交付＝3日分 で、未交付はすべて需要に載っている", () => {
    const s = hours(start(), 400);
    expect(s.arrivals.arrived).toHaveLength(100);
    const fromArrivals = s.records.filter((r) => r.patientNo !== undefined);
    expect(fromArrivals).toHaveLength(100);
    const undelivered = fromArrivals.flatMap((r) => r.prescriptions).reduce((a, x) => a + x.undelivered, 0);
    expect(undelivered).toBeGreaterThan(0);
    for (const r of fromArrivals) for (const x of r.prescriptions) expect(x.undelivered).toBeLessThanOrEqual(x.qty);
    const needAdded = s.needs.slice(initialDemo().needs.length).reduce((a, n) => a + n.qty, 0);
    expect(needAdded).toBeCloseTo(undelivered, 6);
    const more = demoReducer(s, { type: "tick", hours: 24 });
    expect(more.records).toHaveLength(s.records.length);
    expect(arrivalRows(s)).toHaveLength(100);
    expect(arrivalRows(s, "救護所A").every((r) => r.site === "救護所A")).toBe(true);
  });

  it("同じ種・同じ操作なら同じ動き。1日進めても1時間ずつ24回でも、同じ人が同じ時刻に同じ救護所に着く。種を替えると変わる", () => {
    expect(hours(start(), 30)).toEqual(hours(start(), 30));
    const day = demoReducer(start(), { type: "tick", hours: 24 });
    const step = hours(start(), 24);
    expect(day.arrivals.arrived).toEqual(step.arrivals.arrived);
    const other = hours(start(nextSeed(DEFAULT_ARRIVAL_SEED)), 24);
    expect(other.arrivals.arrived).not.toEqual(step.arrivals.arrived);
  });

  it("止めると到着しない。最初に戻すと同じ種のまま最初に戻り、別の並びでは種が替わって最初からになる", () => {
    const s = hours(start(), 10);
    const paused = demoReducer(s, { type: "arrivals", active: false });
    expect(hours(paused, 5).arrivals.arrived).toEqual(s.arrivals.arrived);
    expect(demoReducer(s, { type: "reset" })).toEqual(initialDemo());
    const seed = nextSeed(DEFAULT_ARRIVAL_SEED);
    const r = demoReducer(s, { type: "reseed", seed });
    expect(r).toEqual(initialDemo(seed));
    expect(demoReducer(hours(demoReducer(r, { type: "arrivals", active: true }), 3), { type: "reset" })).toEqual(initialDemo(seed));
  });

  it("元の架空データを書き換えない", () => {
    hours(start(), 100);
    expect(STOCK.find((r) => r.site === "救護所B" && r.item === "抗てんかん薬C")?.onHand).toBe(8);
    expect(SYNC.find((r) => r.site === "救護所B")?.pending).toBe(42);
  });
});
