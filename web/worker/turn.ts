// 1回のやり取り（/api/turn）の中身。Claude の出力を検査し、画面に返す形に整える（ADR-0015、ADR-0025）。

import { ALL_QUESTIONS } from "../src/flow/content";
import {
  JUDGMENT_VALUES,
  SOURCE_GUESS_IDS,
  VIEWPOINT_IDS,
  hasExactKeys,
  type TurnRequest,
  type TurnResponse,
} from "../src/flow/turnContract";
import { isAcceptablePromptText } from "./checks";
import type { CallClaude, ClaudeFailure } from "./claude";
import { SYSTEM_PROMPT, buildUserMessage } from "./prompt";

interface ClaudeOutput {
  emergency: boolean;
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
  if (typeof emergency !== "boolean" || typeof recall !== "boolean") return null;
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
    emergency,
    viewpoints: viewpoints as ClaudeOutput["viewpoints"],
    next_type: next_type as ClaudeOutput["next_type"],
    text,
    recall,
    source_guess: source_guess as ClaudeOutput["source_guess"],
  };
}

const QUESTION_TEXT = new Map(ALL_QUESTIONS.map((q) => [q.id, q.text]));

/**
 * 次の手を決める。質問IDは Claude に選ばせず、固定の順番から決める（ADR-0025 の A）。
 * 許していない聞き返し・質問し直しは「次へ進む」に直し、そのときは Claude の文を使わない
 */
export function decideNext(request: TurnRequest, output: ClaudeOutput): TurnResponse["next"] {
  const current = request.inputs[request.inputs.length - 1].question_id;
  let type: ClaudeOutput["next_type"] = output.next_type;
  let text = output.text;
  if ((type === "clarify" && !request.allow_clarify) || (type === "redirect" && !request.allow_redirect)) {
    type = "ask";
    text = null;
  }
  if (type === "ask" && request.next_question_id === null) {
    return { type: "finish", question_id: null, text: null };
  }
  const questionId = type === "ask" ? (request.next_question_id as string) : current;

  const accepted =
    text !== null &&
    isAcceptablePromptText(text, {
      userTexts: request.inputs.map((i) => i.text),
      allowed: [QUESTION_TEXT.get(current) ?? "", QUESTION_TEXT.get(questionId) ?? ""],
    });
  return { type, question_id: questionId, text: accepted ? text : null };
}

export type TurnOutcome =
  | { ok: true; response: TurnResponse; raw: string; textRejected: boolean }
  | { ok: false; failure: ClaudeFailure | "invalid_output" };

export async function runTurn(request: TurnRequest, callClaude: CallClaude): Promise<TurnOutcome> {
  const result = await callClaude(SYSTEM_PROMPT, buildUserMessage(request));
  if (!result.ok) return { ok: false, failure: result.failure };
  const output = parseClaudeOutput(result.value);
  if (output === null) return { ok: false, failure: "invalid_output" };
  const next = decideNext(request, output);
  return {
    ok: true,
    raw: result.raw,
    textRejected: output.text !== null && next.text === null,
    response: {
      emergency: output.emergency,
      viewpoints: output.viewpoints,
      next,
      recall: output.recall,
      source_guess: output.source_guess,
    },
  };
}
