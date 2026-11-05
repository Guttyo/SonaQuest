// ボードのデモの状態（Issue #102）。架空の時計を進めると在庫・入荷・記録の届き方が動き、架空の問診を入力すると
// 救護所の記録に加わって在庫と需要が変わる。状態はブラウザのメモリにだけあり、保存・送信・ログ出力をしない（ADR-0007）。
// ここで行うのは在庫の足し引きと時刻の比較だけで、薬の正誤・処方・服薬の判断はしない。

import {
  BOARD_AS_OF,
  COVER_GUIDE_DAYS,
  HQ,
  INBOUND,
  NEEDS,
  PATIENTS,
  SHELTERS,
  STOCK,
  SYNC,
  routeTo,
  type InboundRow,
  type NeedRow,
  type PatientRow,
  type SiteId,
  type StockRow,
  type SyncRow,
} from "./data";

/** 入力された架空の問診（救護所の記録＝カルテの1件）。名前は架空で、画面に「架空」と出す */
export interface DemoRecord {
  id: string;
  site: SiteId;
  /** 架空の氏名（オーナー決定 2026-11-05。訓練のモードでは使わない） */
  name: string;
  /** 記録した架空の時刻（分。BOARD_AS_OF からの経過） */
  at: number;
  items: readonly { label: string; value: string }[];
  /** 医師が入力した処方（薬の仮名・数量・日数）。無ければ null。アプリは候補を出さない */
  prescription: { item: string; qty: number; days: number; unit: string } | null;
  /** 在庫が足りず渡せなかった数 */
  undelivered: number;
}

/** 「前回から変わったこと」の1行で数える出来事の種類（Issue #107）。件数を足すだけで、文は作らない */
export type DemoEventKind = "登録" | "未交付" | "提案" | "承認" | "受領" | "在庫切れ";

export interface DemoLog {
  at: number;
  text: string;
  /** 数える出来事の種類（数えないものは無し） */
  kind?: DemoEventKind;
  /** どの救護所の出来事か（本部の画面では全部、救護所の画面ではその救護所の分を数える） */
  site?: SiteId;
}

/**
 * デモの中の入荷・搬送。承認で足した搬送は、出発と到着の架空の時刻（分）を持つ（Issue #107）。
 * 卸へ頼む分は本部向けの入荷として載せ、どの救護所のためかを forSite に持つ
 */
export interface DemoInbound extends InboundRow {
  departAt?: number;
  arriveAt?: number;
  forSite?: SiteId;
  proposalId?: string;
}

/**
 * 発注の提案（Issue #107）。在庫と未交付の算数だけで出す。薬の中身・代わりの薬・量の妥当性は判断しない。
 * 承認・却下は人（本部の担当者）が画面で押す
 */
export interface OrderProposal {
  id: string;
  /** 救護所＋品目 */
  key: string;
  site: SiteId;
  item: string;
  unit: string;
  /** 必要な数量（下の内訳の算数の結果。切り上げ） */
  qty: number;
  /** 本部備蓄から出せる分 */
  fromHq: number;
  /** 卸へ頼む分 */
  fromVendor: number;
  /** 算数の内訳 */
  basis: {
    /** 未交付・救護所から届いた必要な数の合計 */
    need: number;
    /** 目安の日数分の出庫（出庫のペースが分からなければ null） */
    cover: number | null;
    /** 現地の在庫 */
    onHand: number;
    /** この救護所に向かっている搬送・入荷（確定・引当済み・搬送中・卸に照会中） */
    incoming: number;
  };
  status: "提案" | "承認済み";
  /** 作られた操作の番号（画面で「新」の印に使う） */
  createdRev: number;
  /** 作られた・未交付・必要な数が変わった操作の番号（画面で「更新」の印に使う） */
  rev: number;
  approvedAt: number | null;
  /** 承認で足した搬送（本部 → 救護所）と卸への照会の id */
  shipmentId: string | null;
  vendorId: string | null;
}

