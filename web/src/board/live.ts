// 動く地図（Issue #128）の位置と光を、デモの状態と時計（分）から求める純粋な関数。
// 新しい判断は作らない：光は summary.ts の集計（在庫切れ・切れる見込み・薬剤師の不足）と、最終報告からの時間だけで決める。
// 位置は経路の線（map.ts の MAP_ROUTES）の上を、出発と到着の時刻の割合で進める。保存・送信・ログ出力をしない（ADR-0007）。
// demo.ts の reducer は変えない（Issue #122 が同じ所を触るため）。時刻の決まりは demo.ts と同じ値を写して持つ（下）。

import { HQ, INBOUND, SITES, type RouteRow, type SiteId, type SyncRow } from "./data";
import { minutesAt, stampMinutes, type DemoInbound } from "./demo";
import { MAP_ROUTES, MAP_SITES } from "./map";
import type { SiteOverview } from "./summary";
import { BOARD_CHANGES } from "./text";

// ===== 図の上の線（経路）=====

export interface Pt {
  x: number;
  y: number;
}

/**
 * map.ts の経路の文字（M・H・V・L の絶対座標だけ）を点の列にする。
 * map.ts の経路はこの4つだけで描いている（BoardMap.test.tsx の試験）
 */
export function parsePath(d: string): Pt[] {
  const pts: Pt[] = [];
  const re = /([MLHV])\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?/g;
  let cur: Pt = { x: 0, y: 0 };
  for (const m of d.matchAll(re)) {
    const a = Number(m[2]);
    const b = m[3] !== undefined ? Number(m[3]) : NaN;
    if (m[1] === "M" || m[1] === "L") cur = { x: a, y: b };
    else if (m[1] === "H") cur = { x: a, y: cur.y };
    else cur = { x: cur.x, y: a };
    pts.push(cur);
  }
  return pts;
}

const same = (a: Pt, b: Pt) => a.x === b.x && a.y === b.y;

/** 線の長さ */
export function lineLength(pts: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** 線の上の、始まりから割合 t（0〜1）の位置。範囲の外は端に寄せる */
export function pointAt(pts: readonly Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const total = lineLength(pts);
  let left = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (left <= seg) {
      const k = seg === 0 ? 0 : left / seg;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * k };
    }
    left -= seg;
  }
  return pts[pts.length - 1];
}

/** 点の列を SVG の path の文字にする */
export function toPathD(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
}

/**
 * 本部からその救護所へ、実際に通る線。迂回のときは、本来の道を迂回の道の始まりで切って、迂回の道につなぐ。
 * 通行可・通行止めは本来の道（通行止めは連絡員が徒歩で通る道として扱う。data.ts の ROUTES の via）
 */
export function travelLine(to: SiteId, status: RouteRow["status"]): Pt[] {
  const m = MAP_ROUTES.find((r) => r.to === to);
  if (!m) return [];
  const pts = parsePath(m.d);
  if (status !== "迂回" || !m.detour) return pts;
  const det = parsePath(m.detour);
  const at = pts.findIndex((p) => same(p, det[0]));
  if (at < 0) return pts;
  return [...pts.slice(0, at + 1), ...det.slice(1)];
}

export function sitePoint(site: SiteId): Pt {
  const s = MAP_SITES.find((x) => x.site === site);
  return s ? { x: s.x, y: s.y } : { x: 0, y: 0 };
}

// ===== 光る救護所 =====

/**
 * 最終報告が古いとみなす時間（時間）。この試作で仮に置いた値で、医学的・運用上の基準ではない。
 * 光の条件に使うだけで、緊急度や優先順位は決めない
 */
// [TODO-OWNER: 最終報告が古いとみなす時間（Claude Code の下書き。12時間・仮の値）]
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（ボードの架空の数値）
// ボードの「N時間以上 報告なし」（Issue #113、text.ts の BOARD_CHANGES.staleHours）と同じ値を使い、別の閾値を作らない
export const STALE_REPORT_HOURS = BOARD_CHANGES.staleHours;

/**
 * 最終報告（在庫の確認か、記録が本部に届いた、新しいほうの時刻。BOARD_AS_OF からの分）。
 * Board.tsx の lastReportMinutes と同じ求め方（試験で突き合わせる）。無ければ null
 */
export function lastReportAt(sync: readonly SyncRow[], site: SiteId): number | null {
  const times: number[] = [];
  const checked = SITES.find((s) => s.site === site)?.stockCheckedAt;
  if (checked) times.push(stampMinutes(checked));
  const synced = sync.find((s) => s.site === site)?.lastSync;
  if (synced) times.push(stampMinutes(synced));
  return times.length > 0 ? Math.max(...times) : null;
}

