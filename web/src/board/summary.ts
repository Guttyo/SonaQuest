// ボードの集計（Issue #97、#101）。画面から切り離した純粋な関数。入力は data.ts の架空データ。
// ここで出すのは在庫と人数の算数だけで、薬の正誤や処方の判断はしない。分類（category）は判定や並び順に使わない。

import {
  COVER_GUIDE_DAYS,
  HQ,
  SHELTERS,
  inboundKind,
  type DemandRow,
  type InboundRow,
  type NeedRow,
  type PatientRow,
  type SiteId,
  type SiteInfo,
  type StockRow,
  type SyncRow,
} from "./data";

/**
 * 画面に出す在庫の数（切り捨て）。デモの時計では在庫が小数のまま減るが、画面は1単位未満を出さない。
 * 残り日数・状態・色分けはこの数で計算し、表示の数と食い違わないようにする（Issue #252）。
 * 1単位未満（0.9錠など）は 0、つまり在庫切れとして扱う。在庫の減り方と発注の提案の計算は小数のまま（demo.ts）
 */
export function shownOnHand(onHand: number): number {
  return Math.max(0, Math.floor(onHand));
}

/**
 * 残り日数（丸めない）。在庫が未確認、出庫のペースが不明、本部備蓄（ペース 0）は null。
 * 0 と null を混ぜない：在庫 0 は 0、分からないものは null。在庫は画面に出す数（shownOnHand）で割る
 */
export function daysLeft(row: StockRow): number | null {
  if (row.onHand === null) return null;
  if (row.dailyUse === null || row.dailyUse <= 0) return null;
  return shownOnHand(row.onHand) / row.dailyUse;
}

/** 画面に出すときの丸め（小数1桁）。判定には使わない */
export function roundDays(days: number): number {
  return Math.round(days * 10) / 10;
}

export type Level = "bad" | "warn" | "ok";

/** 色分けの段階。0 日（切れ）は bad、目安（COVER_GUIDE_DAYS）の2日先までが warn。丸める前の値で判定する */
export function levelOf(days: number): Level {
  if (days <= 0) return "bad";
  // 目安の日数より少なくても、在庫が残っていれば黄（赤は在庫切れなど止まっているものだけ。2026-11-06 オーナー決定、計画書 9章）
  if (days < COVER_GUIDE_DAYS + 2) return "warn";
  return "ok";
}

/**
 * 在庫の状態（文字で示す。色は補助）。
 * 在庫切れ：画面に出す在庫が 0（1単位未満を含む）。未確認：在庫のデータが届いていない。見込み算出不可：在庫はあるが出庫のペースが分からない。
 * 在庫切れ見込み：今のペースで目安より早く切れる。余裕あり：それ以外
 */
export type StockStatus = "在庫切れ" | "未確認" | "在庫切れ見込み" | "見込み算出不可" | "余裕あり";

export function stockStatus(row: StockRow): StockStatus {
  if (row.onHand === null) return "未確認";
  if (shownOnHand(row.onHand) === 0) return "在庫切れ";
  if (row.site === HQ) return "余裕あり";
  const days = daysLeft(row);
  if (days === null) return "見込み算出不可";
  return days < COVER_GUIDE_DAYS ? "在庫切れ見込み" : "余裕あり";
}

/** 並び順：在庫切れ → 未確認 → 在庫切れ見込み（近い順）→ 見込み算出不可 */
const STATUS_ORDER: Readonly<Record<StockStatus, number>> = {
  在庫切れ: 0,
  未確認: 1,
  在庫切れ見込み: 2,
  見込み算出不可: 3,
  余裕あり: 4,
};

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

/** 確認・手配が必要な救護所×品目の1行（Issue #101）。本部備蓄は行にしない */
export interface CaseRow {
  site: SiteId;
  item: string;
  unit: string;
  status: StockStatus;
  /** 現地の在庫。未確認は null */
  onHand: number | null;
  /** 残り日数（丸めない）。出せないときは null */
  days: number | null;
  /** 本部備蓄の在庫（その品目のデータが無ければ null） */
  hqOnHand: number | null;
  /** 本部向けの入荷（その品目） */
  hqInbound: InboundRow[];
  /** この救護所向けの搬送・融通（その品目）。受領済みは含めない */
  siteInbound: InboundRow[];
  /** 救護所から届いた、必要な数と時刻 */
  need: NeedRow | null;
  /** 入荷・融通の状態の短い文（一覧に出す） */
  supply: string;
  /** 次の確認先（在庫・入荷・通信のデータから決める固定文。薬の中身では決めない） */
  next: string;
}

const fmtEta = (eta: string) => (eta === "未定" ? "到着未定" : `${eta.slice(5).replace("-", "/")} 到着見込み`);