export interface DemoState {
  /** BOARD_AS_OF からの経過（分） */
  minutes: number;
  running: boolean;
  stock: StockRow[];
  inbound: DemoInbound[];
  sync: SyncRow[];
  needs: NeedRow[];
  /** 今日の患者に足した数（救護所ごと） */
  extraPatients: Record<string, { patients: number; chronic: number }>;
  records: DemoRecord[];
  /** 起きたことの記録（新しいものが先。画面に出すだけ） */
  log: DemoLog[];
  /** 発注の提案（提案中と承認済み） */
  proposals: OrderProposal[];
  /** 却下した提案（救護所＋品目 → 却下したときの未交付・必要な数）。これより増えるまで出し直さない */
  dismissed: Record<string, number>;
  /** 提案・搬送の番号の連番 */
  seq: number;
  /** 操作の番号（操作のたびに 1 増える） */
  rev: number;
}

export type DemoAction =
  | { type: "tick"; hours: number }
  | { type: "run"; running: boolean }
  | { type: "reset" }
  | { type: "approve_proposal"; id: string }
  | { type: "reject_proposal"; id: string }
  | {
      type: "add_record";
      site: SiteId;
      name: string;
      items: readonly { label: string; value: string }[];
      prescription: { item: string; qty: number; days: number } | null;
    };

/** 記録が本部に届く架空の時刻（1日の中の分）。搬送便・連絡員・定時報告の時刻 */
const SYNC_TIMES: Readonly<Record<string, readonly number[]>> = {
  救護所A: [6 * 60],
  救護所B: [16 * 60],
  救護所C: [10 * 60, 14 * 60, 18 * 60],
  救護所D: [15 * 60],
  本部備蓄: [],
};

/** 入荷・搬送が届く時刻（到着見込みの日の 10:00） */
const ARRIVAL_MINUTE_OF_DAY = 10 * 60;

const AS_OF_DATE = BOARD_AS_OF.slice(0, 10);
const AS_OF_MINUTE = Number(BOARD_AS_OF.slice(11, 13)) * 60 + Number(BOARD_AS_OF.slice(14, 16));

function dayIndex(date: string): number {
  return Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(2026, 0, 1)) / 86400000);
}
const AS_OF_DAY = dayIndex(AS_OF_DATE);

/** 架空の日付と1日の中の分 → BOARD_AS_OF からの経過（分） */
export function minutesAt(date: string, minuteOfDay: number): number {
  return (dayIndex(date) - AS_OF_DAY) * 1440 + minuteOfDay - AS_OF_MINUTE;
}

/** 経過（分）→ 画面の文字「11/05 12:30」 */
export function clockText(minutes: number): string {
  const total = AS_OF_MINUTE + minutes;
  const days = Math.floor(total / 1440);
  const mod = ((total % 1440) + 1440) % 1440;
  const d = new Date(Date.UTC(2026, 0, 1 + AS_OF_DAY + days));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd} ${String(Math.floor(mod / 60)).padStart(2, "0")}:${String(mod % 60).padStart(2, "0")}`;
}

/** 経過（分）→ 「2026-11-05 12:30」（SYNC の lastSync と同じ形） */
function stampText(minutes: number): string {
  const total = AS_OF_MINUTE + minutes;
  const days = Math.floor(total / 1440);
  const mod = ((total % 1440) + 1440) % 1440;
  const d = new Date(Date.UTC(2026, 0, 1 + AS_OF_DAY + days));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(Math.floor(mod / 60)).padStart(2, "0")}:${String(mod % 60).padStart(2, "0")}`;
}

