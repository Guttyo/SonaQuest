// 進行のうち、Claudeを使わずに決める部分（docs/architecture.md）。画面から切り離した純粋な関数にする。

import {
  FIRST_HALF_QUESTIONS,
  HANDOVER_QUESTION,
  MEDICINES_FOLLOWUP_QUESTION,
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
  Half,
  Judgment,
  Judgments,
  PrepActionId,
  Question,
  SourceId,
  ViewpointId,
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
 * 選ばなかったとき（null）は「係がソナからクエに交代する」出来事にする。
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

/**
 * 前半で「ほかには？」の掘り下げ（MEDICINES_FOLLOWUP_QUESTION）を出してよい回数（Issue #200）。
 * 掘り下げへの聞き返しの回答も数える（数えすぎる側。回答の上限は別に守られる）
 */
// [TODO-OWNER: 掘り下げの上限（Claude Code の下書き：前半で2回まで。content.ts の MEDICINES_FOLLOWUP_QUESTION のマーカーと同じ判断）]
// → オーナー決定（2026-11-07、チャット）：「2回まで」。
export const FOLLOWUP_LIMIT = 2;

/** 聞き取りのゴールに向かって、次に何を聞いてよいか（Issue #200、ADR-0025 の B） */
export interface GoalPlan {
  /** Claude が次の質問（ゴール）として選んでよい質問ID */
  choices: string[];
  /** 固定の順番での次の質問。Claude の選んだゴールが使えないとき・Claude を使わないときに出す。半分の終わりは null */
  fallback: string | null;
  /** この半分を終えてよいか（まだ聞いていない、必ず聞くゴールが無い） */
  canFinish: boolean;
}

/**
 * その半分で、次に聞いてよい質問を決める。ブラウザと Workers の両方がこの関数を使い、同じ答えを出す（ADR-0028 の2・12）。
 * asked は、その半分で回数に数える回答の質問IDを順に並べたもの（いま答えたものを含む。質問し直した入力は除く）。
 *
 * - 前半の必ず聞くゴール：今の薬（1問目、固定）、情報の在りか、ほかの薬、合わなかった薬・アレルギー。
 *   掘り下げ（ほかには？）は、1問目の後に FOLLOWUP_LIMIT 回まで。
 *   前半は、必ず聞くゴールをすべて聞くまで終えない。終えると③確認から④出来事へ進む（出来事を起こす時点。
 *   情報の在りかは必ずその前に聞いている）
 * - 後半の必ず聞くゴール：立て直し（最初、固定）、記録の新しさ、代わりに伝えられる人。思い出せなかったことの問いは、
 *   残りの回数に余裕があるときだけ選べる（固定の進行では今までどおり最後に出す）
 * - 必ず聞くゴールが残りの回数で聞ききれなくなるときは、掘り下げなどの選べるゴールを出さない
 * - 固定の順番（fallback）は、今までの固定の質問の順番の、まだ聞いていない最初のもの。Claude を使わない進行は今までと同じになる
 */
export function planGoals(asked: readonly string[], half: Half, event: EventId | null): GoalPlan {
  const max = half === "first" ? MAX_FIRST_HALF_ANSWERS : MAX_SECOND_HALF_ANSWERS;
  const remaining = max - asked.length;
  if (remaining <= 0) return { choices: [], fallback: null, canFinish: true };
  const done = new Set(asked);
  const order = (half === "first" ? firstHalfQuestions() : secondHalfQuestions(event ?? "handover")).map((q) => q.id);
  const fallback = order.find((id) => !done.has(id)) ?? null;
  const required = (half === "first" ? order : order.filter((id) => id !== RECHECK_QUESTION.id)).filter(
    (id) => !done.has(id),
  );
  const optional: string[] = [];
  if (half === "first") {
    const followups = asked.filter((id) => id === MEDICINES_FOLLOWUP_QUESTION.id).length;
    if (done.has(FIRST_HALF_QUESTIONS[0].id) && followups < FOLLOWUP_LIMIT) optional.push(MEDICINES_FOLLOWUP_QUESTION.id);
  } else if (!done.has(RECHECK_QUESTION.id)) {
    optional.push(RECHECK_QUESTION.id);
  }
  const slack = remaining - required.length;
  return {
    choices: [...required, ...(slack > 0 ? optional : [])],
    fallback,
    canFinish: required.length === 0,
  };
}

/** その半分で聞いてよい質問ID（固定の質問と、前半の掘り下げ）。Workers が問い合わせを確かめるのに使う */
export function questionIdsOf(half: Half, event: EventId | null): readonly string[] {
  return half === "first"
    ? [...firstHalfQuestions().map((q) => q.id), MEDICINES_FOLLOWUP_QUESTION.id]
    : secondHalfQuestions(event ?? "handover").map((q) => q.id);
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

/** 振り返りの先頭の「まだ弱いところ → 次の一手」1件（ADR-0054） */
export interface NextStep {
  viewpoint: ViewpointId;
  judgment: Judgment;
  /** その観点に関係する準備行動のうち、規則で選んだ1つ */
  action: PrepActionId;
}

/**
 * 手薄な観点ごとに、次の一手（準備行動）を1つ選ぶ（ADR-0054）。固定の表と規則だけで、Claude は使わない。
 * 並びは「確認していない」を先に、次に「未確認と気づいた」。同じ判定の中は VIEWPOINT_ORDER の順。
 * 準備行動は PREP_ACTIONS の順で、その観点に関係する最初のもの。別の観点で既に選んだものはなるべく避け、
 * 避けられないときは重なってもよい（同じ行動が2つの観点を強くすることはある）。
 * 「判定できませんでした」は手薄として扱わないので、すべて undetermined の回は空になる
 */
export function nextSteps(judgments: Judgments): NextStep[] {
  const weak = VIEWPOINT_ORDER.filter((v) => isWeak(judgments[v]));
  const ordered = [
    ...weak.filter((v) => judgments[v] === "not_mentioned"),
    ...weak.filter((v) => judgments[v] === "aware_unconfirmed"),
  ];
  const used = new Set<PrepActionId>();
  return ordered.map((viewpoint) => {
    const related = PREP_ACTIONS.filter((a) => a.viewpoints.includes(viewpoint));
    const pick = related.find((a) => !used.has(a.id)) ?? related[0];
    used.add(pick.id);
    return { viewpoint, judgment: judgments[viewpoint], action: pick.id };
  });
}
