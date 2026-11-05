// 何を読み上げるか（ADR-0033）。聞き取り係がいま新しく言った文と、出来事の固定文だけ。
// 利用者の回答（answers の text）は使わない。読み上げの中継（/api/tts）と ElevenLabs に回答を送らないため（ADR-0005）。
// 聞き取り係の文は、固定文か、Workers の検査と監査役を通った Claude の文（ADR-0025、ADR-0030）。

import {
  AI_FAILED_NOTE,
  CONFIRM_PROMPT,
  EVENTS,
  JUDGMENT_LABELS,
  NEXT_STEPS_HEADING,
  NEXT_STEP_LABEL,
  NO_WEAK_POINTS_NOTE,
  PREP_ACTIONS,
  RECALL_NOW,
  UNDETERMINED_NOTE,
  VIEWPOINT_ORDER,
  VIEWPOINT_SHORT_LABELS,
  WEAK_POINT_LINES,
} from "../flow/content";
import { nextSteps, undeterminedJudgments } from "../flow/rules";
import { currentQuestion, type TrainingState } from "../flow/training";

/**
 * 振り返りの先頭で読み上げる文（3D のとき。ADR-0051）。固定文だけで、利用者の回答は使わない。
 * 受け止め → 見出し → 弱い観点の短い名前と判定（全部）→ 最初の1つの一言と次の一手。
 * 2つ目からの一言は読まない（長くなるので画面で読む）。判定が無い回はその知らせ、全部確認できた回はその一言
 */
export function reviewSpeech(state: TrainingState): string | null {
  if (state.stage.name !== "review") return null;
  const ack = state.closingAck ?? "";
  const judgments =
    state.ai === "on" && state.judgments !== null ? state.judgments : undeterminedJudgments();
  if (VIEWPOINT_ORDER.every((v) => judgments[v] === "undetermined")) {
    return ack + (state.ai === "off" ? UNDETERMINED_NOTE : AI_FAILED_NOTE);
  }
  const steps = nextSteps(judgments);
  if (steps.length === 0) return ack + NO_WEAK_POINTS_NOTE;
  const names = steps
    .map((s) => `${VIEWPOINT_SHORT_LABELS[s.viewpoint]}は${JUDGMENT_LABELS[s.judgment]}。`)
    .join("");
  const first = steps[0];
  const line = WEAK_POINT_LINES[first.viewpoint][first.judgment as "not_mentioned" | "aware_unconfirmed"];
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
    // 思い出せないという回答の直後は、その場の固定文を先に言う（Transcript の表示と同じ）
    const recall = last !== undefined && last.half === stage.name && last.recall ? RECALL_NOW : "";
    return recall + (state.prompt?.text ?? question.text);
  }
  if (stage.name === "confirm") {
    const recall = last !== undefined && last.half === "first" && last.recall ? RECALL_NOW : "";
    return recall + (state.closingAck ?? "") + CONFIRM_PROMPT;
  }
  if (stage.name === "event" && state.event !== null) {
    const event = EVENTS[state.event];
    return event.unavailable === null
      ? event.text
      : `${event.text}使えなくなったもの：${event.unavailable}`;
  }
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
