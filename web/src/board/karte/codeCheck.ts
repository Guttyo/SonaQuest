// カルテの要約の1段目：コードでの確認（B-10、Issue #142、ADR-0052 の提案）。AI を使わず、要約を出すたびに必ず通す。
// - quote が、会話の本人の発言のどれか1つに文字どおり含まれるか（含まなければ「根拠なし」）。
//   照合の前に NFKC などでそろえない（「文字どおり」を守る。前後の空白だけ外す）。聞き手の質問は根拠にしない。
// - text に出る数字・カタカナ・英字が、quote にもあるか（量や名前が足された・変わったのを拾う）。
// - text が禁止表現（助言・診断めいた言い方など。下書き）に当たらないか。
// - 5観点が、items か not_covered のどちらかにちょうど現れるか。
// 検査は完全ではない（意味が変わった・落ちたは、2段目の監査役と、最後に確定する人が見る）。語の一覧と試験
// （codeCheck.test.ts、docs/safety-test-plan.md の H13）を一緒に直す。

import {
  KARTE_ASPECTS,
  MAX_ITEM_TEXT_LENGTH,
  MAX_QUOTE_LENGTH,
  MIN_QUOTE_LENGTH,
  type CodeFinding,
  type KarteSummary,
} from "./contract";

/**
 * 要約の text に使わない表現（下書き）。服薬の指示・量の指示・診断めいた言い方・安心させる判断・評価。
 * 本人の言葉には薬の名前や量が入るので、訓練の一覧（worker/checks.ts）や掲示板チャットの一覧は使わない
 * （当てるとほとんどの正しい要約が止まる）。空白を除き、NFKC でそろえた text に当てる
 */
// [TODO-OWNER: カルテの要約で禁止する表現の一覧（Claude Code の下書き）]
// → オーナー決定（2026-11-07、チャット、Issue #207）：「案は提出後、今の下書きは採る（推奨）」（ボードの AI の守り）
export const KARTE_FORBIDDEN_PATTERNS: readonly RegExp[] = [
  // 服薬の指示・助言
  /飲んで(?:ください|下さい|もらう|おく)|飲むべき|飲ませ|飲まないで|飲み続け|やめ(?:て|る|た方|るべき)|中止|中断して|続けて(?:ください|下さい)|増や|減ら|追加して|変更して/,
  // 量の指示（「〜錠に」「〜錠まで」「〜回にする」など、量を決める言い方）
  /[0-9０-９一二三四五六七八九十]+(?:錠|回|mg|ml|包|単位)(?:に(?:する|して|増|減)|まで(?:に|なら))/i,
  // 診断・推定・評価
  /診断|疑い|疑わ|可能性が(?:ある|あります|高い)|と思われ|でしょう|ではないか|ではないでしょうか|の(?:ようです|はず)だ|原因|副作用(?:です|だ|の可能性)/,
  // 安心させる判断・危ないかどうかの判断
  /大丈夫|問題(?:ない|ありません)|心配(?:ない|いらない|いりません)|安全|危険|危ない|重症|軽症|緊急|急いで/,
  // 受診・相談・確認の指示、推奨
  /受診|相談して|確認して(?:ください|下さい)|すべき|べきだ|べきです|必要があ|ほうがよ|方がよ|方が良|おすすめ|お勧め|推奨|しましょう|ください|下さい/,
  // 外への誘導
  /https?:|www\.|@/i,
];

const KATAKANA_RUN = /[ァ-ヺー]{2,}/gu;
const LATIN_RUN = /[A-Za-z]+/gu;
const DIGIT_RUN = /[0-9]+/gu;

/** text の中の数字・カタカナ（2文字以上）・英字の並びのうち、quote に無いもの */
export function termsNotInQuote(text: string, quote: string): string[] {
  const t = text.normalize("NFKC");
  const q = quote.normalize("NFKC");
  const terms = [...t.matchAll(KATAKANA_RUN), ...t.matchAll(LATIN_RUN), ...t.matchAll(DIGIT_RUN)].map((m) => m[0]);
  return terms.filter((term) => !q.includes(term));
}

