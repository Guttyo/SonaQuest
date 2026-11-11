// アクセス記録を、人がした操作だけ・その操作をした人の名前で・正しい対象に残す決まり（Issue #289）。
// 試験の環境には DOM が無いので、画面（Board.tsx）の開閉・非同期の処理で使う決まりを、ここで確かめる
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionFor, staffFor } from "./access";
import { afterAuditWait, claimChartEdits, createTimerBag, opensOnSummaryClick, pendingChartEdit } from "./accessTiming";
import { demoReducer, initialDemo, nextRecordId, type DemoAction, type DemoState } from "./demo";
import type { SiteId } from "./data";

const run = (s: DemoState, ...actions: DemoAction[]) => actions.reduce(demoReducer, s);
const entry = (site: SiteId, name = "架空 太郎"): Extract<DemoAction, { type: "add_record" }> => ({
  type: "add_record",
  site,
  name,
  items: [{ label: "薬の名前・量（本人の言葉のまま）", value: "（未記入）" }],
  prescription: null,
});

describe("「カルテを開いた」は人が見出しを押して開いたときだけ（Issue #289 の 1）", () => {
  it("閉じている details の見出しを押したら記録する。開いているものを押して閉じるときは記録しない", () => {
    expect(opensOnSummaryClick({ open: false })).toBe(true);
    expect(opensOnSummaryClick({ open: true })).toBe(false);
  });
  it("自動で開いたカルテ（open 属性で開いた）を人が閉じて開き直すと、開き直しの1回だけ記録する", () => {
    const details = { open: true };
    const logged: boolean[] = [];
    // 人が閉じる
    logged.push(opensOnSummaryClick(details));
    details.open = false;
    // 人が開き直す
    logged.push(opensOnSummaryClick(details));
    details.open = true;
    expect(logged.filter(Boolean)).toHaveLength(1);
  });
  it("親の details が見つからないときは記録しない", () => {
    expect(opensOnSummaryClick(null)).toBe(false);
    expect(opensOnSummaryClick(undefined)).toBe(false);
  });
});

describe("監査の結果を待った後（Issue #289 の 2）", () => {
  it("同じログインのままなら、結果を入れて「監査の結果」を残す", () => {
    expect(afterAuditWait({ mounted: true, sameLogin: true })).toEqual({ apply: true, log: true });
  });
  it("ログインが入れ替わっていたら、結果は入れる（「AI監査中」のまま止めない）が、「監査の結果」は残さない", () => {
    expect(afterAuditWait({ mounted: true, sameLogin: false })).toEqual({ apply: true, log: false });
  });
  it("画面から外れていたら何もしない", () => {
    expect(afterAuditWait({ mounted: false, sameLogin: true })).toEqual({ apply: false, log: false });
  });
});

describe("見本の監査のタイマーは、画面を離れるとまとめて消える（Issue #289 の 2 の後片付け）", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("待っているあいだに clearAll すると、残るタイマーが無く、結果の処理も呼ばれない", () => {
    vi.useFakeTimers();
    const bag = createTimerBag();
    const fn = vi.fn();
    bag.set(fn, 1500);
    expect(bag.size).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
    bag.clearAll();
    expect(bag.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(fn).not.toHaveBeenCalled();
  });
  it("時間が来たら1回呼ばれ、持っているタイマーから外れる", () => {
    vi.useFakeTimers();
    const bag = createTimerBag();
    const fn = vi.fn();
    bag.set(fn, 1500);
    vi.advanceTimersByTime(1500);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bag.size).toBe(0);
  });
});

