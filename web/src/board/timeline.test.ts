// 発注・搬送の時間軸の集計（Issue #118）
import { describe, expect, it } from "vitest";
import { SITES } from "./data";
import { clockText, demoReducer, initialDemo, type DemoAction, type DemoState } from "./demo";
import { caseRows } from "./summary";
import { TIMELINE_DAYS, timelineRows, timelineWindow } from "./timeline";
import { timelineTexts } from "../screens/BoardTimeline";

const run = (s: DemoState, ...actions: DemoAction[]) => actions.reduce(demoReducer, s);
const row = (s: DemoState, site: string, item: string) => timelineRows(s).find((r) => r.site === site && r.item === item)!;

describe("時間軸の行（Issue #118）", () => {
  const s0 = initialDemo();

  it("行は「確認・手配が必要な事項」の表と同じ行・同じ並び", () => {
    const cases = caseRows(s0.stock, s0.inbound, s0.needs, SITES, s0.sync);
    expect(timelineRows(s0).map((r) => `${r.site}|${r.item}`)).toEqual(cases.map((c) => `${c.site}|${c.item}`));
    expect(timelineRows(s0)).toHaveLength(12);
  });

  it("救護所の画面では、その救護所の行だけ", () => {
    expect(timelineRows(s0, "救護所B").every((r) => r.site === "救護所B")).toBe(true);
    expect(timelineRows(s0, "救護所B").length).toBeGreaterThan(0);
  });

  it("在庫切れは区間なし（切れたのはいま）。未確認・算出不可は区間を作らず、状態だけ", () => {
    const rows = timelineRows(s0);
    for (const r of rows.filter((x) => x.status === "在庫切れ")) expect(r.stockUntil).toBe(s0.minutes);
    for (const r of rows.filter((x) => x.status === "未確認" || x.status === "見込み算出不可")) {
      expect(r.stockUntil).toBeNull();
      expect(r.gap).toBeNull();
    }
    expect(rows.some((r) => r.status === "未確認")).toBe(true);
    expect(rows.some((r) => r.status === "見込み算出不可")).toBe(true);
  });

  it("在庫切れ見込みの区間の終わりは、いま＋残り日数", () => {
    const r = row(s0, "救護所B", "抗てんかん薬C");
    expect(r.status).toBe("在庫切れ見込み");
    const c = caseRows(s0.stock, s0.inbound, s0.needs, SITES, s0.sync).find((x) => x.site === "救護所B" && x.item === "抗てんかん薬C")!;
    expect(r.stockUntil).toBe(s0.minutes + Math.round(c.days! * 1440));
  });

  it("到着未定（融通の調整中・卸に照会中）に日付を作らない。文にも日付を出さない", () => {
    const r = row(s0, "救護所B", "抗凝固薬F");
    const a = r.arrivals.find((x) => x.status === "融通の調整中")!;
    expect(a.arriveAt).toBeNull();
    expect(a.departAt).toBeNull();
    const text = timelineTexts(r).join("／");
    expect(text).toContain("到着未定");
    expect(text).not.toMatch(/融通 60錠（融通の調整中）：到着見込み/);
  });

  it("在庫が切れる見込みより到着が後なら、その間を区間にする（判定の文は付けない）", () => {
    const r = row(s0, "救護所B", "吸入薬D");
    const first = Math.min(...r.arrivals.map((a) => a.arriveAt).filter((x): x is number => x !== null));
    expect(r.gap).toEqual({ from: r.stockUntil, to: first });
    const text = timelineTexts(r).join("／");
    for (const w of ["遅れ", "間に合わない", "危ない", "急い"]) expect(text).not.toContain(w);
  });

  it("横軸は日の 0:00 から（3＋1）日。いまから3日先が必ず入り、時計を進めると「いま」が右へ動く", () => {
    const w0 = timelineWindow(s0.minutes);
    expect(w0.end - w0.start).toBe((TIMELINE_DAYS + 1) * 1440);
    expect(clockText(w0.start)).toBe("11/05 00:00");
    expect(w0.end).toBeGreaterThanOrEqual(s0.minutes + TIMELINE_DAYS * 1440);
    const s1 = run(s0, { type: "tick", hours: 1 });
    expect(timelineWindow(s1.minutes).start).toBe(w0.start);
    expect(s1.minutes - s0.minutes).toBe(60);
    const s2 = run(s0, { type: "tick", hours: 24 });
    expect(clockText(timelineWindow(s2.minutes).start)).toBe("11/06 00:00");
  });

  it("到着の見込み（11/06 10:00）を過ぎると、届いた搬送は印から消える", () => {
    const before = row(s0, "救護所A", "血糖降下薬B");
    const ship = before.arrivals.find((a) => a.status === "搬送中")!;
    expect(clockText(ship.arriveAt!)).toBe("11/06 10:00");
    // 11/06 09:30 ではまだ搬送中、10:30 には受領
    const s0930 = run(s0, { type: "tick", hours: 24 });
    expect(row(s0930, "救護所A", "血糖降下薬B").arrivals.some((a) => a.status === "搬送中")).toBe(true);
    const s1 = run(s0930, { type: "tick", hours: 1 });
    const after = timelineRows(s1).find((r) => r.site === "救護所A" && r.item === "血糖降下薬B");
    // 届いた（受領）搬送は印にしない
    expect(after?.arrivals.some((a) => a.status === "搬送中") ?? false).toBe(false);
  });

  it("承認すると、その行に引当済み → 搬送中 → 受領の段階と到着の印が出る", () => {
    // 架空のカルテの登録で、本部備蓄から出せる提案を作る（orders.test.ts の recordB と同じ）
    const sR = run(s0, {
      type: "add_record",
      site: "救護所B",
      name: "架空 太郎",
      items: [{ label: "薬の名前・量（本人の言葉のまま）", value: "（未記入）" }],
      prescription: { item: "抗凝固薬F", qty: 60, days: 7 },
    });
    const p = sR.proposals.find((x) => x.site === "救護所B" && x.item === "抗凝固薬F")!;
    expect(p.fromHq).toBeGreaterThan(0);
    expect(row(sR, p.site, p.item).stage).toBe("提案");
    const s1 = run(sR, { type: "approve_proposal", id: p.id });
    const r1 = row(s1, p.site, p.item);
    expect(r1.stage).toBe("承認済み（引当済み）");
    // 印の時刻は、承認で足した搬送の出発・到着と同じ（地図の便・時計と食い違わない）
    const shipId = s1.proposals.find((x) => x.id === p.id)!.shipmentId!;
    const ship = s1.inbound.find((x) => x.id === shipId)!;
    const mark = r1.arrivals.find((a) => a.id === shipId)!;
    expect(mark).toMatchObject({ kind: "本部から搬送", departAt: ship.departAt, arriveAt: ship.arriveAt });
    // 出発後は搬送中、到着後は受領（行が残っていれば段階は受領で、その搬送の印は消える）
    const s2 = run(s1, { type: "tick", hours: 1 });
    expect(row(s2, p.site, p.item).stage).toBe("搬送中");
    const s3 = run(s1, { type: "tick", hours: 24 });
    const r3 = timelineRows(s3).find((r) => r.site === p.site && r.item === p.item);
    if (r3) {
      expect(r3.stage).toBe("受領");
      expect(r3.arrivals.some((a) => a.id === shipId)).toBe(false);
    }
  });

  it("本部に無い分を承認すると「卸に照会中」。卸への照会分は到着未定で、日付を作らない", () => {
    const p = s0.proposals.find((x) => x.site === "救護所B" && x.item === "抗てんかん薬C")!;
    expect(p.fromHq).toBe(0);
    const s1 = run(s0, { type: "approve_proposal", id: p.id });
    const r1 = row(s1, "救護所B", "抗てんかん薬C");
    expect(r1.stage).toBe("卸に照会中");
    const ws = r1.arrivals.filter((a) => a.kind === "卸への照会分");
    expect(ws.length).toBeGreaterThan(0);
    expect(ws.every((a) => a.arriveAt === null && a.departAt === null)).toBe(true);
    // 時計では動かない（人の手配が要る）
    const s2 = run(s1, { type: "tick", hours: 24 });
    expect(row(s2, "救護所B", "抗てんかん薬C").arrivals.filter((a) => a.kind === "卸への照会分").every((a) => a.arriveAt === null)).toBe(true);
  });
});