/** quote が本人の発言のどれか1つに、文字どおり含まれるか（発言をまたいだ quote は根拠にしない） */
export function quoteFound(quote: string, utterances: readonly string[]): boolean {
  const q = quote.trim();
  if (q === "") return false;
  return utterances.some((u) => u.includes(q));
}

export function textForbidden(text: string): boolean {
  const normalized = text.normalize("NFKC").replace(/\s+/g, "");
  return KARTE_FORBIDDEN_PATTERNS.some((p) => p.test(normalized));
}

/**
 * 要約をコードで確かめ、指摘を返す。指摘が0件なら、コードで見られる範囲では問題が見つからなかった
 * （医学的な正しさや、意味が保たれているかは見ていない）
 */
export function checkSummary(summary: KarteSummary, utterances: readonly string[]): CodeFinding[] {
  const findings: CodeFinding[] = [];
  summary.items.forEach((item, itemIndex) => {
    const at = { itemIndex, aspect: item.aspect };
    const text = item.text.trim();
    const quote = item.quote.trim();
    if (text === "" || text.length > MAX_ITEM_TEXT_LENGTH || quote.length > MAX_QUOTE_LENGTH) {
      findings.push({ kind: "length", ...at });
    }
    if (quote.length < MIN_QUOTE_LENGTH) {
      findings.push({ kind: "quote_too_short", ...at });
    }
    // 会話にある quote は架空の見本の本人の言葉なので、禁止表現を当てない。会話に無い quote はモデルが作った文なので当てる
    const found = quote.length >= MIN_QUOTE_LENGTH && quoteFound(quote, utterances);
    if (quote.length >= MIN_QUOTE_LENGTH && !found) findings.push({ kind: "quote_not_found", ...at });
    if (termsNotInQuote(text, quote).length > 0) findings.push({ kind: "text_adds_terms", ...at });
    if (textForbidden(text) || (!found && textForbidden(quote))) findings.push({ kind: "forbidden", ...at });
  });
  const covered = new Set(summary.items.map((i) => i.aspect));
  const notCovered = new Set(summary.not_covered);
  for (const aspect of KARTE_ASPECTS) {
    if (covered.has(aspect) && notCovered.has(aspect)) findings.push({ kind: "aspect_conflict", itemIndex: null, aspect });
    if (!covered.has(aspect) && !notCovered.has(aspect)) findings.push({ kind: "aspect_missing", itemIndex: null, aspect });
  }
  return findings;
}

/** 禁止表現に当たった項目の text と quote を伏せた要約（画面に出す前に Workers で当てる） */
export const MASKED_TEXT = "（コードでの確認で止めた文）";
export function maskForbidden(summary: KarteSummary, findings: readonly CodeFinding[]): KarteSummary {
  const masked = new Set(findings.filter((f) => f.kind === "forbidden").map((f) => f.itemIndex));
  return {
    items: summary.items.map((item, i) => (masked.has(i) ? { ...item, text: MASKED_TEXT, quote: MASKED_TEXT } : item)),
    not_covered: [...summary.not_covered],
  };
}

/** 指摘の種類ごとの、画面に出す固定の文 */
// [TODO-OWNER: コードでの確認の指摘の文（Claude Code の下書き）]
// → オーナー決定（2026-11-07、チャット、Issue #207）：「案は提出後、今の下書きは採る（推奨）」（ボードの AI の守り）
export const CODE_FINDING_LABELS: Readonly<Record<CodeFinding["kind"], string>> = {
  quote_not_found: "根拠なし：引用が会話の本人の発言に見つかりません",
  quote_too_short: "根拠なし：引用が短すぎます",
  text_adds_terms: "引用に無い数字・名前があります",
  forbidden: "助言や診断に見える書き方です",
  length: "長さが上限を超えているか、空です",
  aspect_conflict: "同じ観点が「触れた」と「触れていない」の両方にあります",
  aspect_missing: "観点が要約のどこにもありません",
};
