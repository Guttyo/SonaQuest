// ブラウザと Workers の /api/turn のやり取りの形と、その検査（ADR-0015、docs/phase2-decisions.md 項目13）。
// 両方から使う。受け取った値は、ここで決めた形と値の範囲に合うものだけを通す。

import { ALL_QUESTIONS } from "./content";
import { MAX_ANSWERS, MAX_ANSWER_LENGTH } from "./rules";
import type { EventId, Half, SourceId, ViewpointId } from "./types";

export const QUESTION_IDS: ReadonlySet<string> = new Set(ALL_QUESTIONS.map((q) => q.id));

const HALVES: ReadonlySet<string> = new Set(["first", "second"]);
const EVENT_IDS: ReadonlySet<string> = new Set([
  "battery",
  "network",
  "notebook_home",
  "family_unreachable",
  "clinic_unreachable",
  "handover",
]);
/** 本人が選んだ情報源。「どれにも当てはまらない」（none）を含む */
const SOURCE_IDS: ReadonlySet<string> = new Set([
  "smartphone",
  "online",
  "notebook",
  "family",
  "clinic",
  "none",
]);
/** Claude が返してよい初期選択の候補。none（係の交代）は本人のタップでだけ選ぶ（ADR-0016） */
export const SOURCE_GUESS_IDS: ReadonlySet<string> = new Set([
  "smartphone",
  "online",
  "notebook",
  "family",
  "clinic",
]);
export const VIEWPOINT_IDS: readonly ViewpointId[] = [
  "location",
  "alternative",
  "current",
  "unrecorded",
  "proxy",
];
export const JUDGMENT_VALUES: ReadonlySet<string> = new Set([
  "confirmed",
  "aware_unconfirmed",
  "not_mentioned",
]);
const NEXT_TYPES: ReadonlySet<string> = new Set(["ask", "clarify", "redirect", "finish"]);
/** Claude が見つけた緊急の種類（補助。ADR-0011）。自傷のほのめかしには自傷用の案内を出す */
export const EMERGENCY_KINDS: ReadonlySet<string> = new Set(["none", "symptom", "self_harm"]);

/**
 * 1回のやり取りで送る入力の件数の上限（数える回答の最大10件。ADR-0019）。
 * 関係のない話として質問し直した入力は、その後のやり取りでは送らない（送るものは必要な範囲に限る）
 */
export const MAX_TURN_INPUTS = MAX_ANSWERS;

/** ソナの文（Claude が作ったもの）の長さの上限（ADR-0025。値は実装時に決めた） */
export const MAX_PROMPT_LENGTH = 200;

export interface TurnInput {
  question_id: string;
  half: Half;
  /** その回答の直前に画面に出したソナの文（Claude が作った文を含む。項目4のオーナー決定） */
  asked: string;
  text: string;
}

export interface TurnRequest {
  /** これまでの入力。最後のものが、いま答えた入力 */
  inputs: TurnInput[];
  event: EventId | null;
  source: SourceId | null;
  /** 次の固定の質問。前半・後半の終わりで次が無いときは null */
  next_question_id: string | null;
  /** 聞き返し（回数に数える）をしてよいか */
  allow_clarify: boolean;
  /** 質問し直し（回数に数えない。質問ごとに1回まで）をしてよいか */
  allow_redirect: boolean;
}

export type JudgmentValue = "confirmed" | "aware_unconfirmed" | "not_mentioned";

export interface TurnResponse {
  /** 補助。中断の主は語の照合（ADR-0011、docs/phase2-decisions.md 項目10） */
  emergency: "none" | "symptom" | "self_harm";
  viewpoints: Record<ViewpointId, JudgmentValue>;
  next: {
    type: "ask" | "clarify" | "redirect" | "finish";
    question_id: string | null;
    /** 検査を通った Claude の文。無ければ固定文を使う */
    text: string | null;
  };
  recall: boolean;
  source_guess: Exclude<SourceId, "none"> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** キーがちょうど keys だけか（余分なキーも、足りないキーも拒否する） */
export function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((k) => Object.hasOwn(value, k));
}