/** 入荷・融通の状態を一覧向けの短い文にする */
export function supplyText(hqInbound: readonly InboundRow[], siteInbound: readonly InboundRow[], unit: string): string {
  const parts: string[] = [];
  for (const r of siteInbound) {
    parts.push(
      `${inboundKind(r) === "救護所どうしの融通" ? `${r.from}から融通` : "本部から搬送"} ${r.qty}${unit}（${r.status}・${fmtEta(r.eta)}）`,
    );
  }
  for (const r of hqInbound) {
    parts.push(`本部向け入荷 ${r.qty}${unit}（${r.status}）`);
  }
  return parts.length === 0 ? "入荷・融通の予定なし" : parts.join("、");
}

/**
 * 次の確認先。データ（在庫・入荷・通信）だけから固定文を選ぶ。
 * 未確認 → 在庫の確認。現地向けの搬送があれば到着の確認。本部に在庫があれば搬送の確認。
 * 本部も無く照会中なら卸の回答の確認。どれも無ければ融通できる救護所の確認
 */
export function nextAction(
  status: StockStatus,
  hqOnHand: number | null,
  hqInbound: readonly InboundRow[],
  siteInbound: readonly InboundRow[],
  info: SiteInfo | undefined,
  offline: boolean,
): string {
  const via = offline && info ? `（通信なし。${info.altMeans}）` : "";
  if (status === "未確認") return `現地の在庫を確認する${via}`;
  if (status === "見込み算出不可") return `現地の1日あたりの出庫量を確認${via}`;
  if (siteInbound.length > 0) {
    // 到着の見込みは「入荷・融通」の文に出ているので、ここでは繰り返さない（Issue #159）
    const r = siteInbound[0];
    return r.status === "融通の調整中" ? `${r.from}との融通の調整を確認する` : "搬送の到着を確認する";
  }
  if (hqOnHand !== null && hqOnHand > 0) return "本部備蓄からの搬送を確認する";
  if (hqInbound.some((r) => r.status === "卸に照会中・到着未定")) return "卸の回答を確認する";
  if (hqInbound.length > 0) return `本部への入荷を確認（${fmtEta(hqInbound[0].eta)}）`;
  return "融通できる救護所を確認する";
}

/**
 * 確認・手配が必要な品目の一覧。余裕ありを除き、在庫切れ → 未確認 → 見込みが近い順 → 見込み算出不可。
 * 判定は丸める前の値で行う。照会中・到着未定の数量は現地の在庫に足さない（表示するだけ）
 */
export function caseRows(
  stock: readonly StockRow[],
  inbound: readonly InboundRow[],
  needs: readonly NeedRow[],
  sites: readonly SiteInfo[],
  sync: readonly SyncRow[],
): CaseRow[] {
  return stock
    .filter((r) => r.site !== HQ)
    .map((r): CaseRow => {
      const status = stockStatus(r);
      const hq = stock.find((x) => x.site === HQ && x.item === r.item);
      const hqInbound = inbound.filter((x) => x.item === r.item && x.to === HQ);
      const siteInbound = inbound.filter((x) => x.item === r.item && x.to === r.site && x.status !== "受領");
      const info = sites.find((s) => s.site === r.site);
      const offline = sync.find((s) => s.site === r.site)?.mode === "紙で記録・通信なし";
      const hqOnHand = hq ? hq.onHand : null;
      return {
        site: r.site,
        item: r.item,
        unit: r.unit,
        status,
        onHand: r.onHand,
        days: daysLeft(r),
        hqOnHand,
        hqInbound,
        siteInbound,
        need: needs.find((n) => n.site === r.site && n.item === r.item) ?? null,
        supply: supplyText(hqInbound, siteInbound, r.unit),
        next: nextAction(status, hqOnHand, hqInbound, siteInbound, info, offline),
      };
    })
    .filter((c) => c.status !== "余裕あり")
    .sort((a, b) => {
      const o = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (o !== 0) return o;
      return (a.days ?? 0) - (b.days ?? 0);
    });
}

/** 救護所ごとの一枚（ホワイトボード風の一覧。Issue #101）。人員と薬の不足がひと目で分かるようにする */
export interface SiteOverview {
  site: SiteId;
  patients: number | null;
  pharmacists: number | null;
  /** 足りない薬剤師の人数（求めている数 − 今いる数。0 以上） */
  pharmacistsShort: number;
  outOfStock: number;
  forecast: number;
  unconfirmed: number;
  noPace: number;
  routeStatus: string;
  mode: string;
  pending: number | null;
}

