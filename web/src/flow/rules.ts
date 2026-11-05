// 進行のうち、Claudeを使わずに決める部分（docs/architecture.md）。画面から切り離した純粋な関数にする。

import {
  FIRST_HALF_QUESTIONS,
  HANDOVER_QUESTION,
  PREP_ACTIONS,
  PREP_SOURCES,
  PROXY_QUESTION,
  PUBLIC_SOURCES,
  type PublicSourceId,
  PROXY_QUESTION_AFTER_FAMILY,
  RECENT_QUESTION,
  RECHECK_QUESTION,
  RECOVERY_QUESTION,
  VIEWPOINT_ORDER,
} from "./content";
import type {
  EventId,
  Judgment,
  Judgments,
  PrepActionId,
  Question,
  SourceId,
} from "./types";

/**
 * 前半・後半それぞれの回答の上限と、合計の上限（ADR-0019。Issue #41 で 3＋3 から 5＋5 にした）。
 * 固定の質問は半分ごとに4問で、残りの1回は聞き返しの余裕
 */
export const MAX_FIRST_HALF_ANSWERS = 5;
export const MAX_SECOND_HALF_ANSWERS = 5;
export const MAX_ANSWERS = MAX_FIRST_HALF_ANSWERS + MAX_SECOND_HALF_ANSWERS;

/** 1回の回答の文字数の上限。超える入力は受け付けない（切り詰めると原文でなくなるため） */
export const MAX_ANSWER_LENGTH = 500;

const EVENT_BY_SOURCE: Record<SourceId, EventId> = {
  smartphone: "battery",
  online: "network",
  notebook: "notebook_home",
  family: "family_unreachable",
  clinic: "clinic_unreachable",
  none: "handover",
};

/**
 * ③確認で本人が選んだ情報源から出来事を選ぶ（ADR-0016）。
 * 選ばなかったとき（null）は「係の人が交代する」出来事にする。
 */
export function selectEvent(source: SourceId | null): EventId {
  return source === null ? "handover" : EVENT_BY_SOURCE[source];
}

export function firstHalfQuestions(): readonly Question[] {
  return FIRST_HALF_QUESTIONS.slice(0, MAX_FIRST_HALF_ANSWERS);
}

/**
 * 後半の質問。最初は立て直しの問い（係の交代のときは交代用の問い）。最後は思い出せなかったことの問い（Issue #41）。
 * 出来事で答えが決まってしまう問いは、出来事に合わせて言い方を変える（家族と連絡がつかない → 家族のほかの人）
 */
export function secondHalfQuestions(event: EventId): readonly Question[] {
  const opening = event === "handover" ? HANDOVER_QUESTION : RECOVERY_QUESTION;
  const proxy =
    event === "family_unreachable" ? PROXY_QUESTION_AFTER_FAMILY : PROXY_QUESTION;
  return [opening, RECENT_QUESTION, proxy, RECHECK_QUESTION].slice(0, MAX_SECOND_HALF_ANSWERS);
}

export function isAcceptableAnswer(text: string): boolean {
  return text.trim().length > 0 && text.length <= MAX_ANSWER_LENGTH;
}

/** Claudeを使わない経路では、すべての観点を「判定できませんでした」にする（ADR-0012） */
export function undeterminedJudgments(): Judgments {
  return Object.fromEntries(
    VIEWPOINT_ORDER.map((v) => [v, "undetermined" satisfies Judgment]),
  ) as Judgments;
}

/** 手薄なところ：「確認していない」「未確認と気づいた」の観点 */
export function isWeak(judgment: Judgment): boolean {
  return judgment === "not_mentioned" || judgment === "aware_unconfirmed";
}

/**
 * 準備行動の並び順。手薄な観点に関係する行動を上に並べ、それ以外は元の順を保つ。
 * 「判定できませんでした」は手薄として扱わない（推測で補わない）。
 */
export function orderPrepActions(judgments: Judgments): PrepActionId[] {
  const weak = PREP_ACTIONS.filter((a) =>
    a.viewpoints.some((v) => isWeak(judgments[v])),
  );
  const rest = PREP_ACTIONS.filter((a) => !weak.includes(a));
  return [...weak, ...rest].map((a) => a.id);
}

/** 振り返りに出す公的資料1件（A-06） */
export type PublicSource = (typeof PUBLIC_SOURCES)[PublicSourceId];

/**
 * 準備行動に関係する公的資料のうち、確認済み（verified）のものだけを返す（A-06、ADR-0044）。
 * 未確認のものは、対応に書いてあっても返さない。試験のために、対応と資料の一覧を差し替えられる
 */
export function verifiedSourcesFor(
  action: PrepActionId,
  sources: Readonly<Record<string, PublicSource>> = PUBLIC_SOURCES,
  links: Readonly<Record<PrepActionId, readonly string[]>> = PREP_SOURCES,
): PublicSource[] {
  return links[action]
    .map((id) => sources[id])
    .filter((s): s is PublicSource => s !== undefined && s.verified);
}