export function initialDemo(): DemoState {
  // 最初の提案は始まりの状態で、「変わったこと」ではないので記録に残さない
  const start = refreshProposals({
    minutes: 0,
    running: false,
    stock: STOCK.map((r) => ({ ...r })),
    inbound: INBOUND.map((r) => ({ ...r })),
    sync: SYNC.map((r) => ({ ...r })),
    needs: NEEDS.map((r) => ({ ...r })),
    extraPatients: {},
    records: [],
    log: [],
    proposals: [],
    dismissed: {},
    seq: 0,
    rev: 0,
  });
  return { ...start, log: [] };
}

/** 承認した搬送が本部を出るまでの時間（分。デモの仮の値） */
export const DISPATCH_DELAY_MINUTES = 60;
/** 通行止めで所要時間の目安が無い拠点へ、連絡員が運ぶときの時間（分。デモの仮の値） */
export const FALLBACK_TRANSIT_MINUTES = 120;
/** 日付だけの搬送（最初からある引当済みの行）が本部を出る時刻（到着見込みの日の 07:00） */
const DEPART_MINUTE_OF_DAY = 7 * 60;

/** 救護所に向かっているものとして数える状態（受領・融通の調整中は数えない） */
const INCOMING: ReadonlySet<InboundRow["status"]> = new Set(["確定", "引当済み", "搬送中", "卸に照会中・到着未定"]);

/** 提案の行（状態を持つ前の、算数の結果） */
export interface OrderSuggestion {
  key: string;
  site: SiteId;
  item: string;
  unit: string;
  qty: number;
  fromHq: number;
  fromVendor: number;
  basis: OrderProposal["basis"];
}

/**
 * 発注の提案の算数（Issue #107）。救護所×品目ごとに
 * 必要な数量 ＝ 未交付・必要な数 ＋ 目安の日数分の出庫 − 現地の在庫 − 向かっている搬送・入荷（切り上げ）。
 * 0 以下なら出さない。未交付・必要な数が無いときは、1日の出庫分以上足りないときだけ出す。
 * 現地の在庫が未確認（null）のものは出さない（算数ができない）。出庫のペースが分からないものは、目安の日数分を 0 とする。
 * 本部備蓄から出せる分は、並びの順に本部の在庫を割り当てる。残りは卸へ頼む分。
 * 並びは、残り日数が短い順（在庫 0 が先）。薬の中身・代わりの薬・量の妥当性は判断しない
 */
export function suggestOrders(
  stock: readonly StockRow[],
  needs: readonly NeedRow[],
  inbound: readonly DemoInbound[],
  /** 出さない行（却下したもの）。本部の在庫を割り当てる前に外す（PR #108 のレビュー） */
  skip: (key: string, need: number) => boolean = () => false,
): OrderSuggestion[] {
  const rows = stock
    .filter((r) => r.site !== HQ && r.onHand !== null)
    .map((r) => {
      const onHand = r.onHand ?? 0;
      const need = needs.filter((n) => n.site === r.site && n.item === r.item).reduce((a, n) => a + n.qty, 0);
      const cover = r.dailyUse === null ? null : r.dailyUse * COVER_GUIDE_DAYS;
      const incoming = inbound
        .filter((x) => x.item === r.item && (x.to === r.site || x.forSite === r.site) && INCOMING.has(x.status))
        .reduce((a, x) => a + x.qty, 0);
      const qty = Math.ceil(need + (cover ?? 0) - onHand - incoming);
      const days = r.dailyUse && r.dailyUse > 0 ? onHand / r.dailyUse : Number.POSITIVE_INFINITY;
      return { r, onHand, need, cover, incoming, qty, days };
    })
    // 未交付・必要な数があるか、目安の日数分より1日分以上足りないときだけ出す（時計で少し減るたびに小さな提案が並ばないように）
    .filter((x) => x.qty > 0 && (x.need > 0 || (x.r.dailyUse !== null && x.qty >= x.r.dailyUse)))
    .filter((x) => !skip(`${x.r.site}|${x.r.item}`, x.need))
    .sort((a, b) => a.days - b.days || SHELTERS.indexOf(a.r.site) - SHELTERS.indexOf(b.r.site));
  const hqLeft = new Map<string, number>();
  for (const r of stock) if (r.site === HQ) hqLeft.set(r.item, Math.max(0, Math.floor(r.onHand ?? 0)));
  // 最初からある本部 → 救護所の搬送（確定・引当済み・搬送中）は、本部の在庫からまだ引いていないので、割り当てられる数から除く。
  // 承認で足した搬送は、承認のときに本部の在庫を減らしているので除かない（二重に引かない。PR #108 のレビュー）
  for (const x of inbound) {
    if (x.from !== HQ || x.proposalId || !(x.status === "確定" || x.status === "引当済み" || x.status === "搬送中")) continue;
    hqLeft.set(x.item, Math.max(0, (hqLeft.get(x.item) ?? 0) - x.qty));
  }
  return rows.map((x) => {
    const left = hqLeft.get(x.r.item) ?? 0;
    const fromHq = Math.min(x.qty, left);
    hqLeft.set(x.r.item, left - fromHq);
    return {
      key: `${x.r.site}|${x.r.item}`,
      site: x.r.site,
      item: x.r.item,
      unit: x.r.unit,
      qty: x.qty,
      fromHq,
      fromVendor: x.qty - fromHq,
      basis: { need: x.need, cover: x.cover, onHand: x.onHand, incoming: x.incoming },
    };
  });
}

