// ボードの集計（Issue #97）。画面から切り離した純粋な関数。入力は data.ts の架空データ。
// ここで出すのは在庫と人数の算数だけで、薬の正誤や処方の判断はしない。

import {
  COVER_GUIDE_DAYS,
  HQ,
  SHELTERS,
  type DemandRow,
  type InboundRow,
  type PatientRow,
  type SiteId,
  type StockRow,
  type SyncRow,
} from "./data";

/** 残り日数。本部備蓄（出庫のペース 0）は null */
export function daysLeft(row: StockRow): number | null {
  if (row.dailyUse <= 0) return null;
  return Math.round((row.onHand / row.dailyUse) * 10) / 10;
}

export type Level = "bad" | "warn" | "ok";

/** 色分けの段階。目安（COVER_GUIDE_DAYS）より短ければ bad、その1日先までが warn */
export function levelOf(days: number): Level {
  if (days < COVER_GUIDE_DAYS) return "bad";
  if (days < COVER_GUIDE_DAYS + 2) return "warn";
  return "ok";
}

export function latestDate(patients: readonly PatientRow[]): string {
  return patients.map((r) => r.date).sort().at(-1) ?? "";
}

export interface TodaySummary {
  date: string;
  patients: number;
  chronic: number;
}

export function todaySummary(patients: readonly PatientRow[]): TodaySummary {
  const date = latestDate(patients);
  const rows = patients.filter((r) => r.date === date);
  return {
    date,
    patients: rows.reduce((a, r) => a + r.patients, 0),
    chronic: rows.reduce((a, r) => a + r.chronic, 0),
  };
}

export interface CriticalItem {
  site: SiteId;
  item: string;
  days: number;
}

/** 本部備蓄を除き、目安の日数より短い救護所×品目（在庫 0 を含む）。短い順 */
export function criticalItems(stock: readonly StockRow[]): CriticalItem[] {
  return stock
    .filter((r) => r.site !== HQ)
    .map((r) => ({ site: r.site, item: r.item, days: daysLeft(r) ?? 0 }))
    .filter((r) => r.days < COVER_GUIDE_DAYS)
    .sort((a, b) => a.days - b.days);
}

export interface PendingSummary {
  pending: number;
  offlineSites: number;
}

export function pendingSummary(sync: readonly SyncRow[]): PendingSummary {
  return {
    pending: sync.reduce((a, r) => a + r.pending, 0),
    offlineSites: sync.filter((r) => r.mode === "紙で記録・通信なし").length,
  };
}

export interface InboundSummary {
  count: number;
  undated: number;
}

export function inboundSummary(inbound: readonly InboundRow[]): InboundSummary {
  return { count: inbound.length, undated: inbound.filter((r) => r.eta === "未定").length };
}

export interface ShelterRow {
  site: SiteId;
  patients: number | null;
  evacuees: number | null;
  daysCovered: number | null;
  /** 目安より短い品目の文（「抗てんかん薬C（あと1日）」） */
  critical: string[];
  mode: string;
  pending: number | null;
}

/** 救護所ごとの1行。並びは、在庫でまかなえる日数が短い順 */
export function shelterRows(
  stock: readonly StockRow[],
  patients: readonly PatientRow[],
  sync: readonly SyncRow[],
  demand: readonly DemandRow[],
): ShelterRow[] {
  const date = latestDate(patients);
  const critical = criticalItems(stock);
  return SHELTERS.map((site) => {
    const p = patients.find((r) => r.date === date && r.site === site);
    const d = demand.find((r) => r.site === site);
    const s = sync.find((r) => r.site === site);
    return {
      site,
      patients: p ? p.patients : null,
      evacuees: d ? d.evacuees : null,
      daysCovered: d ? d.daysCovered : null,
      critical: critical
        .filter((c) => c.site === site)
        .map((c) => `${c.item}（${c.days === 0 ? "切れ" : `あと${c.days}日`}）`),
      mode: s ? s.mode : "",
      pending: s ? s.pending : null,
    };
  }).sort((a, b) => (a.daysCovered ?? 99) - (b.daysCovered ?? 99));
}

export interface HeatCell {
  site: SiteId;
  item: string;
  /** 画面に出す文字。本部備蓄は「有」か「切れ」、救護所は日数か「切れ」 */
  label: string;
  level: Level | "hq" | "none";
  onHand: number;
  unit: string;
  dailyUse: number;
}

export function heatCell(stock: readonly StockRow[], site: SiteId, item: string): HeatCell | null {
  const r = stock.find((x) => x.site === site && x.item === item);
  if (!r) return null;
  const days = daysLeft(r);
  if (r.onHand === 0) {
    return { site, item, label: "切れ", level: "bad", onHand: 0, unit: r.unit, dailyUse: r.dailyUse };
  }
  if (days === null) {
    return { site, item, label: "有", level: "hq", onHand: r.onHand, unit: r.unit, dailyUse: 0 };
  }
  return { site, item, label: String(days), level: levelOf(days), onHand: r.onHand, unit: r.unit, dailyUse: r.dailyUse };
}

export interface TrendSeries {
  site: SiteId;
  points: readonly { date: string; patients: number }[];
}

export function trendSeries(patients: readonly PatientRow[]): TrendSeries[] {
  return SHELTERS.map((site) => ({
    site,
    points: patients
      .filter((r) => r.site === site)
      .map((r) => ({ date: r.date, patients: r.patients }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
  }));
}
