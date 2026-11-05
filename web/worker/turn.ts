// 1回のやり取り（/api/turn）の中身。Claude の出力を検査し、画面に返す形に整える（ADR-0015、ADR-0025）。

import { ALL_QUESTIONS, EVENTS, SCENE_INTRO, SOURCE_OPTIONS } from "../src/flow/content";
import {
  MAX_FIRST_HALF_ANSWERS,
  MAX_SECOND_HALF_ANSWERS,
  firstHalfQuestions,
  secondHalfQuestions,
} from "../src/flow/rules";
import {
  EMERGENCY_KINDS,
  JUDGMENT_VALUES,
  SOURCE_GUESS_IDS,
  VIEWPOINT_IDS,
  hasExactKeys,
  type TurnRequest,
  type TurnResponse,
} from "../src/flow/turnContract";
import type { Audit, AuditCategory, AuditResult } from "./audit";
import { promptTextProblem, type RejectReason } from "./checks";
import type { CallClaude, ClaudeFailure, Usage } from "./claude";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";

interface ClaudeOutput {
  emergency: TurnResponse["emergency"];
  viewpoints: TurnResponse["viewpoints"];
  next_type: "ask" | "clarify" | "redirect";
  text: string | null;
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
  const keys = ["emergency", "viewpoints", "next_type", "text", "recall", "source_guess"];
  if (!hasExactKeys(value, keys)) return null;
  const { emergency, viewpoints, next_type, text, recall, source_guess } = value;
  if (typeof emergency !== "string" || !EMERGENCY_KINDS.has(emergency)) return null;
  if (typeof recall !== "boolean") return null;
  if (!isRecord(viewpoints) || !hasExactKeys(viewpoints, VIEWPOINT_IDS)) return null;
  for (const v of VIEWPOINT_IDS) {
    const j = viewpoints[v];
    if (typeof j !== "string" || !JUDGMENT_VALUES.has(j)) return null;
  }
  if (typeof next_type !== "string" || !NEXT_TYPES.has(next_type)) return null;
  if (text !== null && typeof text !== "string") return null;
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
    text,
    recall,
    source_guess: source_guess as ClaudeOutput["source_guess"],
  };
}

const QUESTION_TEXT = new Map(ALL_QUESTIONS.map((q) => [q.id, q.text]));
const QUESTION_EXAMPLES = new Map(ALL_QUESTIONS.flatMap((q) => (q.examples === undefined ? [] : [[q.id, q.examples] as const])));

/** 文に含まれてよいアプリの固定の言葉（情報源の分類、出来事）。利用者が同じ言葉を使っても繰り返しとみなさない */
export const ALLOWED_VOCABULARY: readonly string[] = [
  ...ALL_QUESTIONS.map((q) => q.text),
  // 聞き返しで添えてよい例（Issue #110）
  ...ALL_QUESTIONS.map((q) => q.examples ?? ""),
  ...SOURCE_OPTIONS.flatMap((o) => [o.label, o.description]),
  ...Object.values(EVENTS).flatMap((e) => [e.text, e.unavailable ?? ""]),
  SCENE_INTRO,
];

/**
 * 画面が送ってきた「次の質問」と「聞き返してよいか」が、固定の順番と回数の上限に合っているか。
 * 合わない問い合わせ（作り替えた、古い）は拒否する（ADR-0025 の A、ADR-0028）
 */
export function followsFixedOrder(request: TurnRequest): boolean {
  const last = request.inputs[request.inputs.length - 1];
  const half = last.half;
  if (half === "second" && request.event === null) return false;
  const ids = (half === "first" ? firstHalfQuestions() : secondHalfQuestions(request.event ?? "handover")).map(
    (q) => q.id,
  );
  const index = ids.indexOf(last.question_id);
  if (index === -1) return false;
  const counted = request.inputs.filter((i) => i.half === half).length;
  const max = half === "first" ? MAX_FIRST_HALF_ANSWERS : MAX_SECOND_HALF_ANSWERS;
  if (counted > max) return false;
  const expectedNext = counted < max && index + 1 < ids.length ? ids[index + 1] : null;
  return request.next_question_id === expectedNext && request.allow_clarify === counted < max;
}

/**
 * 次の手を決める。質問IDは Claude に選ばせず、固定の順番から決める（ADR-0025 の A）。
 * 許していない聞き返し・質問し直しは「次へ進む」に直し、そのときは Claude の文を使わない。
 * 半分の最後（次の固定の質問が無い）は finish にし、文は受け止めの一言として同じ検査を通す（ADR-0029 の2）。
 * rejected は、Claude の文を検査で捨てた理由（捨てなければ null）
 */
export function chooseNext(
  request: TurnRequest,
  output: ClaudeOutput,
): { next: TurnResponse["next"]; rejected: RejectReason | null } {
  const current = request.inputs[request.inputs.length - 1].question_id;
  let type: TurnResponse["next"]["type"] = output.next_type;
  let text = output.text;
  if ((type === "clarify" && !request.allow_clarify) || (type === "redirect" && !request.allow_redirect)) {
    type = "ask";
    text = null;
  }
  if (type === "ask" && request.next_question_id === null) type = "finish";
  const questionId =
    type === "finish" ? null : type === "ask" ? (request.next_question_id as string) : current;

  const rejected =
    text === null
      ? null
      : promptTextProblem(text, {
          userTexts: request.inputs.map((i) => i.text),
          allowed: [
            QUESTION_TEXT.get(current) ?? "",
            questionId === null ? "" : QUESTION_TEXT.get(questionId) ?? "",
            ...ALLOWED_VOCABULARY,
          ],
        });
  return {
    next: { type, question_id: questionId, text: rejected === null ? text : null },
    rejected,
  };
}

export function decideNext(request: TurnRequest, output: ClaudeOutput): TurnResponse["next"] {
  return chooseNext(request, output).next;
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

  // 緊急（症状・自傷）のときは、画面は文を使わずに中断の案内を出す（ADR-0011）。監査役を待たせず、すぐ返す
  if (next.text !== null && audit !== null && output.emergency === "none") {
    const started = Date.now();
    const verdict = await audit(next.text, auditedQuestion(request, next));
    const ms = Date.now() - started;
    if (verdict.ok) {
      report = {
        ms,
        pass: verdict.pass,
        category: verdict.category,
        failure: null,
        usage: verdict.usage,
        servedBy: verdict.servedBy,
      };
      if (!verdict.pass) {
        next = { ...next, text: null };
        rejectReason = `audit_${verdict.category ?? "other"}`;
      }
    } else {
      // 監査役が答えられなかったときは、確かめられなかった文として捨てる（安全な側に倒す）
      report = { ms, pass: null, category: null, failure: verdict.failure, usage: null, servedBy: null };
      next = { ...next, text: null };
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
    response: {
      emergency: output.emergency,
      viewpoints: output.viewpoints,
      next,
      recall: output.recall,
      source_guess: output.source_guess,
    },
  };
}
