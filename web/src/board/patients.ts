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
 * 架空の患者 100 人の氏名（姓・名・性別。Issue #151）。北海道の地名を姓にした遊び心のある架空の氏名で、実在の人とは関係がない。
 * 地名には実在する姓と同じものもあるが、画面の注意文で架空と示す。入力の下書きの名前（demo.ts の FICTIONAL_NAMES）と重ならない
 */
// [TODO-OWNER: 架空の患者 100 人の氏名の作り方（Claude Code の下書き。姓は架空・仮名・例示・見本・模擬、名は下の20）と、性別の付け方]
// → オーナー決定（2026-11-06、チャット）：北海道の地名由来の遊び心のある氏名にする（「北海 太郎」「石狩 花子」「札幌 清二郎」「幌加内 そば太郎」「石狩 鮭太郎」「小樽 ルタ夫」など）。実在する姓と同じ地名でもよく、架空であることを画面で示す。100 人の表（Issue #151）を確認した
// → オーナー決定（2026-11-07、チャット、Issue #217）：「どちらも下書きのまま採る」（性別の付け方。名の響きに合わせて1人ずつ付けた今の表）
const NAMES: readonly (readonly [string, string, SimSex])[] = [
  ["北海", "太郎", "男性"],
  ["石狩", "花子", "女性"],
  ["札幌", "清二郎", "男性"],
  ["幌加内", "そば太郎", "男性"],
  ["石狩", "鮭太郎", "男性"],
  ["小樽", "ルタ夫", "男性"],
  ["夕張", "メロン子", "女性"],
  ["猿払", "ほたて", "女性"],
  ["函館", "いか蔵", "男性"],
  ["釧路", "霧子", "女性"],
  ["稚内", "昆布太", "男性"],
  ["美瑛", "丘乃", "女性"],
  ["洞爺", "湖子", "女性"],
  ["羊蹄", "じゃが衛門", "男性"],
  ["富良野", "ラベ子", "女性"],
  ["十勝", "豆助", "男性"],
  ["旭川", "正一", "男性"],
  ["帯広", "丼太", "男性"],
  ["網走", "氷見子", "女性"],
  ["登別", "鬼太", "男性"],
  ["支笏", "みどり", "女性"],
  ["大雪", "峰雄", "男性"],
  ["様似", "昆布男", "男性"],
  ["留萌", "かず子", "女性"],
  ["根室", "さん子", "女性"],
  ["知床", "熊吉", "男性"],
  ["摩周", "霧男", "男性"],
  ["阿寒", "まりも", "女性"],
  ["襟裳", "風太", "男性"],
  ["積丹", "うに子", "女性"],
  ["利尻", "昆布子", "女性"],
  ["礼文", "花代", "女性"],
  ["奥尻", "波男", "男性"],
  ["江差", "追分", "男性"],
  ["松前", "漬子", "女性"],
  ["増毛", "えび子", "女性"],
  ["滝上", "桜子", "女性"],
  ["芦別", "星夫", "男性"],
  ["士別", "羊子", "女性"],
  ["名寄", "もち太", "男性"],
  ["紋別", "蟹蔵", "男性"],
  ["遠軽", "岩男", "男性"],
  ["北見", "たま子", "女性"],
  ["美幌", "峯子", "女性"],
  ["斜里", "鮭子", "女性"],
  ["中標津", "牧男", "男性"],
  ["厚岸", "かき男", "男性"],
  ["白糠", "柳葉", "女性"],
  ["足寄", "ふき子", "女性"],
  ["新得", "そば子", "女性"],
  ["鹿追", "鹿之助", "男性"],
  ["芽室", "麦太", "男性"],
  ["広尾", "聖太", "男性"],
  ["浦河", "馬之助", "男性"],
  ["新冠", "駿子", "女性"],
  ["苫小牧", "ほっき", "男性"],
  ["白老", "たら子", "女性"],
  ["室蘭", "鉄男", "男性"],
  ["長万部", "かに子", "女性"],
  ["八雲", "熊彦", "男性"],
  ["七飯", "りんご", "女性"],
  ["木古内", "みそぎ", "女性"],
  ["千歳", "空子", "女性"],
  ["恵庭", "花恵", "女性"],
  ["江別", "れんが", "男性"],
  ["当別", "麻衣", "女性"],
  ["岩見沢", "ばら子", "女性"],
  ["美唄", "とり助", "男性"],
  ["砂川", "甘太", "男性"],
  ["北竜", "向日葵", "女性"],
  ["妹背牛", "ともえ", "女性"],
  ["秩父別", "緑男", "男性"],
  ["雨竜", "沼子", "女性"],
  ["占冠", "雪夫", "男性"],
  ["南富良野", "かぼ子", "女性"],
  ["上富良野", "豊穂", "男性"],
  ["東川", "写楽", "男性"],
  ["東神楽", "花音", "女性"],
  ["比布", "苺花", "女性"],
  ["愛別", "茸郎", "男性"],
  ["剣淵", "絵都", "女性"],
  ["和寒", "菜々", "女性"],
  ["音威子府", "黒麦", "男性"],
  ["美深", "鮫吉", "男性"],
  ["幸福", "幸子", "女性"],
  ["愛国", "進", "男性"],
  ["倶知安", "じゃが子", "女性"],
  ["余市", "樽男", "男性"],
  ["岩内", "鱈男", "男性"],
  ["寿都", "風子", "女性"],
  ["黒松内", "文太", "男性"],
  ["豊浦", "帆立", "男性"],
  ["士幌", "芋蔵", "男性"],
  ["上士幌", "球子", "女性"],
  ["大樹", "宙", "男性"],
  ["幕別", "球太", "男性"],
  ["本別", "小豆", "女性"],
  ["陸別", "寒太", "男性"],
  ["標茶", "牧子", "女性"],
  ["弟子屈", "湯太", "男性"],
];

/**
 * 服薬に使う品目と、架空の1日の量の候補（品目の単位）。data.ts の仮名の品目のうち、毎日続ける薬の形のものだけ。
 * 量は在庫の動きを見せるための架空の数で、用法・用量の基準ではない
 */
// 決定済み：架空の患者の服薬の品目と1日の量の候補（Claude Code の下書き。降圧薬A 1〜2錠、血糖降下薬B 1〜3錠、抗てんかん薬C 2〜3錠、貼付鎮痛薬E 1〜2枚、抗凝固薬F 1〜2錠）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（ボードの架空の数値）
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
// 決定済み：架空の患者のけが・体調の候補の文（Claude Code の下書き。なし、すり傷、打撲、切り傷、捻挫、軽いやけど）と、「なし」の割合（半分）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（ボードの架空の数値）
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
  for (let i = 0; i < NAMES.length; i += 1) {
    const [family, given, sex] = NAMES[i];
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
    out.push({ no: i + 1, name: `${family} ${given}`, sex, age, meds, condition });
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
// 決定済み：1時間に到着する人数の候補（Claude Code の下書き。0・1・1・2・2・3 人）と、救護所の選び方（避難者数の割合）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（ボードの架空の数値）
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
