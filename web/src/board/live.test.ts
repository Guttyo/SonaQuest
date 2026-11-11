// 動く地図（Issue #128）の位置と光の純粋な関数。デモの状態と時計だけから求まることを確かめる
import { describe, expect, it } from "vitest";
import { HQ, PATIENTS, ROUTES, SHELTERS, SITES, STOCK, SYNC, type RouteRow } from "./data";
import { ARRIVAL_MINUTE_OF_DAY, demoReducer, initialDemo, lastReportAt, minutesAt, type DemoInbound } from "./demo";
import { MAP_LOCAL_ROADS, MAP_ROUTES, MAP_SITES, STREETS_H, STREETS_V } from "./map";
import { siteOverview } from "./summary";
import {
  STALE_REPORT_HOURS,
  lineLength,
  parsePath,
  pointAt,
  shipmentMarkers,
  siteGlows,
  sitePoint,
  travelLine,
} from "./live";
import { PATROL, patrolLegs, vehicleAt } from "./vehicles";
import { lastReportMinutes } from "../screens/Board";

const overview = siteOverview(STOCK, PATIENTS, SITES, SYNC, ROUTES);

describe("経路の線", () => {
  it("M・H・V・L の文字を点の列にする", () => {
    expect(parsePath("M760,92 V320 H590")).toEqual([
      { x: 760, y: 92 },
      { x: 760, y: 320 },
      { x: 590, y: 320 },
    ]);
    expect(parsePath("M235,130 L252,250")).toEqual([
      { x: 235, y: 130 },
      { x: 252, y: 250 },
    ]);
  });

  it("どの経路も本部から始まり、行き先の救護所の位置で終わる（迂回の線も）", () => {
    const hq = sitePoint(HQ);
    for (const m of MAP_ROUTES) {
      const end = MAP_SITES.find((s) => s.site === m.to)!;
      for (const status of ["通行可", "迂回", "通行止め"] as const) {
        const line = travelLine(m.to, status);
        expect(line[0]).toEqual(hq);
        expect(line[line.length - 1]).toEqual({ x: end.x, y: end.y });
      }
    }
  });

  it("迂回のときは、本来の道を迂回の道の始まりで切って迂回の道につなぐ（通れない川沿いの道を通らない）", () => {
    const line = travelLine("救護所B", "迂回");
    expect(line).toEqual(parsePath("M760,92 V130 H235 H70 V320 H140"));
    expect(line.some((p) => p.x === 252 && p.y === 250)).toBe(false);
    // 迂回の道が無い経路は本来の道のまま
    expect(travelLine("救護所A", "迂回")).toEqual(parsePath(MAP_ROUTES[0].d));
  });

  it("救護所D の迂回は、土砂の場所（山すその道）を通らず南の幹線から入る（Issue #167）", () => {
    const line = travelLine("救護所D", "迂回");
    expect(line).toEqual(parsePath("M760,92 V130 V440 H880 V540"));
    const blocked = MAP_ROUTES.find((m) => m.to === "救護所D")!.blocked!;
    // 線の上の点を細かく見て、× の場所に近づかない
    for (let i = 0; i <= 200; i++) {
      const p = pointAt(line, i / 200);
      expect(Math.hypot(p.x - blocked.x, p.y - blocked.y)).toBeGreaterThan(30);
    }
  });

  it("どの経路も、迂回のときは × の場所を通らない。線はすべて縦か横の道（または川沿いの道）の上", () => {
    for (const m of MAP_ROUTES) {
      if (!m.blocked) continue;
      const line = travelLine(m.to, "迂回");
      for (let i = 0; i <= 200; i++) {
        const p = pointAt(line, i / 200);
        expect(Math.hypot(p.x - m.blocked.x, p.y - m.blocked.y)).toBeGreaterThan(30);
      }
      for (let i = 1; i < line.length; i++) {
        expect(line[i].x === line[i - 1].x || line[i].y === line[i - 1].y).toBe(true);
      }
    }
  });

  it("割合の位置：0 は始まり、1 は終わり、半分は長さの半分。範囲の外は端に寄せる", () => {
    const pts = parsePath("M0,0 H100 V100");
    expect(lineLength(pts)).toBe(200);
    expect(pointAt(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(pts, 0.5)).toEqual({ x: 100, y: 0 });
    expect(pointAt(pts, 0.75)).toEqual({ x: 100, y: 50 });
    expect(pointAt(pts, 1)).toEqual({ x: 100, y: 100 });
    expect(pointAt(pts, -1)).toEqual({ x: 0, y: 0 });
    expect(pointAt(pts, 2)).toEqual({ x: 100, y: 100 });
  });
});

describe("光る救護所（既存の状態だけで決める）", () => {
  it("最終報告の求め方は、救護所の詳細の「最終報告 N 時間前」と同じ", () => {
    const s = demoReducer(initialDemo(), { type: "tick", hours: 30 });
    for (const site of [...SHELTERS, HQ]) {
      expect(lastReportAt(s.sync, site)).toBe(lastReportMinutes(s, site));
    }
  });

  it("在庫切れがあれば赤、切れる見込み・薬剤師の不足・最終報告が古いだけなら黄。理由を数で持つ", () => {
    const g = siteGlows(overview, SYNC, 0);
    const c = g.find((x) => x.site === "救護所C")!;
    expect(c.level).toBe("bad");
    expect(c.reasons).toContainEqual({ kind: "在庫切れ", value: 1 });
    const b = g.find((x) => x.site === "救護所B")!;
    expect(b.level).toBe("warn");
    expect(b.reasons.map((r) => r.kind)).toEqual(["切れる見込み", "薬剤師の不足", "最終報告が古い"]);
    // 救護所B の最終報告は 11/04 18:00（始まりの 09:30 から 15 時間前）
    expect(b.reasons.find((r) => r.kind === "最終報告が古い")?.value).toBe(15);
    // 本部は光らない
    expect(g.some((x) => x.site === HQ)).toBe(false);
  });

  it("どの状態にも当たらない救護所は光らない。最終報告は閾値（仮の値）から古いとみなす", () => {
    const calm = overview.map((o) => ({ ...o, outOfStock: 0, forecast: 0, pharmacistsShort: 0 }));
    // 救護所A の最終報告は 11/05 07:30。閾値の直前までは光らず、閾値で光る
    const last = lastReportAt(SYNC, "救護所A")!;
    const before = siteGlows(calm, SYNC, last + STALE_REPORT_HOURS * 60 - 1);
    expect(before.some((x) => x.site === "救護所A")).toBe(false);
    const after = siteGlows(calm, SYNC, last + STALE_REPORT_HOURS * 60);
    expect(after.find((x) => x.site === "救護所A")?.reasons).toEqual([{ kind: "最終報告が古い", value: STALE_REPORT_HOURS }]);
    expect(after.find((x) => x.site === "救護所A")?.level).toBe("warn");
  });

  it("未確認・見込み算出不可だけでは光らない（新しい条件を作らない）", () => {
    const only = overview.map((o) => ({ ...o, outOfStock: 0, forecast: 0, pharmacistsShort: 0, unconfirmed: 3, noPace: 2 }));
    expect(siteGlows(only, SYNC, 0).filter((x) => x.site === "救護所A" || x.site === "救護所C")).toEqual([]);
  });
});

describe("搬送便の印", () => {
  it("始まりの状態：最初から搬送中の便が2つ。本部を出たところにいる", () => {
    const s = initialDemo();
    const m = shipmentMarkers(s.inbound, 0, ROUTES);
    expect(m.map((x) => x.id).sort()).toEqual(["2", "3"]);
    for (const x of m) {
      expect(x.progress).toBe(0);
      expect({ x: x.x, y: x.y }).toEqual(sitePoint(HQ));
      expect(x.arriveAt).toBe(minutesAt("2026-11-06", ARRIVAL_MINUTE_OF_DAY));
    }
  });

  it("時計が進むと経路に沿って進み、受領の時刻の直前には救護所の手前にいる", () => {
    const s = initialDemo();
    const arrive = minutesAt("2026-11-06", ARRIVAL_MINUTE_OF_DAY);
    const half = shipmentMarkers(s.inbound, arrive / 2, ROUTES).find((x) => x.id === "3")!;
    expect(half.progress).toBeCloseTo(0.5);
    expect(half).toMatchObject(pointAt(travelLine("救護所A", "通行可"), 0.5));
    // 救護所B 行きは迂回の道の上を通る
    const b = shipmentMarkers(s.inbound, arrive * 0.9, ROUTES).find((x) => x.id === "2")!;
    expect(b.mode).toBe("搬送便");
    expect(b).toMatchObject(pointAt(travelLine("救護所B", "迂回"), 0.9));
  });

  it("受領になると消える（demo.ts の受領の時刻と、この関数の到着の時刻が合う）", () => {
    let s = initialDemo();
    const arrive = minutesAt("2026-11-06", ARRIVAL_MINUTE_OF_DAY);
    // 到着の1時間前まで進めると、まだ搬送中
    const hours = Math.floor(arrive / 60);
    s = demoReducer(s, { type: "tick", hours });
    expect(s.minutes).toBeLessThan(arrive);
    // 救護所C 行きの消毒薬（id 8）も 07:00 に出て搬送中になっている
    expect(shipmentMarkers(s.inbound, s.minutes, ROUTES).map((x) => x.id).sort()).toEqual(["2", "3", "8"]);
    s = demoReducer(s, { type: "tick", hours: 1 });
    expect(s.minutes).toBeGreaterThanOrEqual(arrive);
    expect(shipmentMarkers(s.inbound, s.minutes, ROUTES).filter((x) => x.id === "2" || x.id === "3")).toEqual([]);
  });

  it("引当済みの便は、demo.ts で搬送中になってから印になり、本部から出る", () => {
    let s = initialDemo();
    // 救護所C 行きの消毒薬（id 8）は 11/06 07:00 に搬送中になる
    s = demoReducer(s, { type: "tick", hours: 21 });
    expect(shipmentMarkers(s.inbound, s.minutes, ROUTES).some((x) => x.id === "8")).toBe(false);
    s = demoReducer(s, { type: "tick", hours: 1 });
    const m = shipmentMarkers(s.inbound, s.minutes, ROUTES).find((x) => x.id === "8")!;
    expect(m.departAt).toBe(minutesAt("2026-11-06", 7 * 60));
    expect(m.progress).toBeGreaterThan(0);
    expect(m.progress).toBeLessThan(1);
  });

  it("承認で足した便は departAt・arriveAt で進む。通行止めの道は連絡員（徒歩）として出す", () => {
    const row: DemoInbound = {
      id: "S-01",
      item: "降圧薬A",
      from: HQ,
      to: "救護所D",
      qty: 10,
      eta: "2026-11-05",
      status: "搬送中",
      departAt: 60,
      arriveAt: 180,
      proposalId: "P-01",
    };
    const closed: RouteRow[] = ROUTES.map((r) => (r.to === "救護所D" ? { ...r, status: "通行止め", minutes: null } : r));
    const [m] = shipmentMarkers([row], 120, closed);
    expect(m.progress).toBeCloseTo(0.5);
    expect(m.mode).toBe("連絡員（徒歩）");
    // 迂回のときは搬送便が迂回の道を通る（Issue #167）
    const [v] = shipmentMarkers([row], 120, ROUTES);
    expect(v.mode).toBe("搬送便");
    expect(v).toMatchObject(pointAt(travelLine("救護所D", "迂回"), 0.5));
    // 受領・引当済み・救護所どうしの融通・本部向けの入荷は印にしない
    const others: DemoInbound[] = [
      { ...row, status: "受領" },
      { ...row, status: "引当済み" },
      { ...row, from: "救護所A" },
      { ...row, to: HQ, from: "供給元（卸）" },
      { ...row, eta: "未定" },
    ];
    expect(shipmentMarkers(others, 120, ROUTES)).toEqual([]);
  });
});

describe("医療チームの車（架空・模擬）", () => {
  it("通行止めの救護所には行かない。迂回の救護所（救護所D）は迂回の道で回る", () => {
    const legs = patrolLegs(ROUTES);
    expect(legs.filter((l) => l.kind === "移動" && l.from === HQ).map((l) => l.to)).toEqual(["救護所A", "救護所C", "救護所B", "救護所D"]);
    expect(legs.find((l) => l.kind === "移動" && l.to === "救護所D")!.line).toEqual(travelLine("救護所D", "迂回"));
    const closed: RouteRow[] = ROUTES.map((r) => (r.to === "救護所D" ? { ...r, status: "通行止め", minutes: null } : r));
    expect(patrolLegs(closed).some((l) => l.to === "救護所D" || l.from === "救護所D")).toBe(false);
  });

  it("始まりは本部で停車中で、次の行き先は救護所A", () => {
    const v = vehicleAt(0, ROUTES);
    expect(v.state).toBe("停車中");
    expect(v.at).toBe(HQ);
    expect(v.to).toBe("救護所A");
    expect(v.arriveAt).toBe(PATROL.dwellHq + 25);
    expect({ x: v.x, y: v.y }).toEqual(sitePoint(HQ));
  });

  it("移動中は経路の線の上にいて、着くと救護所で停車する。巡回を繰り返す", () => {
    const toA = travelLine("救護所A", "通行可");
    const mid = vehicleAt(PATROL.dwellHq + 12.5, ROUTES);
    expect(mid.state).toBe("移動中");
    expect(mid.to).toBe("救護所A");
    expect(mid).toMatchObject(pointAt(toA, 0.5));
    const atA = vehicleAt(PATROL.dwellHq + 25, ROUTES);
    expect(atA.state).toBe("停車中");
    expect(atA.at).toBe("救護所A");
    expect(atA.to).toBe(HQ);
    const legs = patrolLegs(ROUTES);
    const cycle = legs[legs.length - 1].end;
    expect(vehicleAt(cycle + 7, ROUTES)).toEqual({ ...vehicleAt(7, ROUTES), arriveAt: vehicleAt(7, ROUTES).arriveAt + cycle });
  });

  it("1周の最後の停車の次は、次の周の最初の行き先（到着見込みは次の周の時刻）", () => {
    const legs = patrolLegs(ROUTES);
    const cycle = legs[legs.length - 1].end;
    // 最後の脚は本部へ戻る移動。戻った直後（次の周の 0 分）は本部で停車
    const v = vehicleAt(cycle, ROUTES);
    expect(v.at).toBe(HQ);
    expect(v.to).toBe("救護所A");
    expect(v.arriveAt).toBe(cycle + PATROL.dwellHq + 25);
  });

  it("行ける救護所が無ければ本部に留まる", () => {
    const closed: RouteRow[] = ROUTES.map((r) => ({ ...r, status: "通行止め", minutes: null }));
    const v = vehicleAt(500, closed);
    expect(v.state).toBe("停車中");
    expect(v.at).toBe(HQ);
    expect(v.to).toBe(HQ);
  });

  it("車は現在地と行き先だけを持ち、患者や医療の内容を持たない", () => {
    expect(Object.keys(vehicleAt(100, ROUTES)).sort()).toEqual(["arriveAt", "at", "state", "to", "x", "y"]);
  });
});

describe("道に沿って動く（Issue #167）", () => {
  // 背景の道：碁盤目の道（縦・横）と、碁盤目に乗らない川沿いの道
  const river = MAP_LOCAL_ROADS.map(parsePath);
  const onRiverRoad = (p: { x: number; y: number }) =>
    river.some((pts) =>
      pts.slice(1).some((b, i) => {
        const a = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
        if (t < -0.001 || t > 1.001) return false;
        return Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y) < 0.6;
      }),
    );
  const onRoad = (p: { x: number; y: number }) =>
    STREETS_V.some((v) => Math.abs(v - p.x) < 0.6) || STREETS_H.some((h) => Math.abs(h - p.y) < 0.6) || onRiverRoad(p);

  it("医療チームの車は、巡回の1周のどの時刻でも背景の道の上にいる（救護所の間を直線で横切らない）", () => {
    const legs = patrolLegs(ROUTES);
    const cycle = legs[legs.length - 1].end;
    for (let m = 0; m <= cycle; m += 0.5) {
      const v = vehicleAt(m, ROUTES);
      expect(onRoad(v), `${m} 分：(${v.x}, ${v.y})`).toBe(true);
    }
  });

  it("搬送便は、出発から到着までのどの時刻でも背景の道の上にいて、通れない場所（×）に近づかない", () => {
    for (const to of SHELTERS) {
      const row: DemoInbound = { id: `T-${to}`, item: "降圧薬A", from: HQ, to, qty: 10, eta: "2026-11-05", status: "搬送中", departAt: 0, arriveAt: 100, proposalId: "P-99" };
      const blocked = MAP_ROUTES.find((m) => m.to === to)?.blocked;
      const status = ROUTES.find((r) => r.to === to)!.status;
      for (let m = 0; m <= 100; m += 1) {
        const [s] = shipmentMarkers([row], m, ROUTES);
        expect(onRoad(s), `${to} ${m} 分：(${s.x}, ${s.y})`).toBe(true);
        if (blocked && status !== "通行止め") expect(Math.hypot(s.x - blocked.x, s.y - blocked.y)).toBeGreaterThan(30);
      }
    }
  });
});