export type GlowKind = "在庫切れ" | "切れる見込み" | "薬剤師の不足" | "最終報告が古い";

export interface SiteGlow {
  site: SiteId;
  /** 光の色。在庫切れがあれば赤（bad）、それ以外は黄（warn）。1つの拠点に光は1つ（色を重ねない）で、優先順位の判断ではない */
  level: "bad" | "warn";
  /** 光っている理由（既存の集計の状態。文字でも出す） */
  reasons: { kind: GlowKind; value: number }[];
}

/** 光る救護所。既存の状態（在庫切れ・切れる見込み・薬剤師の不足・最終報告からの時間）だけで決める */
export function siteGlows(overview: readonly SiteOverview[], sync: readonly SyncRow[], minutes: number): SiteGlow[] {
  const out: SiteGlow[] = [];
  for (const o of overview) {
    if (o.site === HQ) continue;
    const reasons: SiteGlow["reasons"] = [];
    if (o.outOfStock > 0) reasons.push({ kind: "在庫切れ", value: o.outOfStock });
    if (o.forecast > 0) reasons.push({ kind: "切れる見込み", value: o.forecast });
    if (o.pharmacistsShort > 0) reasons.push({ kind: "薬剤師の不足", value: o.pharmacistsShort });
    const last = lastReportAt(sync, o.site);
    if (last !== null) {
      const hours = Math.floor(Math.max(0, minutes - last) / 60);
      if (hours >= STALE_REPORT_HOURS) reasons.push({ kind: "最終報告が古い", value: hours });
    }
    if (reasons.length === 0) continue;
    out.push({ site: o.site, level: o.outOfStock > 0 ? "bad" : "warn", reasons });
  }
  return out;
}

// ===== 搬送便 =====

/** 日付だけの引当済みの搬送が本部を出る時刻（1日の中の分）。demo.ts の DEPART_MINUTE_OF_DAY と同じ値 */
export const DEPART_MINUTE_OF_DAY = 7 * 60;
/** 入荷・搬送が届く時刻（1日の中の分）。demo.ts の ARRIVAL_MINUTE_OF_DAY と同じ値 */
export const ARRIVAL_MINUTE_OF_DAY = 10 * 60;

export interface ShipmentMarker {
  id: string;
  item: string;
  qty: number;
  to: SiteId;
  /** 本部を出た時刻・届く見込みの時刻（BOARD_AS_OF からの分） */
  departAt: number;
  arriveAt: number;
  /** 進んだ割合（0〜1） */
  progress: number;
  /** 通行止めの道は連絡員が徒歩で運ぶ（data.ts の ROUTES の via） */
  mode: "搬送便" | "連絡員（徒歩）";
  x: number;
  y: number;
}

/**
 * 搬送中の本部 → 救護所の便を、経路の上の印にする。受領になると状態が変わるので消える。
 * 出発：承認で足したものは departAt。最初から搬送中のもの（data.ts の INBOUND）は、デモの始まり（0 分）に出たものとして扱う。
 * それ以外の日付だけのものは、到着見込みの日の 07:00（demo.ts で搬送中になる時刻）。
 * 到着：arriveAt か、到着見込みの日の 10:00（demo.ts で受領になる時刻）
 */
export function shipmentMarkers(inbound: readonly DemoInbound[], minutes: number, routes: readonly RouteRow[]): ShipmentMarker[] {
  const out: ShipmentMarker[] = [];
  for (const r of inbound) {
    if (r.status !== "搬送中" || r.from !== HQ || r.to === HQ || r.eta === "未定") continue;
    const seedInTransit = !r.proposalId && INBOUND.some((x) => x.id === r.id && x.status === "搬送中");
    const departAt = r.departAt ?? (seedInTransit ? 0 : minutesAt(r.eta, DEPART_MINUTE_OF_DAY));
    const arriveAt = r.arriveAt ?? minutesAt(r.eta, ARRIVAL_MINUTE_OF_DAY);
    const span = arriveAt - departAt;
    const progress = span <= 0 ? 1 : Math.min(1, Math.max(0, (minutes - departAt) / span));
    const status = routes.find((x) => x.to === r.to)?.status ?? "通行可";
    const p = pointAt(travelLine(r.to, status), progress);
    out.push({
      id: r.id,
      item: r.item,
      qty: r.qty,
      to: r.to,
      departAt,
      arriveAt,
      progress,
      mode: status === "通行止め" ? "連絡員（徒歩）" : "搬送便",
      x: p.x,
      y: p.y,
    });
  }
  return out;
}