/**
 * 提案中の行を、今の在庫・未交付・搬送で出し直す。承認済みはそのまま残す。
 * 却下したものは、未交付・必要な数が却下したときより増えるまで出さない（時計で在庫が減るだけでは出し直さない）。
 * 同じ救護所×品目の提案は番号を引き継ぐ
 */
export function refreshProposals(state: DemoState): DemoState {
  const approved = state.proposals.filter((p) => p.status === "承認済み");
  const pending = state.proposals.filter((p) => p.status === "提案");
  let seq = state.seq;
  const next: OrderProposal[] = [];
  const log: DemoLog[] = [];
  const isDismissed = (key: string, need: number) => state.dismissed[key] !== undefined && need <= state.dismissed[key];
  for (const s of suggestOrders(state.stock, state.needs, state.inbound, isDismissed)) {
    const before = pending.find((p) => p.key === s.key);
    if (!before) {
      seq += 1;
      log.push({ at: state.minutes, text: `本部：発注の提案 P-${String(seq).padStart(2, "0")}（${s.site}・${s.item}）が出た`, kind: "提案", site: s.site });
    }
    next.push({
      ...s,
      id: before ? before.id : `P-${String(seq).padStart(2, "0")}`,
      status: "提案",
      createdRev: before ? before.createdRev : state.rev,
      // 未交付・必要な数が変わったとき（登録で未交付が出たとき）だけ更新の印にする。時計で在庫が減るだけでは付けない
      rev: before && before.basis.need === s.basis.need ? before.rev : state.rev,
      approvedAt: null,
      shipmentId: null,
      vendorId: null,
    });
  }
  return { ...state, proposals: [...next, ...approved], seq, log: log.length > 0 ? [...log.reverse(), ...state.log] : state.log };
}

/** 提案の画面の状態。承認済みは、搬送の行の状態（引当済み → 搬送中 → 受領）から決める */
export type ProposalStage = "提案" | "承認済み（引当済み）" | "搬送中" | "受領" | "卸に照会中" | "一部受領・卸に照会中";

/** 本部の分と卸の分の両方を見て決める。卸の分が残っているあいだは「受領」にしない（PR #108 のレビュー） */
export function proposalStage(p: OrderProposal, inbound: readonly DemoInbound[]): ProposalStage {
  if (p.status === "提案") return "提案";
  const ship = p.shipmentId ? inbound.find((r) => r.id === p.shipmentId) : undefined;
  const vendor = p.vendorId ? inbound.find((r) => r.id === p.vendorId) : undefined;
  const vendorOpen = vendor !== undefined && vendor.status !== "受領";
  if (!ship) return vendorOpen || !vendor ? "卸に照会中" : "受領";
  if (ship.status === "受領") return vendorOpen ? "一部受領・卸に照会中" : "受領";
  if (ship.status === "搬送中") return "搬送中";
  return "承認済み（引当済み）";
}

