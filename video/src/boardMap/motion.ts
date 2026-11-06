// 動画の中の「以前の動き」と「今の動き」、道の上にいるかの検査（Issue #167 の内容を見せるため）。
// 今の動き：web/src/board/vehicles.ts の vehicleAt（時刻ごとに経路の線の上の位置を求める）をそのまま使う。
// 以前の動き：Issue #167 の前のアプリは、時計が1時間進むたびにその時刻の位置を求め、前の位置からそこまでを
//   CSS の transition（transform 1.8s linear。デモの自動の時計は2秒で1時間）で直線に移していた。
//   ここではそれを、今のデータ（ROUTES）の上で再現する（録画ではない。以前は救護所Dを巡回に入れていなかった）。
// 検査は web/src/board/live.test.ts「道に沿って動く（Issue #167）」の onRoad と同じ考え（縦・横の道か、川沿いの道の上）。
import { ROUTES } from "../../../web/src/board/data";
import { parsePath, type Pt } from "../../../web/src/board/live";
import { MAP_LOCAL_ROADS, STREETS_H, STREETS_V } from "../../../web/src/board/map";
import { patrolLegs, vehicleAt } from "../../../web/src/board/vehicles";

/** 以前のアプリで位置を求め直した間隔（分）。デモの自動の時計の1刻み（2秒で1時間） */
export const OLD_TICK_MINUTES = 60;
/** 以前の CSS の transition の長さの、1刻みに対する割合（1.8秒 ÷ 2秒） */
const OLD_TRANSITION_SHARE = 1.8 / 2;

export const nowAt = (minutes: number): Pt => {
  const v = vehicleAt(minutes, ROUTES);
  return { x: v.x, y: v.y };
};

/** 以前の動き：刻みの時刻 a に、1つ前の刻みの位置から a の位置へ、1刻みの 9 割の時間をかけて直線で移る */
export const beforeAt = (minutes: number): Pt => {
  const a = Math.floor(minutes / OLD_TICK_MINUTES) * OLD_TICK_MINUTES;
  const pa = nowAt(a - OLD_TICK_MINUTES);
  const pb = nowAt(a);
  const k = Math.min(1, (minutes - a) / (OLD_TICK_MINUTES * OLD_TRANSITION_SHARE));
  return { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k };
};

const river = MAP_LOCAL_ROADS.map(parsePath);
const onRiverRoad = (p: Pt) =>
  river.some((pts) =>
    pts.slice(1).some((b, i) => {
      const a = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
      if (t < -0.001 || t > 1.001) return false;
      return Math.hypot(a.x + (b.x - a.x) * t - p.x, a.y + (b.y - a.y) * t - p.y) < 0.6;
    }),
  );

export const onRoad = (p: Pt) =>
  STREETS_V.some((v) => Math.abs(v - p.x) < 0.6) || STREETS_H.some((h) => Math.abs(h - p.y) < 0.6) || onRiverRoad(p);

/** 巡回の1周の長さ（分） */
export const PATROL_CYCLE = (() => {
  const legs = patrolLegs(ROUTES);
  return legs[legs.length - 1].end;
})();

/** 本部からその救護所へ向かう移動の始まりと終わり（分） */
export const legTo = (site: "救護所A" | "救護所B" | "救護所C" | "救護所D") => {
  const leg = patrolLegs(ROUTES).find((l) => l.kind === "移動" && l.to === site)!;
  return { start: leg.start, end: leg.end };
};

/** 救護所Dへ向かう移動（迂回の道） */
export const D_LEG = legTo("救護所D");
/** 救護所Cへ向かう移動（以前と今を並べる場面で使う。以前の動きでは本部から救護所Cへ斜めに横切る） */
export const C_LEG = legTo("救護所C");

export interface CheckRow {
  /** 巡回の1周を 0.5 分ごとに見た時刻の数 */
  total: number;
  /** 道の上にいなかった時刻（見た順） */
  offRoadAt: number[];
}

/** 巡回の1周を 0.5 分ごとに見て、道の上にいるかを数える（live.test.ts と同じ刻み） */
const check = (at: (m: number) => Pt): CheckRow => {
  const offRoadAt: number[] = [];
  let total = 0;
  for (let m = 0; m <= PATROL_CYCLE; m += 0.5) {
    total++;
    if (!onRoad(at(m))) offRoadAt.push(total);
  }
  return { total, offRoadAt };
};

export const CHECK_BEFORE = check(beforeAt);
export const CHECK_NOW = check(nowAt);
