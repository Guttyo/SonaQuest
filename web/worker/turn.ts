// 1回のやり取り（/api/turn）の中身。Claude の出力を検査し、画面に返す形に整える（ADR-0015、ADR-0025）。

import { ALL_QUESTIONS, EVENTS, SCENE_INTRO, SOURCE_OPTIONS } from "../src/flow/content";
import {
  EMERGENCY_KINDS,
  JUDGMENT_VALUES,
  SOURCE_GUESS_IDS,
  VIEWPOINT_IDS,
  hasExactKeys,
  type TurnRequest,
  type TurnResponse,
} from "../src/flow/turnContract";
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

/** 文に含まれてよいアプリの固定の言葉（情報源の分類、出来事）。利用者が同じ言葉を使っても繰り返しとみなさない */
export const ALLOWED_VOCABULARY: readonly string[] = [
  ...ALL_QUESTIONS.map((q) => q.text),
  ...SOURCE_OPTIONS.flatMap((o) => [o.label, o.description]),
  ...Object.values(EVENTS).flatMap((e) => [e.text, e.unavailable ?? ""]),
  SCENE_INTRO,
];

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
      /** 文を捨てた理由（ADR-0029 の1）。捨てなければ null */
      rejectReason: RejectReason | null;
    }
  | { ok: false; failure: ClaudeFailure | "invalid_output" };

export async function runTurn(request: TurnRequest, callClaude: CallClaude): Promise<TurnOutcome> {
  const result = await callClaude(SYSTEM_PROMPT, buildUserMessage(request));
  if (!result.ok) return { ok: false, failure: result.failure };
  const output = parseClaudeOutput(result.value);
  if (output === null) return { ok: false, failure: "invalid_output" };
  const { next, rejected } = chooseNext(request, output);
  return {
    ok: true,
    raw: result.raw,
    servedBy: result.servedBy,
    usage: result.usage,
    claudeText: output.text,
    textRejected: output.text !== null && next.text === null,
    rejectReason: rejected,
    response: {
      emergency: output.emergency,
      viewpoints: output.viewpoints,
      next,
      recall: output.recall,
      source_guess: output.source_guess,
    },
  };
}