/** 承認：本部の在庫を引き当て（減らし）、本部 → 救護所の搬送（引当済み）と、足りない分の卸への照会を載せる */
function approve(state: DemoState, id: string): DemoState {
  const p = state.proposals.find((x) => x.id === id && x.status === "提案");
  if (!p) return state;
  const stock = state.stock.map((r) => ({ ...r }));
  const hq = stock.find((r) => r.site === HQ && r.item === p.item);
  // 画面に出した内訳（本部備蓄から・卸へ）のとおりに承認する。ほかの提案に割り当てた本部の在庫は使わない（PR #108 のレビュー）
  const fromHq = Math.min(p.fromHq, Math.max(0, Math.floor(hq?.onHand ?? 0)));
  const fromVendor = p.qty - fromHq;
  if (hq && fromHq > 0) hq.onHand = (hq.onHand ?? 0) - fromHq;
  let seq = state.seq;
  const added: DemoInbound[] = [];
  const log: DemoLog[] = [];
  let shipmentId: string | null = null;
  let vendorId: string | null = null;
  if (fromHq > 0) {
    seq += 1;
    shipmentId = `S-${String(seq).padStart(2, "0")}`;
    const departAt = state.minutes + DISPATCH_DELAY_MINUTES;
    const arriveAt = departAt + (routeTo(p.site)?.minutes ?? FALLBACK_TRANSIT_MINUTES);
    added.push({
      id: shipmentId,
      item: p.item,
      from: HQ,
      to: p.site,
      qty: fromHq,
      eta: stampText(arriveAt).slice(0, 10),
      status: "引当済み",
      departAt,
      arriveAt,
      proposalId: p.id,
    });
    log.push({ at: state.minutes, text: `本部：${p.id} を承認。本部備蓄の ${p.item} ${fromHq}${p.unit} を ${p.site} 向けに引当（${clockText(departAt)} 出発予定）`, kind: "承認", site: p.site });
  }
  if (fromVendor > 0) {
    seq += 1;
    vendorId = `V-${String(seq).padStart(2, "0")}`;
    added.push({
      id: vendorId,
      item: p.item,
      from: "供給元（卸）",
      to: HQ,
      qty: fromVendor,
      eta: "未定",
      status: "卸に照会中・到着未定",
      forSite: p.site,
      proposalId: p.id,
    });
    log.push({
      at: state.minutes,
      text: `本部：${p.id} を承認。${p.item} ${fromVendor}${p.unit} を卸に照会（${p.site} 向け）`,
      // 1件の提案の承認は1回と数える（本部備蓄の分を先に記録したときは、こちらは数えない）
      ...(log.length === 0 ? { kind: "承認" as const, site: p.site } : {}),
    });
  }
  const proposals = state.proposals.map((x) =>
    x.id === id ? { ...x, status: "承認済み" as const, fromHq, fromVendor, approvedAt: state.minutes, shipmentId, vendorId, rev: state.rev } : x,
  );
  return { ...state, stock, inbound: [...state.inbound, ...added], proposals, seq, log: [...log.reverse(), ...state.log] };
}

/** 却下：提案を消すだけ（在庫・搬送は変えない） */
function reject(state: DemoState, id: string): DemoState {
  const p = state.proposals.find((x) => x.id === id && x.status === "提案");
  if (!p) return state;
  return {
    ...state,
    proposals: state.proposals.filter((x) => x.id !== id),
    dismissed: { ...state.dismissed, [p.key]: p.basis.need },
    log: [{ at: state.minutes, text: `本部：${p.id}（${p.site}・${p.item}）を却下` }, ...state.log],
  };
}