export function siteOverview(
  stock: readonly StockRow[],
  patients: readonly PatientRow[],
  sites: readonly SiteInfo[],
  sync: readonly SyncRow[],
  routes: readonly { to: SiteId; status: string }[],
): SiteOverview[] {
  const date = latestDate(patients);
  return SHELTERS.map((site) => {
    const rows = stock.filter((r) => r.site === site);
    const count = (status: StockStatus) => rows.filter((r) => stockStatus(r) === status).length;
    const info = sites.find((s) => s.site === site);
    const s = sync.find((r) => r.site === site);
    return {
      site,
      patients: patients.find((r) => r.date === date && r.site === site)?.patients ?? null,
      pharmacists: info ? info.pharmacists : null,
      pharmacistsShort: info ? Math.max(0, info.pharmacistsNeeded - info.pharmacists) : 0,
      outOfStock: count("在庫切れ"),
      forecast: count("在庫切れ見込み"),
      unconfirmed: count("未確認"),
      noPace: count("見込み算出不可"),
      routeStatus: routes.find((r) => r.to === site)?.status ?? "—",
      mode: s ? s.mode : "",
      pending: s ? s.pending : null,
    };
  });
}

export interface CriticalItem {
  site: SiteId;
  item: string;
  /** 残り日数（丸めない）。在庫 0 は 0 */
  days: number;
}

/**
 * 本部備蓄を除き、在庫 0 か、目安の日数より短い救護所×品目。短い順。
 * 未確認（在庫 null）と見込み算出不可（ペース null）は含めない。0 と不明を混ぜない
 */
export function criticalItems(stock: readonly StockRow[]): CriticalItem[] {
  return stock
    .filter((r) => r.site !== HQ)
    .flatMap((r) => {
      const status = stockStatus(r);
      if (status === "在庫切れ") return [{ site: r.site, item: r.item, days: 0 }];
      if (status === "在庫切れ見込み") return [{ site: r.site, item: r.item, days: daysLeft(r) ?? 0 }];
      return [];
    })
    .sort((a, b) => a.days - b.days);
}

/** 未確認・見込み算出不可の数（在庫切れとは別に数える） */
export function unknownCounts(stock: readonly StockRow[]): { unconfirmed: number; noPace: number } {
  const rows = stock.filter((r) => r.site !== HQ);
  return {
    unconfirmed: rows.filter((r) => stockStatus(r) === "未確認").length,
    noPace: rows.filter((r) => stockStatus(r) === "見込み算出不可").length,
  };
}

export interface PendingSummary {
  pending: number;
  /** 紙が届いていない数 */
  undelivered: number;
  /** 届いたが記録の形になっていない数 */
  awaiting: number;
  offlineSites: number;
  /** 件数の報告が無い（未確認の）救護所の数。上の数には入れない（Issue #217） */
  unknownSites: number;
}

export function pendingSummary(sync: readonly SyncRow[]): PendingSummary {
  const sum = (rows: readonly SyncRow[]) => rows.reduce((a, r) => a + (r.pending ?? 0), 0);
  return {
    pending: sum(sync),
    undelivered: sum(sync.filter((r) => r.pendingKind === "未着")),
    awaiting: sum(sync.filter((r) => r.pendingKind === "転記待ち")),
    offlineSites: sync.filter((r) => r.mode === "紙で記録・通信なし").length,
    unknownSites: sync.filter((r) => r.pending === null).length,
  };
}

export interface InboundSummary {
  count: number;
  undated: number;
}

/** 受領済みを除いた入荷・融通の件数と、日付が未定のもの */
export function inboundSummary(inbound: readonly InboundRow[]): InboundSummary {
  const open = inbound.filter((r) => r.status !== "受領");
  return { count: open.length, undated: open.filter((r) => r.eta === "未定").length };
}

export interface ShelterRow {
  site: SiteId;
  patients: number | null;
  evacuees: number | null;
  daysCovered: number | null;
  /** 在庫切れ・切れる見込みの品目の文（「抗てんかん薬C（あと1日）」） */
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
        .map((c) => `${c.item}（${c.days === 0 ? "在庫なし" : `あと${roundDays(c.days)}日`}）`),
      mode: s ? s.mode : "",
      pending: s ? s.pending : null,
    };
  }).sort((a, b) => (a.daysCovered ?? 99) - (b.daysCovered ?? 99));
}

export interface HeatCell {
  site: SiteId;
  item: string;
  /** 画面に出す文字。本部備蓄は「有」か「切れ」、救護所は日数か「切れ」「未確認」「？」（ペース不明） */
  label: string;
  level: Level | "hq" | "none";
  onHand: number | null;
  unit: string;
  dailyUse: number | null;
}

export function heatCell(stock: readonly StockRow[], site: SiteId, item: string): HeatCell | null {
  const r = stock.find((x) => x.site === site && x.item === item);
  if (!r) return null;
  const base = { site, item, onHand: r.onHand, unit: r.unit, dailyUse: r.dailyUse };
  if (r.onHand === null) return { ...base, label: "未確認", level: "none" };
  if (shownOnHand(r.onHand) === 0) return { ...base, label: "在庫なし", level: "bad" };
  if (site === HQ) return { ...base, label: "有", level: "hq" };
  const days = daysLeft(r);
  if (days === null) return { ...base, label: "算出不可", level: "none" };
  return { ...base, label: String(roundDays(days)), level: levelOf(days) };
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
