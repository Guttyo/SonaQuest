// 訓練の状態と遷移。状態はメモリにだけ持ち、保存しない（ADR-0007）。

import {
  firstHalfQuestions,
  isAcceptableAnswer,
  secondHalfQuestions,
  selectEvent,
} from "./rules";
import type {
  Answer,
  EventId,
  PrepActionId,
  Question,
  SourceId,
  TimingId,
} from "./types";

export type Stage =
  | { name: "intro" }
  | { name: "first"; index: number }
  | { name: "confirm" }
  | { name: "event" }
  | { name: "second"; index: number }
  | { name: "review" }
  | { name: "done"; action: PrepActionId; timing: TimingId }
  | { name: "stopped" };

export interface TrainingState {
  stage: Stage;
  answers: readonly Answer[];
  /** ③確認で本人が選んだ情報源。選ばずに進んだら null */
  source: SourceId | null;
  event: EventId | null;
}

export type TrainingAction =
  | { type: "start" }
  | { type: "answer"; text: string }
  | { type: "confirm"; source: SourceId | null }
  | { type: "continue_after_event" }
  | { type: "choose_prep"; action: PrepActionId; timing: TimingId }
  | { type: "stop" }
  | { type: "restart" };

export const initialState: TrainingState = {
  stage: { name: "intro" },
  answers: [],
  source: null,
  event: null,
};

/** 今の段階で出している質問。質問を出していない段階では null */
export function currentQuestion(state: TrainingState): Question | null {
  const { stage } = state;
  if (stage.name === "first") return firstHalfQuestions()[stage.index] ?? null;
  if (stage.name === "second" && state.event !== null) {
    return secondHalfQuestions(state.event)[stage.index] ?? null;
  }
  return null;
}

export function trainingReducer(
  state: TrainingState,
  action: TrainingAction,
): TrainingState {
  if (action.type === "stop") {
    return { ...state, stage: { name: "stopped" } };
  }
  if (action.type === "restart") {
    return initialState;
  }

  const { stage } = state;
  switch (action.type) {
    case "start":
      if (stage.name !== "intro") return state;
      return { ...initialState, stage: { name: "first", index: 0 } };

    case "answer": {
      const question = currentQuestion(state);
      if (question === null || !isAcceptableAnswer(action.text)) return state;
      if (stage.name !== "first" && stage.name !== "second") return state;

      const answers = [
        ...state.answers,
        { questionId: question.id, half: stage.name, text: action.text },
      ];
      const nextIndex = stage.index + 1;
      // 上限に達したら追加の質問をせず先へ進む（ADR-0019）
      if (stage.name === "first") {
        const next: Stage =
          nextIndex < firstHalfQuestions().length
            ? { name: "first", index: nextIndex }
            : { name: "confirm" };
        return { ...state, answers, stage: next };
      }
      const total = secondHalfQuestions(state.event ?? "handover").length;
      const next: Stage =
        nextIndex < total
          ? { name: "second", index: nextIndex }
          : { name: "review" };
      return { ...state, answers, stage: next };
    }

    case "confirm":
      if (stage.name !== "confirm") return state;
      return {
        ...state,
        source: action.source,
        event: selectEvent(action.source),
        stage: { name: "event" },
      };

    case "continue_after_event":
      if (stage.name !== "event") return state;
      return { ...state, stage: { name: "second", index: 0 } };

    case "choose_prep":
      if (stage.name !== "review") return state;
      return {
        ...state,
        stage: { name: "done", action: action.action, timing: action.timing },
      };
  }
}
