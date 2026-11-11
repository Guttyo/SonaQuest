// 読み上げる文の組み立て（Issue #284 の指摘3、案A。ADR-0033 の追記）。画面（speech.ts）と Worker（worker/tts.ts）の両方が使う純粋な関数。
// 入力は「固定文の ID・判定・出来事などの値」と「Claude の文（/api/turn が署名したもの）」だけで、利用者の回答は受け取らない（ADR-0005）。
// Worker は届いた値から同じ関数で文を作り直すので、/api/tts は固定文と署名つきの Claude の文からできた文だけを読み上げる。
// React・ブラウザの API・training.ts を import しない（Worker から読むため）。

import {
  ACK_TEXT,
  ACK_TEXTS,
  AI_FAILED_NOTE,
  ALL_QUESTIONS,
  CLARIFY_TEXTS,
  CLOSING_SPEECH,
  CONFIRM_PROMPT,
  EVENT_PREP_INTRO,
  EVENT_REASK,
  EVENT_SPEECH,
  JUDGMENT_LABELS,
  NEXT_STEPS_HEADING,
  NEXT_STEP_LABEL,
  NO_WEAK_POINTS_NOTE,
  OPENING_SPEECH,
  ORDINALS,
  PREP_ACTIONS,
  PREP_SPEECH,
  RECALL_NOW,
  RECHECK_CLOSING,
  REDIRECT_TEXTS,
  UNDETERMINED_NOTE,
  VIEWPOINT_ORDER,
  viewpointShortLabel,
  weakPointLine,
} from "../flow/content";
import { SYMPTOM_CHECK_TEXT } from "../flow/emergency";
import { EVENT_PREP_PRIORITY, nextSteps, undeterminedJudgments } from "../flow/rules";
import type { EventId, Judgments, SpeechPart } from "../flow/types";

export type { SpeechPart };

/** 訓練が Claude を使っているか（training.ts の AiStatus と同じ値） */
export type SpeechAi = "on" | "failed" | "off";

/**
 * 読み上げる文の設計図。/api/tts にはこれを送る。
 * - ask：質問（最初の前置き・思い出せないときの固定文・質問の文）。体調の確かめの問いもこの形
 * - confirm：③確認（思い出せないときの固定文・受け止め・確認の固定文）
 * - event：出来事の場面の固定文
 * - review：振り返りの先頭（受け止め・一言・判定・次の一手・準備行動）
 */
export type SpeechSpec =
  | { kind: "ask"; opening: boolean; recall: boolean; prompt: readonly SpeechPart[] }
  | { kind: "confirm"; recall: boolean; ack: readonly SpeechPart[] }
  | { kind: "event"; event: EventId }
  | {
      kind: "review";
      event: EventId | null;
      ai: SpeechAi;
      /** ai が on のときだけ使う。それ以外は null */
      judgments: Judgments | null;
      ack: readonly SpeechPart[];
      remark: readonly SpeechPart[];
    };

/** 振り返りの読み上げの長さの上限（読み上げの中継 /api/tts の 500字より少し短く） */
export const REVIEW_SPEECH_MAX = 480;

/** 固定文の ID（ack:<番号> は ACK_TEXTS の何番目か） */
export const fixedId = {
  question: (questionId: string) => `q:${questionId}`,
  ack: (index: number) => `ack:${index}`,
  closingAck: "ack",
  recheckClosing: "recheck_closing",
  clarify: (questionId: string) => `clarify:${questionId}`,
  redirect: (questionId: string) => `redirect:${questionId}`,
  eventReask: (event: EventId) => `event_reask:${event}`,
  symptomCheck: "symptom_check",
} as const;

/** 質問の部品に使える固定文の一覧（ID → 文）。ここに無い ID は読み上げない */
export const FIXED_SPEECH: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const q of ALL_QUESTIONS) map.set(fixedId.question(q.id), q.text);
  ACK_TEXTS.forEach((text, i) => map.set(fixedId.ack(i), text));
  map.set(fixedId.closingAck, ACK_TEXT);
  map.set(fixedId.recheckClosing, RECHECK_CLOSING);
  for (const [id, text] of Object.entries(CLARIFY_TEXTS)) map.set(fixedId.clarify(id), text);
  for (const [id, text] of Object.entries(REDIRECT_TEXTS)) map.set(fixedId.redirect(id), text);
  for (const [event, reask] of Object.entries(EVENT_REASK)) {
    if (reask !== null) map.set(fixedId.eventReask(event as EventId), reask.text);
  }
  map.set(fixedId.symptomCheck, SYMPTOM_CHECK_TEXT);
  return map;
})();

