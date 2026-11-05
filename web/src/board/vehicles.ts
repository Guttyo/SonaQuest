// 架空の医療チームの車（ドクターカー）1台の巡回（Issue #128）。架空・模擬のデータで、実在の車両・団体・人を表さない。
// 持つのは現在地と行き先だけで、患者や医療の内容は持たない。位置はデモ時計（分）から求める純粋な関数。
// 巡回の順番と停車の時間は、この試作で仮に置いた値。通行止めの救護所には行かない（経路の状態から、求めるときに除く）。

import { HQ, type RouteRow, type SiteId } from "./data";
import { pointAt, sitePoint, travelLine, type Pt } from "./live";

export const PATROL = {
  /** 本部を出て、この順に救護所を回り、そのつど本部へ戻る */
  stops: ["救護所A", "救護所C", "救護所B", "救護所D"] as readonly SiteId[],
  /** 救護所での停車（分。仮の値） */
  dwellSite: 40,
  /** 本部での停車（分。仮の値） */
  dwellHq: 20,
} as const;

export interface PatrolLeg {
  kind: "移動" | "停車";
  from: SiteId;
  to: SiteId;
  /** 巡回の始まりからの分 */
  start: number;
  end: number;
  /** 移動の線（停車は空） */
  line: Pt[];
}

/**
 * 巡回の1周（本部で停車 → 救護所へ → 停車 → 本部へ …）。
 * 通行止めの救護所と、所要時間の目安が無い救護所は除く。行ける救護所が無ければ本部で停車だけ
 */
export function patrolLegs(routes: readonly RouteRow[]): PatrolLeg[] {
  const legs: PatrolLeg[] = [];
  let t = 0;
  const push = (kind: PatrolLeg["kind"], from: SiteId, to: SiteId, dur: number, line: Pt[]) => {
    legs.push({ kind, from, to, start: t, end: t + dur, line });
    t += dur;
  };
  for (const site of PATROL.stops) {
    const r = routes.find((x) => x.to === site);
    if (!r || r.status === "通行止め" || r.minutes === null || r.minutes <= 0) continue;
    const go = travelLine(site, r.status);
    push("停車", HQ, HQ, PATROL.dwellHq, []);
    push("移動", HQ, site, r.minutes, go);
    push("停車", site, site, PATROL.dwellSite, []);
    push("移動", site, HQ, r.minutes, [...go].reverse());
  }
  if (legs.length === 0) push("停車", HQ, HQ, PATROL.dwellHq, []);
  return legs;
}

export interface VehicleNow {
  x: number;
  y: number;
  state: "移動中" | "停車中";
  /** 今いる拠点（停車中だけ） */
  at: SiteId | null;
  /** 次の行き先 */
  to: SiteId;
  /** 次の行き先に着く見込み（BOARD_AS_OF からの分） */
  arriveAt: number;
}

/** デモ時計の分 → 車の現在地・行き先・到着見込み。巡回を繰り返す（デモの始まりの 0 分に本部で停車から始まる） */
export function vehicleAt(minutes: number, routes: readonly RouteRow[]): VehicleNow {
  const legs = patrolLegs(routes);
  const cycle = legs[legs.length - 1].end;
  const m = ((minutes % cycle) + cycle) % cycle;
  const base = minutes - m;
  const i = Math.max(
    0,
    legs.findIndex((l) => m >= l.start && m < l.end),
  );
  const leg = legs[i];
  if (leg.kind === "移動") {
    const p = pointAt(leg.line, (m - leg.start) / (leg.end - leg.start));
    return { x: p.x, y: p.y, state: "移動中", at: null, to: leg.to, arriveAt: base + leg.end };
  }
  // 停車中：次の移動の行き先と、着く見込み。行ける救護所が無ければ本部に留まる
  const p = sitePoint(leg.from);
  let next: PatrolLeg | undefined;
  let offset = 0;
  for (let k = 1; k <= legs.length; k++) {
    const j = i + k;
    const wrapped = j >= legs.length;
    const cand = legs[j % legs.length];
    if (cand.kind === "移動") {
      next = cand;
      offset = wrapped ? cycle : 0;
      break;
    }
  }
  if (!next) return { x: p.x, y: p.y, state: "停車中", at: leg.from, to: leg.from, arriveAt: base + leg.end };
  return { x: p.x, y: p.y, state: "停車中", at: leg.from, to: next.to, arriveAt: base + offset + next.end };
}
