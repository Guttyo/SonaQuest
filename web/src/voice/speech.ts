// 何を読み上げるか（ADR-0033）。ソナがいま新しく言った文と、出来事の固定文だけ。
// 利用者の回答（answers の text）は使わない。読み上げの中継（/api/tts）と ElevenLabs に回答を送らないため（ADR-0005）。
// ソナの文は、固定文か、Workers の検査と監査役を通った Claude の文（ADR-0025、ADR-0030）。

import {
  AI_FAILED_NOTE,
  CLOSING_SPEECH,
  CONFIRM_PROMPT,
  EVENT_PREP_INTRO,
  EVENT_SPEECH,
  JUDGMENT_LABELS,
  NEXT_STEPS_HEADING,
  NEXT_STEP_LABEL,
  NO_WEAK_POINTS_NOTE,
  OPENING_SPEECH,
  ORDINALS,
  PREP_SPEECH,
  PREP_ACTIONS,
  RECALL_NOW,
  UNDETERMINED_NOTE,
  VIEWPOINT_ORDER,
  viewpointShortLabel,
  weakPointLine,
} from "../flow/content";
import { EVENT_PREP_PRIORITY, nextSteps, undeterminedJudgments } from "../flow/rules";
import { currentQuestion, type TrainingState } from "../flow/training";

/**
 * 振り返りの先頭で読み上げる文（3D のとき。ADR-0054）。固定文と、検査を通った Claude の受け止め・一言だけで、利用者の回答は使わない。
 * 受け止め → 見出し → 弱い観点の短い名前と判定（全部）→ 最初の1つの一言と次の一手。
 * 2つ目からの一言は読まない（長くなるので画面で読む）。判定が無い回はその知らせ、全部確認できた回はその一言
 */
export function reviewSpeech(state: TrainingState): string | null {
  const tail = eventPrepSpeech(state) + PREP_SPEECH + CLOSING_SPEECH;
  // 出来事に合わせて優先する準備行動を3つ読み、最後に「次の準備を1つ決める」へ促す固定文を言う（2026-11-07 のオーナーの言葉）。
  // 読み上げの中継の上限（500字）を超えると、その回の残りがブラウザの読み上げになるので、超えるときは最初の一言と次の一手を省く
  const full = reviewSpeechBody(state, true);
  if (full === null) return null;
  if ((full + tail).length <= REVIEW_SPEECH_MAX) return full + tail;
  const short = reviewSpeechBody(state, false) + tail;
  if (short.length <= REVIEW_SPEECH_MAX) return short;
  // それでも長いときは、Claude の一言を読まない（画面には出ている）
  return reviewSpeechBody({ ...state, closingRemark: null }, false) + tail;
}

/** 振り返りの読み上げの長さの上限（読み上げの中継 /api/tts の 500字より少し短く） */
export const REVIEW_SPEECH_MAX = 480;

/** 出来事に合わせた準備行動3つの読み上げ。出来事が無い回は空 */
export function eventPrepSpeech(state: TrainingState): string {
  if (state.event === null) return "";
  const items = EVENT_PREP_PRIORITY[state.event].map((id, i) => {
    const label = PREP_ACTIONS.find((a) => a.id === id)!.label;
    return `${ORDINALS[i]}、${label}。`;
  });
  return EVENT_PREP_INTRO + items.join("");
}

function reviewSpeechBody(state: TrainingState, withFirstStep: boolean): string | null {
  if (state.stage.name !== "review") return null;
  // 受け止めの後に、Claude の一言（Issue #200。検査と監査役を通ったもの）を続ける
  const ack = (state.closingAck ?? "") + (state.closingRemark ?? "");
  const judgments =
    state.ai === "on" && state.judgments !== null ? state.judgments : undeterminedJudgments();
  if (VIEWPOINT_ORDER.every((v) => judgments[v] === "undetermined")) {
    return ack + (state.ai === "off" ? UNDETERMINED_NOTE : AI_FAILED_NOTE);
  }
  const steps = nextSteps(judgments);
  if (steps.length === 0) return ack + NO_WEAK_POINTS_NOTE;
  const names = steps
    .map((s) => `${viewpointShortLabel(s.viewpoint, state.event)}は${JUDGMENT_LABELS[s.judgment]}。`)
    .join("");
  if (!withFirstStep) return `${ack}${NEXT_STEPS_HEADING}。${names}`;
  const first = steps[0];
  const line = weakPointLine(first.viewpoint, first.judgment as "not_mentioned" | "aware_unconfirmed", state.event);
  const action = PREP_ACTIONS.find((a) => a.id === first.action)!.label;
  return `${ack}${NEXT_STEPS_HEADING}。${names}${line}${NEXT_STEP_LABEL}は、${action}。`;
}

/** いま読み上げる文。読み上げるものが無い段階（返事を待つ間など）は null */
export function listenerSpeech(state: TrainingState): string | null {
  const { stage } = state;
  const last = state.answers[state.answers.length - 1];

  if (stage.name === "first" || stage.name === "second") {
    if (state.waiting) return null;
    const question = currentQuestion(state);
    if (question === null) return null;
    // 体調の確かめの問い（ADR-0011 の追記）は、それだけを読み上げる
    if (state.prompt?.type === "symptom_check") return state.prompt.text;
    // 思い出せないという回答の直後は、その場の固定文を先に言う（Transcript の表示と同じ）
    const recall = last !== undefined && last.half === stage.name && last.recall ? RECALL_NOW : "";
    // 最初の質問の前に、デモであることと実際の服薬情報を入れないことを言う（2026-11-07 のオーナーの言葉）
    const opening = stage.name === "first" && state.answers.length === 0 ? OPENING_SPEECH : "";
    return opening + recall + (state.prompt?.text ?? question.text);
  }
  if (stage.name === "confirm") {
    const recall = last !== undefined && last.half === "first" && last.recall ? RECALL_NOW : "";
    return recall + (state.closingAck ?? "") + CONFIRM_PROMPT;
  }
  // 出来事は、画面の一覧ではなく場面を語る固定文を読み上げる（2026-11-07 のオーナーの言葉）
  if (stage.name === "event" && state.event !== null) return EVENT_SPEECH[state.event];
  return null;
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