function isAnswerText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_ANSWER_LENGTH
  );
}

/** Workers が受け取る入力の検査。上限を超えるものは Claude を呼ばずに拒否する（ADR-0003） */
export function parseTurnRequest(body: unknown): TurnRequest | null {
  if (!isRecord(body)) return null;
  const keys = [
    "inputs",
    "event",
    "source",
    "next_question_id",
    "allow_clarify",
    "allow_redirect",
  ];
  if (!hasExactKeys(body, keys)) return null;
  const { inputs, event, source, next_question_id, allow_clarify, allow_redirect } = body;

  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.length > MAX_TURN_INPUTS) {
    return null;
  }
  const parsed: TurnInput[] = [];
  for (const input of inputs) {
    if (!isRecord(input) || !hasExactKeys(input, ["question_id", "half", "asked", "text"])) {
      return null;
    }
    const { question_id, half, asked, text } = input;
    if (typeof question_id !== "string" || !QUESTION_IDS.has(question_id)) return null;
    if (typeof half !== "string" || !HALVES.has(half)) return null;
    if (typeof asked !== "string" || asked.trim().length === 0 || asked.length > MAX_PROMPT_LENGTH) {
      return null;
    }
    if (!isAnswerText(text)) return null;
    parsed.push({ question_id, half: half as Half, asked, text });
  }

  if (event !== null && (typeof event !== "string" || !EVENT_IDS.has(event))) return null;
  if (source !== null && (typeof source !== "string" || !SOURCE_IDS.has(source))) return null;
  if (
    next_question_id !== null &&
    (typeof next_question_id !== "string" || !QUESTION_IDS.has(next_question_id))
  ) {
    return null;
  }
  if (typeof allow_clarify !== "boolean" || typeof allow_redirect !== "boolean") return null;

  return {
    inputs: parsed,
    event: event as EventId | null,
    source: source as SourceId | null,
    next_question_id: next_question_id as string | null,
    allow_clarify,
    allow_redirect,
  };
}

/** ブラウザが受け取る応答の検査。Workers の検査を通ったものでも、形が違えば使わない */
export function parseTurnResponse(body: unknown): TurnResponse | null {
  if (!isRecord(body)) return null;
  if (!hasExactKeys(body, ["emergency", "viewpoints", "next", "recall", "source_guess"])) {
    return null;
  }
  const { emergency, viewpoints, next, recall, source_guess } = body;
  if (typeof emergency !== "string" || !EMERGENCY_KINDS.has(emergency)) return null;
  if (typeof recall !== "boolean") return null;

  if (!isRecord(viewpoints) || !hasExactKeys(viewpoints, VIEWPOINT_IDS)) return null;
  for (const v of VIEWPOINT_IDS) {
    const j = viewpoints[v];
    if (typeof j !== "string" || !JUDGMENT_VALUES.has(j)) return null;
  }

  if (!isRecord(next) || !hasExactKeys(next, ["type", "question_id", "text"])) return null;
  const { type, question_id, text } = next;
  if (typeof type !== "string" || !NEXT_TYPES.has(type)) return null;
  if (question_id !== null && (typeof question_id !== "string" || !QUESTION_IDS.has(question_id))) {
    return null;
  }
  if ((type === "finish") !== (question_id === null)) return null;
  if (
    text !== null &&
    (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_PROMPT_LENGTH)
  ) {
    return null;
  }

  if (
    source_guess !== null &&
    (typeof source_guess !== "string" || !SOURCE_GUESS_IDS.has(source_guess))
  ) {
    return null;
  }

  return {
    emergency: emergency as TurnResponse["emergency"],
    viewpoints: viewpoints as Record<ViewpointId, JudgmentValue>,
    next: {
      type: type as TurnResponse["next"]["type"],
      question_id: question_id as string | null,
      text: text as string | null,
    },
    recall,
    source_guess: source_guess as TurnResponse["source_guess"],
  };
}
