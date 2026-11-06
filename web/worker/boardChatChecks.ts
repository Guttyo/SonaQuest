// ボードの掲示板チャット（B-07、ADR-0047）で、エージェントが作った文の検査。画面に出す前に Workers で必ず通す。
// 1つでも通らなければ、その文を捨てて固定の掲示に替える。検査は完全ではないので、語の一覧と試験
// （docs/safety-test-plan.md の H8〜H10、boardChatChecks.test.ts）を一緒に直す。迷うものは捨てる側に寄せる。
//
// 訓練の検査（checks.ts の FORBIDDEN_PATTERNS）をそのまま使わない理由：訓練の一覧は「処方箋」「備蓄」「日分」
// 「急いで」と、数字＋「本」「枚」などを止める。これはこのチャットで書いてよい連絡（処方箋の用紙・物資・数）そのものなので、
// そのまま当てるとほとんどの文が捨てられる。そこで、訓練の一覧のうち薬と医療に関わるものを引き継ぎ、
// 薬の言葉（薬・錠・剤など）そのものと、許していないカタカナ・英字の言葉を止める形にした（ADR-0047）。

import { BOARD_CHAT_KATAKANA_WORDS } from "./boardChatAgents";
import { MAX_CHAT_TEXT_LENGTH } from "../src/board/chat/contract";

const KANJI = "[\\u4e00-\\u9fff々]";
const KATAKANA = "[\\u30a1-\\u30faー]";
const NUM = "[0-9０-９一二三四五六七八九十百千半]";

/** 禁止表現（語の照合）。空白を除き、NFKC でそろえた文に当てる */
// [TODO-OWNER: 掲示板チャットで禁止する表現の一覧（Claude Code の下書き）]
// → オーナー決定（2026-11-07、チャット、Issue #207）：「案は提出後、今の下書きは採る（推奨）」（ボードの AI の守り）
export const CHAT_FORBIDDEN_PATTERNS: readonly RegExp[] = [
  // 薬の言葉そのもの。「薬剤師」（人員）と「処方箋」（用紙）は連絡に使うので除く
  /薬(?!剤師)|(?<![薬洗])剤(?!師)|錠|カプセル|処方(?!箋)|服用|服薬|内服|頓服|投与|投薬|点滴|注射|吸入|貼付|軟膏|湿布|座薬|目薬|インスリン|ワクチン|抗生/,
  // 量の単位
  new RegExp(`${NUM}+\\s*(?:mg|ml|μg|mcg|ミリグラム|ミリリットル|錠|カプセル|包|日分|単位)`, "i"),
  // 病名らしい語（〜病・〜症・〜炎）と、病気・症状の言葉
  new RegExp(`${KANJI}+(?:病(?!院|棟|室)|症|炎)`),
  /血圧|血糖|糖尿|コレステロール|喘息|痛風|心臓|肝臓|腎臓|甲状腺|認知症|癌|てんかん|発作|けいれん|痙攣|発熱|咳|下痢|嘔吐|骨折|出血|感染|アレルギー|副作用|持病|基礎疾患/,
  // 薬効・用法・飲み方（「飲み水」「飲料」は物資なので止めない）
  /効(?:く|き目|果|能)|用法|用量|飲み方|飲んで|飲ませ|飲まな|飲み続|飲み忘|飲むよう|朝晩|朝昼晩|食前|食後|食間|就寝前/,
  // 診断・治療・体調・緊急度や重症度の判断
  /診断|診察|受診|治療|手当て|容体|容態|症状|体調|具合|重症|軽症|重篤|危篤|命に|救急|トリアージ|安静|様子を見/,
  // 公的な制度の説明
  /制度|助成|補助金|特例/,
  // 個人の情報（人は役割で書く）。「皆さん」「皆様」「患者さん」は照合の前に外す
  /電話番号|住所|氏名|フルネーム|生年月日|年齢|何歳/,
  new RegExp(`${KANJI}{1,4}(?:さん|先生)`),
  /\d{2,4}[-ー－]\d{2,4}[-ー－]\d{3,4}/,
  // 外への誘導
  /https?:|www\.|@/i,
];

/** 文を捨てた理由の種類。本文を含まないので、公開する版でもログに出してよい */
export type ChatRejectReason = "length" | "forbidden" | "unknown_term";

/** カタカナで1文字だけ使ってよいもの（「1ヶ所」の「ヶ」など、数える言葉） */
const KATAKANA_SINGLE_OK = new Set(["ヶ", "ヵ"]);
/** 英字で使ってよいもの。本部の「HQ」と、救護所の記号（大文字の A〜D の1文字）だけ */
const LATIN_OK = new Set(["HQ", "A", "B", "C", "D"]);

/** カタカナの並びが、許可の一覧の言葉（後ろの長音は付いてよい）をつなげただけでできているか */
function katakanaAllowed(run: string): boolean {
  if (/^ー+$/.test(run) || KATAKANA_SINGLE_OK.has(run)) return true;
  // 先頭から i 文字目までを、許可の言葉で区切れるか（区切れる位置を順に調べる）
  const ok: boolean[] = new Array(run.length + 1).fill(false);
  ok[0] = true;
  for (let i = 0; i < run.length; i++) {
    if (!ok[i]) continue;
    for (const word of BOARD_CHAT_KATAKANA_WORDS) {
      if (!run.startsWith(word, i)) continue;
      let end = i + word.length;
      while (run[end] === "ー") end += 1;
      ok[i + word.length] = true;
      ok[end] = true;
    }
  }
  return ok[run.length];
}

/**
 * 許していないカタカナの言葉と英字の言葉を探す。
 * カタカナは空白・改行を除いてから、1文字の並びも含めて調べる（「ア ム ロ」のように分けてすり抜けないように）。
 * 一覧の言葉をつなげただけの並び（「トイレタオル」）は通す。英字は「HQ」と救護所の記号（A〜D の1文字）だけを許す
 */
export function chatUnknownTerms(text: string): string[] {
  const nfkc = text.normalize("NFKC");
  const joined = nfkc.replace(/\s+/g, "");
  const katakana = [...joined.matchAll(new RegExp(`${KATAKANA}+`, "gu"))].map((m) => m[0]).filter((w) => !katakanaAllowed(w));
  const latin = [...nfkc.matchAll(/[A-Za-z]+/gu)].map((m) => m[0]).filter((w) => !LATIN_OK.has(w));
  return [...katakana, ...latin];
}

/** 先頭に付いた役の名前（「救護所B：」など）を外す。画面は役の名前を別に出すため */
export function stripRolePrefix(text: string): string {
  return text.replace(/^\s*(?:本部(?:（HQ）|\(HQ\))?|HQ|救護所[A-DＡ-Ｄ])\s*[:：]\s*/u, "").trim();
}

/** 文の問題を1つ返す。画面に出してよければ null。長さ・禁止表現・許していない言葉の順に見る */
export function chatTextProblem(text: string): ChatRejectReason | null {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_CHAT_TEXT_LENGTH) return "length";
  // 語の間に空白や改行をはさんですり抜けないよう、空白を除いた文で照合する（表示は元の文のまま）
  const nfkc = trimmed.normalize("NFKC").replace(/\s+/g, "").replace(/皆さん|皆様|患者さん/g, "");
  if (CHAT_FORBIDDEN_PATTERNS.some((p) => p.test(nfkc))) return "forbidden";
  if (chatUnknownTerms(trimmed).length > 0) return "unknown_term";
  return null;
}
