// 1回のやり取り（/api/turn）の中身。Claude の出力を検査し、画面に返す形に整える（ADR-0015、ADR-0025）。

import {
  ALL_QUESTIONS,
  EVENTS,
  JUDGMENT_LABELS,
  SCENE_INTRO,
  SOURCE_OPTIONS,
  VIEWPOINT_LABELS,
  VIEWPOINT_SHORT_LABELS,
} from "../src/flow/content";
import {
  MAX_FIRST_HALF_ANSWERS,
  MAX_SECOND_HALF_ANSWERS,
  planGoals,
  questionIdsOf,
  type GoalPlan,
} from "../src/flow/rules";
import type { Half } from "../src/flow/types";
import {
  EMERGENCY_KINDS,
  JUDGMENT_VALUES,
  QUESTION_IDS,
  SOURCE_GUESS_IDS,
  VIEWPOINT_IDS,
  hasExactKeys,
  type TurnRequest,
  type TurnResponse,
} from "../src/flow/turnContract";
import type { Audit, AuditCategory, AuditResult } from "./audit";
import { promptTextProblem, remarkTextProblem, type RejectReason } from "./checks";
import type { CallClaude, ClaudeFailure, Usage } from "./claude";
import { REMARK_PHRASES, SYSTEM_PROMPT, buildUserMessage } from "./prompt";

export interface ClaudeOutput {
  emergency: TurnResponse["emergency"];
  viewpoints: TurnResponse["viewpoints"];
  next_type: "ask" | "clarify" | "redirect";
  /** Claude が選んだ次のゴール（固定の質問のID）。null は「この半分を終える」（Issue #200） */
  next_goal_id: string | null;
  text: string | null;
  /** 後半を終えるときの振り返りの一言（Issue #200）。それ以外は null */
  closing_remark: string | null;
  recall: boolean;
  source_guess: TurnResponse["source_guess"];
}