/** ackFor(n)（content.ts）が使う ACK_TEXTS の番号 */
export function ackIndex(n: number): number {
  return ((n % ACK_TEXTS.length) + ACK_TEXTS.length) % ACK_TEXTS.length;
}

/** 部品をつなげた文。知らない固定文の ID があれば null */
export function partsText(parts: readonly SpeechPart[]): string | null {
  let out = "";
  for (const part of parts) {
    if ("fixed" in part) {
      const text = FIXED_SPEECH.get(part.fixed);
      if (text === undefined) return null;
      out += text;
    } else {
      out += part.claude;
    }
  }
  return out;
}

/** 出来事に合わせた準備行動3つの読み上げ。出来事が無い回は空 */
export function eventPrepText(event: EventId | null): string {
  if (event === null) return "";
  const items = EVENT_PREP_PRIORITY[event].map((id, i) => {
    const label = PREP_ACTIONS.find((a) => a.id === id)!.label;
    return `${ORDINALS[i]}、${label}。`;
  });
  return EVENT_PREP_INTRO + items.join("");
}

function reviewBody(
  spec: Extract<SpeechSpec, { kind: "review" }>,
  ack: string,
  remark: string,
  withFirstStep: boolean,
): string {
  // 受け止めの後に、Claude の一言（Issue #200。検査と監査役を通ったもの）を続ける
  const head = ack + remark;
  const judgments = spec.ai === "on" && spec.judgments !== null ? spec.judgments : undeterminedJudgments();
  if (VIEWPOINT_ORDER.every((v) => judgments[v] === "undetermined")) {
    return head + (spec.ai === "off" ? UNDETERMINED_NOTE : AI_FAILED_NOTE);
  }
  const steps = nextSteps(judgments);
  if (steps.length === 0) return head + NO_WEAK_POINTS_NOTE;
  const names = steps
    .map((s) => `${viewpointShortLabel(s.viewpoint, spec.event)}は${JUDGMENT_LABELS[s.judgment]}。`)
    .join("");
  if (!withFirstStep) return `${head}${NEXT_STEPS_HEADING}。${names}`;
  const first = steps[0];
  const line = weakPointLine(first.viewpoint, first.judgment as "not_mentioned" | "aware_unconfirmed", spec.event);
  const action = PREP_ACTIONS.find((a) => a.id === first.action)!.label;
  return `${head}${NEXT_STEPS_HEADING}。${names}${line}${NEXT_STEP_LABEL}は、${action}。`;
}

/**
 * 設計図から読み上げる文を作る。知らない固定文の ID・空の質問があれば null。
 * 振り返りは、上限（REVIEW_SPEECH_MAX）を超えるとき、最初の一言と次の一手を省き、それでも長ければ Claude の一言を読まない（画面には出ている）
 */
export function composeSpeech(spec: SpeechSpec): string | null {
  switch (spec.kind) {
    case "ask": {
      if (spec.prompt.length === 0) return null;
      const prompt = partsText(spec.prompt);
      if (prompt === null) return null;
      return (spec.opening ? OPENING_SPEECH : "") + (spec.recall ? RECALL_NOW : "") + prompt;
    }
    case "confirm": {
      const ack = partsText(spec.ack);
      if (ack === null) return null;
      return (spec.recall ? RECALL_NOW : "") + ack + CONFIRM_PROMPT;
    }
    case "event":
      return EVENT_SPEECH[spec.event] ?? null;
    case "review": {
      const ack = partsText(spec.ack);
      const remark = partsText(spec.remark);
      if (ack === null || remark === null) return null;
      // 出来事に合わせて優先する準備行動を3つ読み、最後に「次の準備を1つ決める」へ促す固定文を言う（2026-11-07 のオーナーの言葉）
      const tail = eventPrepText(spec.event) + PREP_SPEECH + CLOSING_SPEECH;
      const full = reviewBody(spec, ack, remark, true) + tail;
      if (full.length <= REVIEW_SPEECH_MAX) return full;
      const short = reviewBody(spec, ack, remark, false) + tail;
      if (short.length <= REVIEW_SPEECH_MAX) return short;
      return reviewBody(spec, ack, "", false) + tail;
    }
  }
}

