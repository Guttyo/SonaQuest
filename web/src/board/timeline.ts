// 「発注・搬送」の時間軸（Issue #118、ADR-0043 の追記 13）。画面から切り離した純粋な関数。
// 新しいデータは作らず、今の架空データとデモの状態の算数だけで、救護所×品目の行ごとに
// 在庫が持つ見込みの区間・到着の見込み・発注の段階・必要な時刻を並べる。
// 「遅れ」「間に合わない」などの判定・閾値・解釈はしない（追記 10）。到着未定に日付を作らない。

import { HQ, INBOUND, SITES, type SiteId } from "./data";
import {
  ARRIVAL_MINUTE_OF_DAY,
  DEPART_MINUTE_OF_DAY,
  minutesAt,
  proposalStage,
  stampMinutes,
  type DemoInbound,
  type DemoState,
  type ProposalStage,
} from "./demo";
import { caseRows, type StockStatus } from "./summary";

/** 横軸の長さ（日）。Issue #118 のコメントに記録したオーナーの決定（2026-11-06、チャット）の「3日」（選択肢の説明は「いまから3日先まで」） */
export const TIMELINE_DAYS = 3;

const DAY = 1440;

/** 横軸の範囲。左端はデモの時計の日の 0:00 にし、「いま」の線が時計とともに右へ動くようにする。右端は「いま」から3日先が必ず入る位置 */
export function timelineWindow(now: number): { start: number; end: number } {
  // 経過の分は BOARD_AS_OF（09:30）からなので、日の 0:00 は minutesAt で日付から求める
  const start = dayStart(now);
  return { start, end: start + (TIMELINE_DAYS + 1) * DAY };
}

/** その時刻を含む日の 0:00（BOARD_AS_OF からの分） */
export function dayStart(minutes: number): number {
  const base = minutesAt("2026-11-05", 0);
  return base + Math.floor((minutes - base) / DAY) * DAY;
}

/** この救護所×品目に向かっている搬送・融通・卸の分の1件 */
export interface TimelineArrival {
  id: string;
  kind: "本部から搬送" | "救護所どうしの融通" | "卸への照会分";
  qty: number;
  status: string;
  /** 出発の時刻（分かるときだけ） */
  departAt: number | null;
  /** 到着の見込みの時刻。到着未定は null（推測の日付を作らない） */
  arriveAt: number | null;
}

export interface TimelineRow {
  site: SiteId;
  item: string;
  unit: string;
  status: StockStatus;
  /** 在庫が持つ見込みの終わり（在庫切れ見込みの時刻）。在庫切れはいま。未確認・算出不可は null（区間を作らない） */
  stockUntil: number | null;
  arrivals: TimelineArrival[];
  /** 発注の提案の段階。提案が無ければ null */
  stage: ProposalStage | null;
  proposalId: string | null;
  /** 救護所から届いた「いつまでに」 */
  needBy: number | null;
  /** 在庫が切れる時刻と、いちばん早い到着の見込みの間が空くときの区間（算数の比較だけ。判定の文は付けない） */
  gap: { from: number; to: number } | null;
}

/** 出発の時刻。地図の便（live.ts の shipmentMarkers）と同じ決まり：承認で足したものは departAt、
 * 最初から搬送中のもの（data.ts の INBOUND）はデモの始まり（0 分）、それ以外の引当済み・搬送中は到着見込みの日の 07:00 */
function departOf(r: DemoInbound): number | null {
  if (r.departAt !== undefined) return r.departAt;
  if (r.status !== "引当済み" && r.status !== "搬送中") return null;
  const seedInTransit = !r.proposalId && INBOUND.some((x) => x.id === r.id && x.status === "搬送中");
  return seedInTransit ? 0 : minutesAt(r.eta, DEPART_MINUTE_OF_DAY);
}

function arrivalOf(r: DemoInbound, kind: TimelineArrival["kind"]): TimelineArrival {
  // 到着未定：日付が無いもの、卸に照会中、融通の調整中（どちらも人の手配が要り、デモの時計では動かない。demo.ts の tick と同じ決まり）
  const undecided = r.eta === "未定" || r.status === "融通の調整中" || r.status.startsWith("卸に照会中");
  return {
    id: r.id,
    kind,
    qty: r.qty,
    status: r.status,
    departAt: undecided ? null : departOf(r),
    arriveAt: undecided ? null : (r.arriveAt ?? minutesAt(r.eta, ARRIVAL_MINUTE_OF_DAY)),
  };
}

/**
 * 時間軸の行。行は「確認・手配が必要な事項」の表と同じ行・同じ並び（caseRows。固定のルールで、緊急度を表さない）。
 * 時刻はデモの時計と同じ決まり（arriveAt、無ければ到着見込みの日の 10:00）で出し、時計を進めた動きと食い違わないようにする
 */
export function timelineRows(state: DemoState, site?: SiteId): TimelineRow[] {
  const now = state.minutes;
  const cases = caseRows(state.stock, state.inbound, state.needs, SITES, state.sync).filter((c) => site === undefined || c.site === site);
  return cases.map((c): TimelineRow => {
    const stockUntil = c.status === "在庫切れ" ? now : c.status === "在庫切れ見込み" && c.days !== null ? now + Math.round(c.days * DAY) : null;
    const arrivals: TimelineArrival[] = [
      ...state.inbound
        .filter((r) => r.item === c.item && r.to === c.site && r.status !== "受領")
        .map((r) => arrivalOf(r, r.from === HQ ? "本部から搬送" : "救護所どうしの融通")),
      // 卸への照会分は本部向けの入荷として載る（forSite がこの救護所のもの）
      ...state.inbound
        .filter((r) => r.item === c.item && r.forSite === c.site && r.status !== "受領")
        .map((r) => arrivalOf(r, "卸への照会分")),
    ];
    const p = state.proposals.find((x) => x.site === c.site && x.item === c.item) ?? null;
    const known = arrivals.map((a) => a.arriveAt).filter((x): x is number => x !== null);
    const first = known.length > 0 ? Math.min(...known) : null;
    return {
      site: c.site,
      item: c.item,
      unit: c.unit,
      status: c.status,
      stockUntil,
      arrivals,
      stage: p ? proposalStage(p, state.inbound) : null,
      proposalId: p ? p.id : null,
      needBy: c.need ? stampMinutes(c.need.by) : null,
      gap: stockUntil !== null && first !== null && first > stockUntil ? { from: stockUntil, to: first } : null,
    };
  });
}
