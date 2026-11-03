// Claude が作った文（質問文、受け止めの一言、質問し直す文）の検査（ADR-0025、docs/safety-test-plan.md S16〜S18）。
// 1つでも通らなければ、その文を捨てて固定文に戻す。検査は完全ではないので、語の一覧と試験を一緒に直す。

import { MAX_PROMPT_LENGTH } from "../src/flow/turnContract";

/**
 * 禁止表現（語の照合）。薬の名前の修正、候補や推測の確認、薬効・用法・用量、服薬の助言、
 * 診断、緊急度、備蓄の量、公的な制度、個人の連絡先を尋ねること
 */
// [TODO-OWNER: Claude が作った文で禁止する表現の一覧（Claude Codeの下書き）]
export const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  // 候補・推測の確認、薬の名前の修正
  /ではないですか|ではありませんか|じゃないですか|のことですか|という意味ですか/,
  /かもしれません|と思われます|おそらく|可能性が(?:あります|高い)/,
  /正しくは|の間違い|間違って(?:いま|い)/,
  // 薬効・用法・用量
  /効(?:く|き目|果|能)/,
  /副作用/,
  /用法|用量|飲み方/,
  /\d+\s*(?:mg|ｍｇ|ミリ|錠|カプセル|包|回|日分)/i,
  /食前|食後|食間|就寝前/,
  // 服薬の助言
  /飲んで(?:ください|下さい|おきましょう|おいて)|飲まない(?:で|ほうが|方が)/,
  /服用(?:して|を|しない)|中止|中断して|続けて(?:ください|下さい)|控え(?:て|ましょう)/,
  /増や|減ら|やめ(?:て|ましょう|たほうが|た方が)/,
  /受診|相談して(?:ください|下さい)|病院(?:に|へ)行/,
  // 診断・緊急度・体調の判断
  /診断|病気です|症状(?:です|が出|は)|疑い/,
  /緊急|救急|危険|命に/,
  /心配(?:ない|いりません|ありません)|問題(?:ない|ありません)/,
  // 備蓄・公的な制度
  /備蓄|ストック/,
  /制度|助成|補助金/,
  // 個人の情報を尋ねること
  /電話番号を|住所|氏名|お名前|フルネーム/,
  // 外部への誘導
  /https?:|www\./i,
];

/**
 * 利用者の回答の一部を繰り返していないか。ひらがなだけの並び（「ています」など）は除き、
 * 漢字・カタカナ・英数字を含む4文字以上の並びが、固定の質問文に無いのに文に現れたら繰り返しとみなす。
 * 薬の名前（カタカナ）や病名（漢字）の繰り返しを捕まえるため
 */
export const REPEAT_WINDOW = 4;

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

const HIRAGANA_ONLY = /^[ぁ-ゟ]+$/u;

export function repeatsUserWords(text: string, userTexts: readonly string[], allowed: readonly string[]): boolean {
  const target = normalize(text);
  const allowedText = allowed.map(normalize).join("\n");
  for (const userText of userTexts) {
    const source = [...normalize(userText)];
    for (let i = 0; i + REPEAT_WINDOW <= source.length; i++) {
      const window = source.slice(i, i + REPEAT_WINDOW).join("");
      if (HIRAGANA_ONLY.test(window)) continue;
      if (target.includes(window) && !allowedText.includes(window)) return true;
    }
  }
  return false;
}

export interface TextCheckContext {
  /** 利用者のこれまでの入力 */
  userTexts: readonly string[];
  /** 文に含まれてよい固定文（いまの質問・次の質問の固定文など） */
  allowed: readonly string[];
}

/** 文を画面に出してよいか。長さ・禁止表現・繰り返しの3つ */
export function isAcceptablePromptText(text: string, context: TextCheckContext): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || text.length > MAX_PROMPT_LENGTH) return false;
  if (FORBIDDEN_PATTERNS.some((p) => p.test(text.normalize("NFKC")))) return false;
  return !repeatsUserWords(text, context.userTexts, context.allowed);
}