/** 設計図の中の Claude の文の部品（Worker が署名を確かめる） */
export function claudeParts(spec: SpeechSpec): Extract<SpeechPart, { claude: string }>[] {
  const parts: readonly SpeechPart[] =
    spec.kind === "ask" ? spec.prompt : spec.kind === "confirm" ? spec.ack : spec.kind === "review" ? [...spec.ack, ...spec.remark] : [];
  return parts.filter((p): p is Extract<SpeechPart, { claude: string }> => "claude" in p);
}

/** 1つの欄に並べてよい部品の数（質問は「受け止め＋質問」、締めは「受け止め＋固定の締め」の 2 つまで。余裕を足す） */
export const MAX_SPEECH_PARTS = 4;
/** Claude の文の部品の長さの上限（/api/turn の MAX_PROMPT_LENGTH と同じ） */
const MAX_CLAUDE_PART_LENGTH = 200;
/** 署名の文字列の長さの上限（形は worker/speechSign.ts が確かめる） */
const MAX_TOKEN_LENGTH = 64;
const MAX_FIXED_ID_LENGTH = 64;

const SPEECH_EVENTS: ReadonlySet<string> = new Set(Object.keys(EVENT_SPEECH));
const SPEECH_AI: ReadonlySet<string> = new Set(["on", "failed", "off"]);
const SPEECH_JUDGMENTS: ReadonlySet<string> = new Set(["confirmed", "aware_unconfirmed", "not_mentioned", "undetermined"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((k) => Object.hasOwn(value, k));
}

function parseParts(value: unknown, allowEmpty: boolean): SpeechPart[] | null {
  if (!Array.isArray(value) || value.length > MAX_SPEECH_PARTS || (!allowEmpty && value.length === 0)) return null;
  const parts: SpeechPart[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (exactKeys(item, ["fixed"])) {
      const { fixed } = item;
      if (typeof fixed !== "string" || fixed.length > MAX_FIXED_ID_LENGTH || !FIXED_SPEECH.has(fixed)) return null;
      parts.push({ fixed });
    } else if (exactKeys(item, ["claude", "token"])) {
      const { claude, token } = item;
      if (typeof claude !== "string" || claude.trim().length === 0 || claude.length > MAX_CLAUDE_PART_LENGTH) return null;
      if (token !== null && (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH)) return null;
      parts.push({ claude, token });
    } else {
      return null;
    }
  }
  return parts;
}

function parseJudgments(value: unknown): Judgments | null {
  if (!isRecord(value) || !exactKeys(value, VIEWPOINT_ORDER)) return null;
  for (const v of VIEWPOINT_ORDER) {
    const j = value[v];
    if (typeof j !== "string" || !SPEECH_JUDGMENTS.has(j)) return null;
  }
  return value as Judgments;
}

/**
 * /api/tts が受け取る設計図の検査（Worker が使う）。決めた形と値の範囲に合うものだけを通す。
 * 固定文は一覧（FIXED_SPEECH）にある ID だけ。署名が合うかは、ここでは見ない（worker/speechSign.ts）
 */
export function parseSpeechSpec(value: unknown): SpeechSpec | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "ask": {
      if (!exactKeys(value, ["kind", "opening", "recall", "prompt"])) return null;
      if (typeof value.opening !== "boolean" || typeof value.recall !== "boolean") return null;
      const prompt = parseParts(value.prompt, false);
      return prompt === null ? null : { kind: "ask", opening: value.opening, recall: value.recall, prompt };
    }
    case "confirm": {
      if (!exactKeys(value, ["kind", "recall", "ack"]) || typeof value.recall !== "boolean") return null;
      const ack = parseParts(value.ack, true);
      return ack === null ? null : { kind: "confirm", recall: value.recall, ack };
    }
    case "event": {
      if (!exactKeys(value, ["kind", "event"])) return null;
      const { event } = value;
      return typeof event === "string" && SPEECH_EVENTS.has(event) ? { kind: "event", event: event as EventId } : null;
    }
    case "review": {
      if (!exactKeys(value, ["kind", "event", "ai", "judgments", "ack", "remark"])) return null;
      const { event, ai } = value;
      if (event !== null && (typeof event !== "string" || !SPEECH_EVENTS.has(event))) return null;
      if (typeof ai !== "string" || !SPEECH_AI.has(ai)) return null;
      const judgments = value.judgments === null ? null : parseJudgments(value.judgments);
      if (value.judgments !== null && judgments === null) return null;
      const ack = parseParts(value.ack, true);
      const remark = parseParts(value.remark, true);
      if (ack === null || remark === null) return null;
      return { kind: "review", event: event as EventId | null, ai: ai as SpeechAi, judgments, ack, remark };
    }
    default:
      return null;
  }
}
