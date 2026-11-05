// ボードのデモの架空の患者 100 人（Issue #122、ADR-0048）。
// 人物・氏名・年齢・服薬・けがはすべて架空。氏名は「架空」「仮名」のような、架空と分かる姓だけで作り、実在の人の名前を使わない。
// 薬は data.ts の仮名の品目だけで、実在の薬の名前を使わない。状態はブラウザのメモリにだけあり、保存・送信・ログ出力をしない（ADR-0007）。
// アプリはけがの重さ・緊急度・処置を判断しない。けが・体調の文は入れたまま出すだけ。
// Claude も API も使わない。動きは種（seed）付きの乱数とルールで決める。

import { DEMAND, SHELTERS, type SiteId } from "./data";

/**
 * 種付きの乱数（mulberry32）。同じ種なら同じ並びの数を返す。依存を足さないためにここに書く。
 * 返す値は 0 以上 1 未満
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 到着の並びの、最初の種。画面に出し、「別の並びで」で替える */
export const DEFAULT_ARRIVAL_SEED = 261106;

/** 次の種（1〜999999）。今の種から決めるので、同じ種からは同じ次の種になる */
export function nextSeed(seed: number): number {
  const r = mulberry32(seed ^ 0x9e3779b9)();
  const next = Math.floor(r * 999999) + 1;
  return next === seed ? (next % 999999) + 1 : next;
}

/**
 * 1人に渡す日数。オーナーの聞き取り（2026-11-06、チャット）：災害時は在庫が限られ、広く行き渡らせるために
 * 長期の処方ができず、数日分ずつ渡していた。それを一般化した、デモの在庫の足し引きのルール（医学的な基準ではない）
 */
export const DISPENSE_DAYS = 3;

export type SimSex = "男性" | "女性";

export interface SimMed {
  /** data.ts の仮名の品目 */
  item: string;
  /** 架空の1日の量（品目の単位。錠・枚） */
  perDay: number;
}

export interface SimPatient {
  /** 番号（1〜100） */
  no: number;
  /** 架空の氏名（実在の人の名前ではない） */
  name: string;
  sex: SimSex;
  age: number;
  meds: readonly SimMed[];
  /** けが・体調（架空の文。アプリは重さ・緊急度・処置を判断しない） */
  condition: string;
}

/**
 * 架空の氏名の材料。姓は架空と分かる語だけにし、実在する風の姓を使わない（ADR-0043 の却下案）。
 * 入力の下書きの名前（demo.ts の FICTIONAL_NAMES）と重ならない名にした
 */
// [TODO-OWNER: 架空の患者 100 人の氏名の作り方（Claude Code の下書き。姓は架空・仮名・例示・見本・模擬、名は下の20）と、性別の付け方]
const SURNAMES = ["架空", "仮名", "例示", "見本", "模擬"] as const;
const GIVEN: readonly { name: string; sex: SimSex }[] = [
  { name: "次郎", sex: "男性" },
  { name: "和子", sex: "女性" },
  { name: "三郎", sex: "男性" },
  { name: "洋子", sex: "女性" },
  { name: "四郎", sex: "男性" },
  { name: "京子", sex: "女性" },
  { name: "五郎", sex: "男性" },
  { name: "幸子", sex: "女性" },
  { name: "誠", sex: "男性" },
  { name: "恵子", sex: "女性" },
  { name: "学", sex: "男性" },
  { name: "陽子", sex: "女性" },
  { name: "修", sex: "男性" },
  { name: "直美", sex: "女性" },
  { name: "進", sex: "男性" },
  { name: "久美", sex: "女性" },
  { name: "実", sex: "男性" },
  { name: "由美", sex: "女性" },
  { name: "勇", sex: "男性" },
  { name: "智子", sex: "女性" },
];

/**
 * 服薬に使う品目と、架空の1日の量の候補（品目の単位）。data.ts の仮名の品目のうち、毎日続ける薬の形のものだけ。
 * 量は在庫の動きを見せるための架空の数で、用法・用量の基準ではない
 */
// [TODO-OWNER: 架空の患者の服薬の品目と1日の量の候補（Claude Code の下書き。降圧薬A 1〜2錠、血糖降下薬B 1〜3錠、抗てんかん薬C 2〜3錠、貼付鎮痛薬E 1〜2枚、抗凝固薬F 1〜2錠）]
const MED_CHOICES: readonly { item: string; perDay: readonly number[]; weight: number }[] = [
  { item: "降圧薬A", perDay: [1, 2], weight: 5 },
  { item: "血糖降下薬B", perDay: [1, 2, 3], weight: 3 },
  { item: "抗てんかん薬C", perDay: [2, 3], weight: 1 },
  { item: "貼付鎮痛薬E", perDay: [1, 2], weight: 2 },
  { item: "抗凝固薬F", perDay: [1, 2], weight: 2 },
];

