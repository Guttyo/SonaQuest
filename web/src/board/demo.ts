// ボードのデモの状態（Issue #102）。架空の時計を進めると在庫・入荷・記録の届き方が動き、架空の問診を入力すると
// 救護所の記録に加わって在庫と需要が変わる。状態はブラウザのメモリにだけあり、保存・送信・ログ出力をしない（ADR-0007）。
// ここで行うのは在庫の足し引きと時刻の比較だけで、薬の正誤・処方・服薬の判断はしない。

import {
  BOARD_AS_OF,
  HQ,
  INBOUND,
  NEEDS,
  PATIENTS,
  SHELTERS,
  STOCK,
  SYNC,
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

export interface DemoLog {
  at: number;
  text: string;
}

export interface DemoState {
  /** BOARD_AS_OF からの経過（分） */
  minutes: number;
  running: boolean;
  stock: StockRow[];
  inbound: InboundRow[];
  sync: SyncRow[];
  needs: NeedRow[];
  /** 今日の患者に足した数（救護所ごと） */
  extraPatients: Record<string, { patients: number; chronic: number }>;
  records: DemoRecord[];
  /** 起きたことの記録（新しいものが先。画面に出すだけ） */
  log: DemoLog[];
}

export type DemoAction =
  | { type: "tick"; hours: number }
  | { type: "run"; running: boolean }
  | { type: "reset" }
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
  return {
    minutes: 0,
    running: false,
    stock: STOCK.map((r) => ({ ...r })),
    inbound: INBOUND.map((r) => ({ ...r })),
    sync: SYNC.map((r) => ({ ...r })),
    needs: NEEDS.map((r) => ({ ...r })),
    extraPatients: {},
    records: [],
    log: [],
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
  // 到着見込みを過ぎた入荷・搬送が届く（照会中・融通の調整中は人の手配が要るので動かさない）
  const inbound = state.inbound.map((r) => {
    if (r.eta === "未定" || !(r.status === "確定" || r.status === "引当済み" || r.status === "搬送中")) return r;
    const at = minutesAt(r.eta, ARRIVAL_MINUTE_OF_DAY);
    if (at <= from || at > to) return r;
    const target = stock.find((s) => s.site === r.to && s.item === r.item);
    if (target) target.onHand = (target.onHand ?? 0) + r.qty;
    log.push({ at, text: `${r.to}：${r.item} ${r.qty}${target?.unit ?? ""} を受領（${r.from} から）` });
    return { ...r, status: "受領" as const };
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
      log.push({ at: to, text: `${r.site}：${r.item} が在庫切れ` });
    }
  }
  return { ...state, minutes: to, stock, inbound, sync, log: [...log.sort((a, b) => b.at - a.at), ...state.log].slice(0, 30) };
}

function addRecord(state: DemoState, a: Extract<DemoAction, { type: "add_record" }>): DemoState {
  const n = state.records.filter((r) => r.site === a.site).length + 1;
  const id = `${a.site.replace("救護所", "")}-D${String(n).padStart(2, "0")}`;
  const stock = state.stock.map((r) => ({ ...r }));
  const needs = [...state.needs];
  const log: DemoLog[] = [{ at: state.minutes, text: `${a.site}：問診の記録 ${id} を追加（架空）` }];
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
      log.push({ at: state.minutes, text: `${a.site}：${a.prescription.item} ${undelivered}${unit} が未交付（需要に載せた）` });
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
    log: [...log.reverse(), ...state.log].slice(0, 30),
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "tick":
      return tick(state, action.hours);
    case "run":
      return { ...state, running: action.running };
    case "reset":
      return initialDemo();
    case "add_record":
      return addRecord(state, action);
  }
}

/** 救護所の並び（本部備蓄は除く） */
export const DEMO_SITES: readonly SiteId[] = SHELTERS;

/** 入力の下書きに使う架空の氏名（実在の人ではない。「架空」を添えて出す） */
export const FICTIONAL_NAMES: readonly string[] = ["架空 太郎", "架空 花子", "仮名 一郎", "仮名 美咲", "例示 健", "例示 さくら"];

export function nextFictionalName(used: number): string {
  return FICTIONAL_NAMES[used % FICTIONAL_NAMES.length];
}