/** 今日の患者（架空データ＋入力で足した分） */
export function patientsWithExtra(state: DemoState): PatientRow[] {
  const today = PATIENTS.map((r) => r.date).sort().at(-1) ?? "";
  return PATIENTS.map((r) => {
    const extra = state.extraPatients[r.site];
    if (r.date !== today || !extra) return r;
    return { ...r, patients: r.patients + extra.patients, chronic: r.chronic + extra.chronic };
  });
}

/** 時刻 a（含まない）から b（含む）までに、1日の中の分 t を通ったか */
function crossed(a: number, b: number, t: number): number | null {
  // 経過（分）を1日の中の分に直し、a < x <= b で x ≡ t (mod 1440) となる最小の x を探す
  const base = AS_OF_MINUTE;
  const first = Math.floor((a + base - t) / 1440) * 1440 + t - base;
  const x = first > a ? first : first + 1440;
  return x <= b ? x : null;
}

function tick(state: DemoState, hours: number): DemoState {
  const from = state.minutes;
  const to = from + hours * 60;
  const log: DemoLog[] = [];
  // 出庫のペースで在庫が減る（救護所だけ。本部備蓄はペースを持たない）
  // すべて写しにしてから変える（前の状態の行を書き換えない）
  const stock = state.stock.map((r) => {
    const c = { ...r };
    if (c.site === HQ || c.onHand === null || c.dailyUse === null || c.dailyUse <= 0 || c.onHand <= 0) return c;
    c.onHand = Math.max(0, c.onHand - (c.dailyUse * hours) / 24);
    return c;
  });
  // 到着見込みを過ぎた入荷・搬送が届く（照会中・融通の調整中は人の手配が要るので動かさない）。
  // 引当済みの搬送は、出発の時刻に搬送中になる（承認で足したものは departAt、最初からあるものは到着見込みの日の 07:00）
  const inbound = state.inbound.map((r): DemoInbound => {
    if (r.eta === "未定" || !(r.status === "確定" || r.status === "引当済み" || r.status === "搬送中")) return r;
    let cur: DemoInbound = r;
    if (cur.status === "引当済み") {
      const dep = cur.departAt ?? minutesAt(cur.eta, DEPART_MINUTE_OF_DAY);
      if (dep > from && dep <= to) {
        cur = { ...cur, status: "搬送中" };
        log.push({ at: dep, text: `${cur.to}：${cur.item} ${cur.qty} が本部を出発（搬送中）` });
      }
    }
    const at = cur.arriveAt ?? minutesAt(cur.eta, ARRIVAL_MINUTE_OF_DAY);
    if (at <= from || at > to) return cur;
    const target = stock.find((s) => s.site === r.to && s.item === r.item);
    if (target) target.onHand = (target.onHand ?? 0) + r.qty;
    log.push({ at, text: `${r.to}：${r.item} ${r.qty}${target?.unit ?? ""} を受領（${r.from} から）`, kind: "受領", site: r.to });
    return { ...cur, status: "受領" as const };
  });
  // 搬送便・連絡員・定時報告の時刻に、紙の記録が本部に届く
  const sync = state.sync.map((r) => {
    const times = SYNC_TIMES[r.site] ?? [];
    let hit: number | null = null;
    for (const t of times) {
      const x = crossed(from, to, t);
      if (x !== null && (hit === null || x > hit)) hit = x;
    }
    if (hit === null) return r;
    if (r.pending > 0) log.push({ at: hit, text: `${r.site}：記録 ${r.pending} 件が本部に届いた（${r.note}）` });
    return { ...r, lastSync: stampText(hit), pending: 0, pendingKind: "なし" as const };
  });
  for (const r of stock) {
    const before = state.stock.find((s) => s.site === r.site && s.item === r.item);
    if (before && before.onHand !== null && before.onHand > 0 && r.onHand === 0) {
      log.push({ at: to, text: `${r.site}：${r.item} が在庫切れ`, kind: "在庫切れ", site: r.site });
    }
  }
  return { ...state, minutes: to, stock, inbound, sync, log: [...log.sort((a, b) => b.at - a.at), ...state.log] };
}

