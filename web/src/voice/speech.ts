// 何を読み上げるか（ADR-0033）。ソナがいま新しく言った文と、出来事の固定文だけ。
// 利用者の回答（answers の text）は使わない。読み上げの中継（/api/tts）と ElevenLabs に回答を送らないため（ADR-0005）。
// ソナの文は、固定文か、Workers の検査と監査役を通った Claude の文（ADR-0025、ADR-0030）。
// 文の組み立ては speechPlan.ts の純粋な関数（composeSpeech）で行い、Worker も同じ関数で作り直す（Issue #284 の指摘3、案A）。
// ここでは、訓練の状態から設計図（SpeechSpec）を作る。

import { currentQuestion, type TrainingState } from "../flow/training";
import type { Prompt, SpeechPart } from "../flow/types";
import { REVIEW_SPEECH_MAX, composeSpeech, eventPrepText, fixedId, partsText, type SpeechSpec } from "./speechPlan";

export { REVIEW_SPEECH_MAX };

/** 読み上げる文と、/api/tts に送る設計図 */
export interface SpeechPlan {
  text: string;
  spec: SpeechSpec;
}

/** 部品が文と合わないとき（組み立ての記録が無い・ずれた）は、署名の無い Claude の文として扱う（/api/tts は読まない） */
function partsFor(text: string, parts: readonly SpeechPart[] | undefined | null): readonly SpeechPart[] {
  if (parts !== undefined && parts !== null && partsText(parts) === text) return parts;
  return [{ claude: text, token: null }];
}

function promptParts(prompt: Prompt): readonly SpeechPart[] {
  return partsFor(prompt.text, prompt.parts);
}

function ackParts(state: TrainingState): readonly SpeechPart[] {
  return state.closingAck === null ? [] : partsFor(state.closingAck, state.closingAckParts);
}

function remarkParts(state: TrainingState): readonly SpeechPart[] {
  return state.closingRemark === null ? [] : [{ claude: state.closingRemark, token: state.closingRemarkToken ?? null }];
}

function plan(spec: SpeechSpec | null): SpeechPlan | null {
  if (spec === null) return null;
  const text = composeSpeech(spec);
  return text === null ? null : { text, spec };
}

/**
 * 振り返りの先頭で読み上げる設計図（3D のとき。ADR-0054）。固定文と、検査を通った Claude の受け止め・一言だけで、利用者の回答は使わない。
 * 受け止め → 見出し → 弱い観点の短い名前と判定（全部）→ 最初の1つの一言と次の一手 → 出来事に合わせた準備行動 → 締め
 */
export function reviewSpeechPlan(state: TrainingState): SpeechPlan | null {
  if (state.stage.name !== "review") return null;
  return plan({
    kind: "review",
    event: state.event,
    ai: state.ai,
    judgments: state.ai === "on" ? state.judgments : null,
    ack: ackParts(state),
    remark: remarkParts(state),
  });
}

/** 振り返りの先頭で読み上げる文 */
export function reviewSpeech(state: TrainingState): string | null {
  return reviewSpeechPlan(state)?.text ?? null;
}

/** 出来事に合わせた準備行動3つの読み上げ。出来事が無い回は空 */
export function eventPrepSpeech(state: TrainingState): string {
  return eventPrepText(state.event);
}

/** いま読み上げる設計図。読み上げるものが無い段階（返事を待つ間など）は null */
export function listenerSpeechPlan(state: TrainingState): SpeechPlan | null {
  const { stage } = state;
  const last = state.answers[state.answers.length - 1];

  if (stage.name === "first" || stage.name === "second") {
    if (state.waiting) return null;
    const question = currentQuestion(state);
    if (question === null) return null;
    // 体調の確かめの問い（ADR-0011 の追記）は、それだけを読み上げる
    if (state.prompt?.type === "symptom_check") {
      return plan({ kind: "ask", opening: false, recall: false, prompt: promptParts(state.prompt) });
    }
    // 思い出せないという回答の直後は、その場の固定文を先に言う（Transcript の表示と同じ）
    const recall = last !== undefined && last.half === stage.name && last.recall;
    // 最初の質問の前に、デモであることと実際の服薬情報を入れないことを言う（2026-11-07 のオーナーの言葉）
    const opening = stage.name === "first" && state.answers.length === 0;
    const prompt = state.prompt === null ? [{ fixed: fixedId.question(question.id) }] : promptParts(state.prompt);
    return plan({ kind: "ask", opening, recall, prompt });
  }
  if (stage.name === "confirm") {
    const recall = last !== undefined && last.half === "first" && last.recall;
    return plan({ kind: "confirm", recall, ack: ackParts(state) });
  }
  // 出来事は、画面の一覧ではなく場面を語る固定文を読み上げる（2026-11-07 のオーナーの言葉）
  if (stage.name === "event" && state.event !== null) return plan({ kind: "event", event: state.event });
  return null;
}

/** いま読み上げる文。読み上げるものが無い段階（返事を待つ間など）は null */
export function listenerSpeech(state: TrainingState): string | null {
  return listenerSpeechPlan(state)?.text ?? null;
}

/**
 * 同じ発言を2回読み上げないための目印。回、段階、入力の件数が同じで文も同じなら、同じ発言。
 * 開発中の React の StrictMode で effect が2回動いても読み直さない
 */
export function speechKey(state: TrainingState, text: string): string {
  const { stage } = state;
  const index = stage.name === "first" || stage.name === "second" ? stage.index : -1;
  return `${state.session}:${stage.name}:${index}:${state.answers.length}:${text}`;
}