describe("「カルテを編集した」は、reducer が実際に作った記録の番号で残す（Issue #289 の 3）", () => {
  const who = sessionFor("救護所A");

  it("Worker の応答を待つあいだに同じ救護所に架空の患者が到着しても、実際に加わった記録の番号になる", () => {
    const started = demoReducer(initialDemo(), { type: "arrivals", active: true });
    const first = started.arrivals.plan[0];
    const site = first.site;
    // 待つ前の状態（ここで番号を作ると、到着の分だけずれる）
    const before = started;
    const pending = [pendingChartEdit(before.records, site, "架空 太郎", who)];
    // 待つあいだに到着が進み、その後に入力が reducer に渡る
    const arrived = run(before, { type: "tick", hours: first.hour });
    expect(arrived.records.filter((r) => r.site === site).length).toBeGreaterThan(before.records.filter((r) => r.site === site).length);
    const after = demoReducer(arrived, entry(site));
    const { claimed, rest } = claimChartEdits(pending, after.records);
    const actual = after.records.find((r) => r.site === site && r.name === "架空 太郎" && r.patientNo === undefined)!;
    expect(claimed).toEqual([{ id: actual.id, who }]);
    expect(actual.id).not.toBe(nextRecordId(before, site));
    expect(rest).toEqual([]);
  });

  it("まだ記録が入っていなければ、待ったまま残す", () => {
    const s = initialDemo();
    const pending = [pendingChartEdit(s.records, "救護所A", "架空 太郎", who)];
    const { claimed, rest } = claimChartEdits(pending, s.records);
    expect(claimed).toEqual([]);
    expect(rest).toEqual(pending);
  });

  it("同じ救護所・同じ氏名の再来では、前からある記録と取り違えず、新しい記録の番号になる", () => {
    const s1 = demoReducer(initialDemo(), entry("救護所A"));
    const firstId = s1.records[0].id;
    const pending = [pendingChartEdit(s1.records, "救護所A", "架空 太郎", who)];
    // 入力が反映される前に結び付けても、前の記録を拾わない
    expect(claimChartEdits(pending, s1.records).claimed).toEqual([]);
    const s2 = demoReducer(s1, entry("救護所A"));
    const { claimed } = claimChartEdits(pending, s2.records);
    expect(claimed).toEqual([{ id: s2.records[0].id, who }]);
    expect(s2.records[0].id).not.toBe(firstId);
  });

  it("同じ人を続けて2回入力しても、それぞれ別の記録の番号になる", () => {
    const s0 = initialDemo();
    const p1 = pendingChartEdit(s0.records, "救護所A", "架空 太郎", who);
    const p2 = pendingChartEdit(s0.records, "救護所A", "架空 太郎", who);
    const s2 = run(s0, entry("救護所A"), entry("救護所A"));
    const ids = claimChartEdits([p1, p2], s2.records).claimed.map((c) => c.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("2つの入力が1回の描画にまとめて入っても、先に渡した入力が先に入った記録の番号・その操作をした人になる", () => {
    const s0 = initialDemo();
    const other = { site: "救護所A" as const, staff: staffFor("救護所A")[1] };
    expect(other.staff).toBeDefined();
    expect(other.staff).not.toBe(who.staff);
    const p1 = pendingChartEdit(s0.records, "救護所A", "架空 太郎", who);
    const p2 = pendingChartEdit(s0.records, "救護所A", "架空 太郎", other);
    const s1 = demoReducer(s0, entry("救護所A"));
    const firstId = s1.records[0].id;
    const s2 = demoReducer(s1, entry("救護所A"));
    const secondId = s2.records[0].id;
    expect(claimChartEdits([p1, p2], s2.records).claimed).toEqual([
      { id: firstId, who },
      { id: secondId, who: other },
    ]);
  });

  it("到着した架空の患者の記録（番号を持つもの）は、人の入力として拾わない", () => {
    const started = demoReducer(initialDemo(), { type: "arrivals", active: true });
    const first = started.arrivals.plan[0];
    const arrived = run(started, { type: "tick", hours: first.hour });
    const patient = arrived.records.find((r) => r.patientNo !== undefined)!;
    const pending = [pendingChartEdit(started.records, patient.site, patient.name, who)];
    expect(claimChartEdits(pending, arrived.records).claimed).toEqual([]);
  });
});