const NEXT_TYPES: ReadonlySet<string> = new Set(["ask", "clarify", "redirect"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Claude の出力の検査。構造化出力でも、形と値の範囲をここで確かめ直す（ADR-0015） */
export function parseClaudeOutput(value: unknown): ClaudeOutput | null {
  if (!isRecord(value)) return null;
  const keys = [
    "emergency",
    "viewpoints",
    "next_type",
    "next_goal_id",
    "text",
    "closing_remark",
    "recall",
    "source_guess",
  ];
  if (!hasExactKeys(value, keys)) return null;
  const { emergency, viewpoints, next_type, next_goal_id, text, closing_remark, recall, source_guess } = value;
  if (typeof emergency !== "string" || !EMERGENCY_KINDS.has(emergency)) return null;
  if (typeof recall !== "boolean") return null;
  if (!isRecord(viewpoints) || !hasExactKeys(viewpoints, VIEWPOINT_IDS)) return null;
  for (const v of VIEWPOINT_IDS) {
    const j = viewpoints[v];
    if (typeof j !== "string" || !JUDGMENT_VALUES.has(j)) return null;
  }
  if (typeof next_type !== "string" || !NEXT_TYPES.has(next_type)) return null;
  if (text !== null && typeof text !== "string") return null;
  if (next_goal_id !== null && (typeof next_goal_id !== "string" || !QUESTION_IDS.has(next_goal_id))) return null;
  if (closing_remark !== null && typeof closing_remark !== "string") return null;
  if (
    source_guess !== null &&
    (typeof source_guess !== "string" || !SOURCE_GUESS_IDS.has(source_guess))
  ) {
    return null;
  }
  return {
    emergency: emergency as ClaudeOutput["emergency"],
    viewpoints: viewpoints as ClaudeOutput["viewpoints"],
    next_type: next_type as ClaudeOutput["next_type"],
    next_goal_id,
    text,
    closing_remark,
    recall,
    source_guess: source_guess as ClaudeOutput["source_guess"],
  };
}

const QUESTION_TEXT = new Map(ALL_QUESTIONS.map((q) => [q.id, q.text]));
const QUESTION_EXAMPLES = new Map(ALL_QUESTIONS.flatMap((q) => (q.examples === undefined ? [] : [[q.id, q.examples] as const])));

/** 文に含まれてよいアプリの固定の言葉（情報源の分類、出来事）。利用者が同じ言葉を使っても繰り返しとみなさない */
export const ALLOWED_VOCABULARY: readonly string[] = [
  ...ALL_QUESTIONS.map((q) => q.text),
  // 聞き返しで添えてよい例（Issue #110）は、ここには入れない。聞き返しのときに、いまの質問の例だけを chooseNext で許す
  ...SOURCE_OPTIONS.flatMap((o) => [o.label, o.description]),
  ...Object.values(EVENTS).flatMap((e) => [e.text, e.unavailable ?? ""]),
  SCENE_INTRO,
];

/**
 * 振り返りの一言で使ってよい言葉（Issue #200 の案A）。5つの観点の名前と判定の名前だけ。
 * 繰り返しの検査（checks.ts の repeatsUserWords）は緩めず、この言葉を「固定の文」として許すだけにする
 */
export const REMARK_VOCABULARY: readonly string[] = [
  ...Object.values(VIEWPOINT_LABELS),
  ...Object.values(VIEWPOINT_SHORT_LABELS),
  ...Object.values(JUDGMENT_LABELS),
];

/** 監査役に、振り返りの一言の役目として渡す固定の文（利用者の回答は含まない。ADR-0030 の2） */
export const REMARK_PURPOSE =
  "（振り返りの一言）訓練の最後に、5つの観点の名前と決まった言い回しを使って、話せたことと、まだ考える余地があることを短く伝える文。利用者が挙げた情報源・手段・人の続柄には触れてよいが、薬・病気・人の名前などの医療的な中身や個人の情報には触れない";

/** その半分の、回数に数える回答の質問ID（いま答えたものを含む） */
function askedIn(request: TurnRequest, half: Half): string[] {
  return request.inputs.filter((i) => i.half === half).map((i) => i.question_id);
}

/** いま答えた半分の、次に聞いてよいゴール（rules.ts の planGoals。画面と同じ関数） */
export function planFor(request: TurnRequest): GoalPlan {
  const half = request.inputs[request.inputs.length - 1].half;
  return planGoals(askedIn(request, half), half, request.event);
}

/**
 * 画面が送ってきた「固定の順番での次の質問」と「聞き返してよいか」が、ゴールの決まりと回数の上限に合っているか。
 * 回答の質問IDは、その半分で聞いてよい質問だけ。合わない問い合わせ（作り替えた、古い）は拒否する（ADR-0028 の12、Issue #200）
 */
export function followsGoalRules(request: TurnRequest): boolean {
  const last = request.inputs[request.inputs.length - 1];
  const half = last.half;
  if (half === "second" && request.event === null) return false;
  for (const h of ["first", "second"] as const) {
    const ids = questionIdsOf(h, request.event);
    if (request.inputs.some((i) => i.half === h && !ids.includes(i.question_id))) return false;
  }
  // 後半の入力の後に前半の入力は来ない
  const firstSecond = request.inputs.findIndex((i) => i.half === "second");
  if (firstSecond !== -1 && request.inputs.slice(firstSecond).some((i) => i.half === "first")) return false;
  const counted = askedIn(request, half).length;
  const max = half === "first" ? MAX_FIRST_HALF_ANSWERS : MAX_SECOND_HALF_ANSWERS;
  if (counted > max) return false;
  return request.next_question_id === planFor(request).fallback && request.allow_clarify === counted < max;
}

/** Claude の選んだゴールを使わなかった理由（本文を含まないので、ログに出してよい。Issue #200） */
export type GoalOverride = "goal_not_allowed" | "finish_not_allowed" | "half_over";

/**
 * 次の手を決める。ask のときは、Claude が選んだゴール（next_goal_id）が今選んでよいもの（planGoals の choices）なら使い、
 * そうでなければ固定の順番の次の質問に戻して、Claude の文は使わない（Issue #200、ADR-0025 の B、ADR-0012）。
 * 「この半分を終える」（next_goal_id が null）は、必ず聞くゴールが残っていないときだけ受け付ける。
 * 許していない聞き返し・質問し直しは「次へ進む」に直し、そのときは Claude の文を使わない。
 * 半分を終えるときの文は、受け止めの一言として同じ検査を通す（ADR-0029 の2）。
 * rejected は、Claude の文を検査で捨てた理由（捨てなければ null）。overridden は、ゴールを使わなかった理由
 */
export function chooseNext(
  request: TurnRequest,
  output: ClaudeOutput,
): { next: TurnResponse["next"]; rejected: RejectReason | null; overridden: GoalOverride | null } {
  const current = request.inputs[request.inputs.length - 1].question_id;
  const plan = planFor(request);
  let type: TurnResponse["next"]["type"] = output.next_type;
  let text = output.text;
  let questionId: string | null = current;
  let overridden: GoalOverride | null = null;
  if ((type === "clarify" && !request.allow_clarify) || (type === "redirect" && !request.allow_redirect)) {
    type = "ask";
    text = null;
  }
  if (type === "ask") {
    const goal = output.next_goal_id;
    const halfOver = plan.choices.length === 0;
    if (goal === null && (plan.canFinish || halfOver)) {
      type = "finish";
      questionId = null;
    } else if (goal !== null && plan.choices.includes(goal)) {
      questionId = goal;
    } else {
      overridden = goal === null ? "finish_not_allowed" : halfOver ? "half_over" : "goal_not_allowed";
      text = null;
      questionId = plan.fallback;
      if (questionId === null) type = "finish";
    }
  }

  const rejected =
    text === null
      ? null
      : promptTextProblem(text, {
          userTexts: request.inputs.map((i) => i.text),
          // 直前の回答の言葉は、そのまま復唱してよい（2026-11-07 のオーナーの答え。親のセッション経由）。
          // 薬についての問いへの回答だけ（同日、オーナーの指摘「スマホのアプリですね」は微妙）
          lastAnswer: echoableAnswer(request),
          allowed: [
            QUESTION_TEXT.get(current) ?? "",
            questionId === null ? "" : QUESTION_TEXT.get(questionId) ?? "",
            // 例は聞き返しのときだけ、いまの質問のものだけを許す（Issue #110）
            type === "clarify" ? QUESTION_EXAMPLES.get(current) ?? "" : "",
            ...ALLOWED_VOCABULARY,
          ],
        });
  return {
    next: { type, question_id: questionId, text: rejected === null ? text : null },
    rejected,
    overridden,
  };
}

export function decideNext(request: TurnRequest, output: ClaudeOutput): TurnResponse["next"] {
  return chooseNext(request, output).next;
}

/**
 * 振り返りの一言の検査（Issue #200 の案B）。後半を終えるときだけ受け付け、一言用の検査（checks.ts の remarkTextProblem）を通す
 */
export function checkRemark(
  request: TurnRequest,
  next: TurnResponse["next"],
  remark: string | null,
): { remark: string | null; rejected: RejectReason | null } {
  const half = request.inputs[request.inputs.length - 1].half;
  if (remark === null || next.type !== "finish" || half !== "second") return { remark: null, rejected: null };
  // 案B（2026-11-07 オーナー「B を作る」）：一言用の検査。利用者が挙げた情報源・手段・人（続柄）の言葉に触れてよいので、
  // 繰り返しの照合は外し、固定の文（情報源の分類・質問文・出来事）の言葉も許す。監査役は必ず通す（runTurn）
  const rejected = remarkTextProblem(remark, [...REMARK_VOCABULARY, ...REMARK_PHRASES, ...ALLOWED_VOCABULARY]);
  return { remark: rejected === null ? remark : null, rejected };
}

/** 文を捨てた理由。正規表現の検査（checks.ts）か、監査役（audit.ts、ADR-0030）。本文を含まないのでログに出してよい */
export type TextRejectReason = RejectReason | `audit_${AuditCategory}`;

/** 監査役の呼び出しの結果。比較実験の見出しとログに使う（本文を含まない） */
export interface AuditReport {
  ms: number;
  pass: boolean | null;
  category: AuditCategory | null;
  failure: Extract<AuditResult, { ok: false }>["failure"] | null;
  usage: Usage | null;
  servedBy: string | null;
}

export type TurnOutcome =
  | {
      ok: true;
      response: TurnResponse;
      raw: string;
      servedBy: string;
      usage: Usage;
      /** Claude が作った文（検査の前）。比較実験で、捨てられた文を数えるために使う */
      claudeText: string | null;
      textRejected: boolean;
      /** 文を捨てた理由（ADR-0029 の1、ADR-0030）。捨てなければ null。監査役の失敗では null（audit.failure を見る） */
      rejectReason: TextRejectReason | null;
      /** 監査役を呼んだときの結果。呼ばなかったとき（文が無い、正規表現の検査で捨てた、緊急、監査役を使わない）は null */
      audit: AuditReport | null;
      /** Claude の選んだゴールを使わず、固定の順番に戻した理由（Issue #200）。使ったときは null */
      goalOverride: GoalOverride | null;
      /** 振り返りの一言を捨てた理由（Issue #200）。捨てなければ・一言が無ければ null */
      remarkRejectReason: TextRejectReason | null;
      /** 振り返りの一言を監査役に送ったときの結果 */
      remarkAudit: AuditReport | null;
    }
  | { ok: false; failure: ClaudeFailure | "invalid_output" };

/**
 * 監査役に渡す固定の質問文。Claude の文が言い直している質問にする（監査役の比較実験と同じ渡し方）。
 * 次の質問へ進むときは次の質問、聞き返し・質問し直し・半分の最後の受け止めは、いま答えた質問。
 * 聞き返しのときは、添えてよい例（Issue #110）も書き添える。例は固定の言葉で、利用者の回答は含まない
 */
export function auditedQuestion(request: TurnRequest, next: TurnResponse["next"]): string {
  const current = request.inputs[request.inputs.length - 1].question_id;
  const id = next.type === "ask" && next.question_id !== null ? next.question_id : current;
  const text = QUESTION_TEXT.get(id) ?? "";
  const examples = next.type === "clarify" ? QUESTION_EXAMPLES.get(id) : undefined;
  return examples === undefined ? text : `${text}（聞き返しで添えてよい例：${examples}）`;
}

/** 復唱してよい回答の問い：薬についての問い（2026-11-07。情報源・手段・人・記録の答えは復唱しない） */
export const ECHO_QUESTION_IDS: ReadonlySet<string> = new Set([
  "first_medicines",
  "first_medicines_more",
  "first_other",
  "first_unrecorded",
]);

/** 復唱してよい直前の回答。薬についての問いへの回答でなければ undefined */
export function echoableAnswer(request: TurnRequest): string | undefined {
  const last = request.inputs[request.inputs.length - 1];
  return last !== undefined && ECHO_QUESTION_IDS.has(last.question_id) ? last.text : undefined;
}

/**
 * 1回のやり取り。Claude の出力を検査し、正規表現の検査を通った文だけを監査役に確かめさせる（ADR-0030）。
 * 監査役が止めたとき・失敗したときは、その文だけを捨てて固定文に戻す（判定と次の手はそのまま使う）。
 * audit が null のときは監査役を呼ばない（試験と、開発中の比較実験の「監査役なし」）
 */
export async function runTurn(
  request: TurnRequest,
  callClaude: CallClaude,
  audit: Audit | null = null,
): Promise<TurnOutcome> {
  const result = await callClaude(SYSTEM_PROMPT, buildUserMessage(request));
  if (!result.ok) return { ok: false, failure: result.failure };
  const output = parseClaudeOutput(result.value);
  if (output === null) return { ok: false, failure: "invalid_output" };
  const chosen = chooseNext(request, output);
  let next = chosen.next;
  let rejectReason: TextRejectReason | null = chosen.rejected;
  let report: AuditReport | null = null;
  const remarkChecked = checkRemark(request, next, output.closing_remark);
  let remark = remarkChecked.remark;
  let remarkRejectReason: TextRejectReason | null = remarkChecked.rejected;
  let remarkReport: AuditReport | null = null;

  // 緊急（症状・自傷）のときは、画面は文を使わずに中断の案内を出す（ADR-0011）。監査役を待たせず、すぐ返す
  // 体調の訴えでは、画面は確かめの問いの後に、この返事で続けることがある（ADR-0011 の追記）。
  // 監査役を通していない文を出さないよう、文も捨てて固定文にする
  if (output.emergency !== "none") {
    remark = null;
    next = { ...next, text: null };
  } else if (audit !== null) {
    // 質問の文と振り返りの一言は、別々に監査役へ送り、並べて待つ（待ち時間を延ばさない）
    const [textAudit, remarkAudit] = await Promise.all([
      next.text === null ? null : timedAudit(audit, next.text, auditedQuestion(request, next)),
      remark === null ? null : timedAudit(audit, remark, REMARK_PURPOSE),
    ]);
    if (textAudit !== null) {
      report = textAudit;
      if (textAudit.pass !== true) {
        next = { ...next, text: null };
        if (textAudit.pass === false) rejectReason = `audit_${textAudit.category ?? "other"}`;
      }
    }
    if (remarkAudit !== null) {
      remarkReport = remarkAudit;
      if (remarkAudit.pass !== true) {
        remark = null;
        if (remarkAudit.pass === false) remarkRejectReason = `audit_${remarkAudit.category ?? "other"}`;
      }
    }
  }

  return {
    ok: true,
    raw: result.raw,
    servedBy: result.servedBy,
    usage: result.usage,
    claudeText: output.text,
    textRejected: output.text !== null && next.text === null,
    rejectReason,
    audit: report,
    goalOverride: chosen.overridden,
    remarkRejectReason,
    remarkAudit: remarkReport,
    response: {
      emergency: output.emergency,
      viewpoints: output.viewpoints,
      next,
      recall: output.recall,
      source_guess: output.source_guess,
      remark,
    },
  };
}

/**
 * 監査役を1回呼び、結果を見出しの形にする。監査役が答えられなかったときは pass を null にし、
 * 呼び出し側は確かめられなかった文として捨てる（安全な側に倒す。ADR-0030 の3）
 */
async function timedAudit(audit: Audit, text: string, fixedQuestion: string): Promise<AuditReport> {
  const started = Date.now();
  const verdict = await audit(text, fixedQuestion);
  const ms = Date.now() - started;
  return verdict.ok
    ? { ms, pass: verdict.pass, category: verdict.category, failure: null, usage: verdict.usage, servedBy: verdict.servedBy }
    : { ms, pass: null, category: null, failure: verdict.failure, usage: null, servedBy: null };
}
