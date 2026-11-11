// 固定の質問文と、聞き返しのときだけ添えてよい例の引き当て（Issue #292）。
// prompt.ts（Claude に見せる文）と turn.ts（検査で許す文・監査役に渡す文）で、同じものを使う。

import { ALL_QUESTIONS } from "../src/flow/content";

/** 質問ID → 固定の質問文 */
export const QUESTION_TEXT: ReadonlyMap<string, string> = new Map(ALL_QUESTIONS.map((q) => [q.id, q.text]));

/** 質問ID → 聞き返しのときだけ添えてよい例（Issue #110）。例の無い質問は入れない */
export const QUESTION_EXAMPLES: ReadonlyMap<string, string> = new Map(
  ALL_QUESTIONS.flatMap((q) => (q.examples === undefined ? [] : [[q.id, q.examples] as const])),
);