function addRecord(state: DemoState, a: Extract<DemoAction, { type: "add_record" }>): DemoState {
  const n = state.records.filter((r) => r.site === a.site).length + 1;
  const id = `${a.site.replace("救護所", "")}-D${String(n).padStart(2, "0")}`;
  const stock = state.stock.map((r) => ({ ...r }));
  const needs = [...state.needs];
  const log: DemoLog[] = [{ at: state.minutes, text: `${a.site}：問診の記録 ${id} を追加（架空）`, kind: "登録", site: a.site }];
  let prescription: DemoRecord["prescription"] = null;
  let undelivered = 0;
  if (a.prescription && a.prescription.qty > 0) {
    const row = stock.find((s) => s.site === a.site && s.item === a.prescription?.item);
    const unit = row?.unit ?? "";
    const available = row?.onHand ?? 0;
    const out = Math.min(available, a.prescription.qty);
    if (row) row.onHand = available - out;
    undelivered = a.prescription.qty - out;
    prescription = { ...a.prescription, unit };
    log.push({ at: state.minutes, text: `${a.site}：${a.prescription.item} ${out}${unit} を出庫（処方 ${a.prescription.qty}${unit}・${a.prescription.days}日分）` });
    if (undelivered > 0) {
      needs.push({ site: a.site, item: a.prescription.item, qty: undelivered, by: stampText(state.minutes + 6 * 60) });
      log.push({ at: state.minutes, text: `${a.site}：${a.prescription.item} ${undelivered}${unit} が未交付（需要に載せた）`, kind: "未交付", site: a.site });
    }
  }
  const extra = state.extraPatients[a.site] ?? { patients: 0, chronic: 0 };
  const sync = state.sync.map((r) =>
    r.site === a.site && r.mode !== "オンライン"
      ? { ...r, pending: r.pending + 1, pendingKind: r.mode === "紙で記録・通信なし" ? ("未着" as const) : ("転記待ち" as const) }
      : r,
  );
  return {
    ...state,
    stock,
    needs,
    sync,
    extraPatients: { ...state.extraPatients, [a.site]: { patients: extra.patients + 1, chronic: extra.chronic + (prescription ? 1 : 0) } },
    records: [{ id, site: a.site, name: a.name, at: state.minutes, items: a.items, prescription, undelivered }, ...state.records],
    log: [...log.reverse(), ...state.log],
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "tick":
      return refreshProposals(tick({ ...state, rev: state.rev + 1 }, action.hours));
    case "run":
      return { ...state, running: action.running };
    case "reset":
      return initialDemo();
    case "add_record":
      return refreshProposals(addRecord({ ...state, rev: state.rev + 1 }, action));
    case "approve_proposal":
      return refreshProposals(approve({ ...state, rev: state.rev + 1 }, action.id));
    case "reject_proposal":
      return refreshProposals(reject({ ...state, rev: state.rev + 1 }, action.id));
  }
}

/** 救護所の並び（本部備蓄は除く） */
export const DEMO_SITES: readonly SiteId[] = SHELTERS;

/** カルテ（患者ごとの一枚）の1回分の記録 */
export interface ChartVisit {
  id: string;
  /** 画面に出す時刻 */
  at: string;
  source: string;
  items: readonly { label: string; value: string }[];
  /** 医師が入力した処方の文（無ければ空） */
  prescription: string;
  undelivered: number;
}

