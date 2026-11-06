// 振り返りの「救護所に渡す記録の形」（Issue #97、ADR-0042）。
// 固定の質問ごとの回答を、記録の項目に並べるだけ。回答は原文のまま（ADR-0009）で、要約・言い換え・補いをしない。
// Claude は使わない。質問 ID と項目の対応は固定で、ここにだけ持つ。

import type { Answer } from "./types";

export interface RecordItem {
  id: string;
  /** 項目の名前。薬の中身は架空で答えているので「（架空）」を添える（ADR-0022） */
  label: string;
  /** この項目に対応する固定の質問の ID。聞き返しの後の回答も同じ ID で入る */
  questionIds: readonly string[];
}

// [TODO-OWNER: 記録の項目の名前と、質問との対応（Claude Code の下書き）]
export const RECORD_ITEMS: readonly RecordItem[] = [
  // Issue #200：「ほかには？」の掘り下げの回答も、同じ項目に順に並べる
  { id: "medicines", label: "薬の名前・量・何の薬か（架空）", questionIds: ["first_medicines", "first_medicines_more"] },
  { id: "location", label: "記録の在りか（何を見れば確かめられるか）", questionIds: ["first_location"] },
  { id: "other", label: "ほかの薬・市販薬・サプリ（架空）", questionIds: ["first_other"] },
  // Issue #110：アレルギー・合わなかった薬は first_unrecorded で聞く
  { id: "unrecorded", label: "アレルギー・合わなかった薬など、記録に載っていないこと（架空）", questionIds: ["first_unrecorded"] },
  { id: "alternative", label: "ほかの伝え方", questionIds: ["second_recovery", "second_handover"] },
  { id: "current", label: "最近の変化と、記録に載っているか（変化は架空）", questionIds: ["second_recent", "second_recent_other"] },
  { id: "proxy", label: "代わりに伝えられる人（続柄・連絡の手段）", questionIds: ["second_proxy", "second_proxy_other"] },
  { id: "recheck", label: "思い出せなかったこと・あとで確かめるもの", questionIds: ["second_recheck"] },
];

export const RECORD_TITLE = "救護所に渡す記録の形";
export const RECORD_NOTE =
  "あなたの回答を、救護所の聞き取りの項目に並べたものです。文はそのままで、要約や言い換えはしていません。薬の中身は架空の内容なので、実際の記録ではありません。この画面を閉じると消えます。";
export const RECORD_EMPTY = "（回答なし）";

export interface RecordRow {
  id: string;
  label: string;
  /** 原文のまま。同じ項目に複数の回答があれば（聞き返しの後など）、入力した順に並べる。無ければ空 */
  values: readonly string[];
}

/** 回答（関係のない話として受け止めたものは除く）を項目に並べる。文は書き換えない */
export function recordRows(answers: readonly Answer[]): RecordRow[] {
  return RECORD_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    values: answers
      .filter((a) => a.kind === "answer" && item.questionIds.includes(a.questionId))
      .map((a) => a.text),
  }));
}