/** けが・体調が「なし」の文。けがのある人の人数は、これ以外の人を数えるだけ */
export const CONDITION_NONE = "なし";

/**
 * けが・体調の候補（架空の固定文）。アプリは重さ・緊急度・処置を判断せず、文を入れたまま出す。
 * 並びは表示の順ではなく、選ぶときの候補の並び
 */
// [TODO-OWNER: 架空の患者のけが・体調の候補の文（Claude Code の下書き。なし、すり傷、打撲、切り傷、捻挫、軽いやけど）と、「なし」の割合（半分）]
export const CONDITIONS: readonly string[] = [CONDITION_NONE, "すり傷", "打撲", "切り傷", "捻挫", "軽いやけど"];
const CONDITION_NONE_SHARE = 0.5;

/** 患者そのもの（氏名・年齢・服薬・けが）を決める種。到着の並びの種とは別で、変えない */
const PATIENT_SEED = 20261106;

function pickWeighted<T extends { weight: number }>(list: readonly T[], r: number): T {
  const total = list.reduce((a, x) => a + x.weight, 0);
  let x = r * total;
  for (const it of list) {
    x -= it.weight;
    if (x < 0) return it;
  }
  return list[list.length - 1];
}

function buildPatients(): SimPatient[] {
  const rand = mulberry32(PATIENT_SEED);
  const out: SimPatient[] = [];
  for (let i = 0; i < SURNAMES.length * GIVEN.length; i += 1) {
    const g = GIVEN[Math.floor(i / SURNAMES.length)];
    const age = 20 + Math.floor(rand() * 70);
    const r = rand();
    const count = r < 0.5 ? 1 : r < 0.85 ? 2 : 3;
    const left = [...MED_CHOICES];
    const meds: SimMed[] = [];
    for (let k = 0; k < count && left.length > 0; k += 1) {
      const m = pickWeighted(left, rand());
      left.splice(left.indexOf(m), 1);
      meds.push({ item: m.item, perDay: m.perDay[Math.floor(rand() * m.perDay.length)] });
    }
    const c = rand();
    const condition = c < CONDITION_NONE_SHARE ? CONDITION_NONE : CONDITIONS[1 + Math.floor(rand() * (CONDITIONS.length - 1))];
    out.push({ no: i + 1, name: `${SURNAMES[i % SURNAMES.length]} ${g.name}`, sex: g.sex, age, meds, condition });
  }
  return out;
}

/** 架空の患者 100 人（番号の順） */
export const SIM_PATIENTS: readonly SimPatient[] = buildPatients();

export function simPatient(no: number): SimPatient | undefined {
  return SIM_PATIENTS[no - 1];
}

export function hasCondition(p: SimPatient): boolean {
  return p.condition !== CONDITION_NONE;
}

/** 3日分の数（1日の量 × 渡す日数。品目の単位） */
export function dispenseQty(m: SimMed): number {
  return Math.ceil(m.perDay * DISPENSE_DAYS);
}

/** 到着の予定の1件。hour は「到着を始めてから時計が何時間進んだときか」（1 から） */
export interface PlannedArrival {
  no: number;
  site: SiteId;
  hour: number;
}

/** 1時間に到着する人数の候補（等しい確からしさで1つ選ぶ。平均 1.5 人） */
// [TODO-OWNER: 1時間に到着する人数の候補（Claude Code の下書き。0・1・1・2・2・3 人）と、救護所の選び方（避難者数の割合）]
const PER_HOUR: readonly number[] = [0, 1, 1, 2, 2, 3];

/**
 * 種から到着の予定を決める（ルール＋乱数。Claude は使わない）。
 * 到着の順番は 100 人を混ぜた並び、到着する救護所は避難者数（DEMAND）の割合で選び、1時間の人数は PER_HOUR から選ぶ。
 * 同じ種なら同じ予定になる
 */
export function arrivalPlan(seed: number): PlannedArrival[] {
  const rand = mulberry32(seed);
  const order = SIM_PATIENTS.map((p) => p.no);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const weights = SHELTERS.map((site) => ({ site, weight: DEMAND.find((d) => d.site === site)?.evacuees ?? 1 }));
  const plan: PlannedArrival[] = [];
  let i = 0;
  for (let hour = 1; i < order.length; hour += 1) {
    const n = PER_HOUR[Math.floor(rand() * PER_HOUR.length)];
    for (let k = 0; k < n && i < order.length; k += 1) {
      plan.push({ no: order[i], site: pickWeighted(weights, rand()).site, hour });
      i += 1;
    }
  }
  return plan;
}