/** カルテ（患者ごとの一枚）。架空の氏名か番号で1人を表し、記録の履歴を新しい順に持つ */
export interface PatientChart {
  key: string;
  site: SiteId;
  /** 架空の氏名。最初からある記録は名前を持たず null（番号だけ） */
  name: string | null;
  /** 見出しに出す番号（最新の記録の番号） */
  id: string;
  visits: ChartVisit[];
  /** 未交付の合計 */
  undelivered: number;
  hasPrescription: boolean;
  /** 画面で入力して加えたもの */
  added: boolean;
}

/**
 * 救護所ごとのカルテ。入力で加えた記録は「救護所＋架空の氏名」で1人にまとめ（同じ名前で2回入力すると履歴が2つ）、
 * 最初からある記録は番号ごとに1人。並びは、加えたもの（新しい順）→ 最初からあるもの
 */
export function chartsFor(
  state: DemoState,
  initial: readonly {
    id: string;
    site: SiteId;
    recordedAt: string;
    source: string;
    items: readonly { label: string; value: string }[];
    prescription: string;
  }[],
): PatientChart[] {
  const charts: PatientChart[] = [];
  for (const r of state.records) {
    const key = `${r.site}|${r.name}`;
    const visit: ChartVisit = {
      id: r.id,
      at: clockText(r.at),
      source: "画面で入力（デモ）",
      items: r.items,
      prescription:
        r.prescription === null
          ? ""
          : `${r.prescription.item} ${r.prescription.qty}${r.prescription.unit}・${r.prescription.days}日分`,
      undelivered: r.undelivered,
    };
    const found = charts.find((c) => c.key === key);
    if (found) {
      found.visits.push(visit);
      found.undelivered += r.undelivered;
      found.hasPrescription = found.hasPrescription || r.prescription !== null;
    } else {
      charts.push({
        key,
        site: r.site,
        name: r.name,
        id: r.id,
        visits: [visit],
        undelivered: r.undelivered,
        hasPrescription: r.prescription !== null,
        added: true,
      });
    }
  }
  for (const r of initial) {
    charts.push({
      key: `${r.site}|#${r.id}`,
      site: r.site,
      name: null,
      id: r.id,
      visits: [
        {
          id: r.id,
          at: `${r.recordedAt.slice(5, 10).replace("-", "/")} ${r.recordedAt.slice(11)}`,
          source: r.source,
          items: r.items,
          prescription: r.prescription,
          undelivered: 0,
        },
      ],
      undelivered: 0,
      hasPrescription: r.prescription !== "",
      added: false,
    });
  }
  return charts;
}

/** 入力の下書きに使う架空の氏名（実在の人ではない。「架空」を添えて出す） */
export const FICTIONAL_NAMES: readonly string[] = ["架空 太郎", "架空 花子", "仮名 一郎", "仮名 美咲", "例示 健", "例示 さくら"];

export function nextFictionalName(used: number): string {
  return FICTIONAL_NAMES[used % FICTIONAL_NAMES.length];
}

/**
 * 「前回から変わったこと」（Issue #107）：デモの開始（BOARD_AS_OF）からの出来事を種類ごとに数える。
 * site を渡すとその救護所の分だけ。記録の文・氏名・品目名・数量は使わない（件数だけ）
 */
export function changesSince(log: readonly DemoLog[], site?: SiteId): Record<DemoEventKind, number> {
  const counts: Record<DemoEventKind, number> = { 登録: 0, 未交付: 0, 提案: 0, 承認: 0, 受領: 0, 在庫切れ: 0 };
  for (const l of log) {
    if (!l.kind || l.at < 0) continue;
    if (site !== undefined && l.site !== site) continue;
    counts[l.kind] += 1;
  }
  return counts;
}

/** 架空の時刻の文字（「2026-11-05 07:30」）→ BOARD_AS_OF からの経過（分） */
export function stampMinutes(stamp: string): number {
  return minutesAt(stamp.slice(0, 10), Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16)));
}
