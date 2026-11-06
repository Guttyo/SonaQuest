// 訓練の状態と遷移。状態はメモリにだけ持ち、保存しない（ADR-0007）。

import { ACK_TEXT, AI_CONNECTED, ALL_QUESTIONS, CLARIFY_TEXTS, REDIRECT_TEXTS, ackFor } from "./content";
import { detectDistress, type StopReason } from "./emergency";
import type { TrainingMode } from "./mode";
import {
  MAX_FIRST_HALF_ANSWERS,
  MAX_SECOND_HALF_ANSWERS,
  firstHalfQuestions,
  isAcceptableAnswer,
  planGoals,
  secondHalfQuestions,
  selectEvent,
  type GoalPlan,
} from "./rules";
import type { TurnRequest, TurnResponse } from "./turnContract";
import type {
  Answer,
  EventId,
  Half,
  Judgments,
  PrepActionId,
  Prompt,
  Question,
  SourceId,
  TimingId,
} from "./types";

/**
 * 訓練の段階。first・second の index は、その半分で何問目の質問を出しているか（0 から）。
 * どの質問かは prompt.questionId で決まる（Issue #200 で、Claude が次のゴールを選ぶようになり、順番が固定でなくなった）
 */
export type Stage =
  | { name: "intro" }
  | { name: "first"; index: number }
  | { name: "confirm" }
  | { name: "event" }
  | { name: "second"; index: number }
  | { name: "review" }
  | { name: "done"; action: PrepActionId; timing: TimingId }
  | { name: "stopped"; reason: StopReason };

/**
 * Claude を使っているか。off は使わない版（AI_CONNECTED=false）、
 * failed は途中で失敗し、その回の残りを固定の進行にした状態（ADR-0012、docs/phase2-decisions.md 項目9）
 */
export type AiStatus = "on" | "failed" | "off";

export interface TrainingState {
  /** 何回目の訓練か。やり直すと増え、前の回の Claude の返事を取り違えないために使う */
  session: number;
  /**
   * 見せ方のモード。2D は文字で答え、3D は声で答えて読み上げを聞く（ADR-0031）。
   * はじめにの画面で選び、start で入る（A-14）。声を使うかはこの値だけで決める（ADR-0033）。
   * 質問・回答・段階の進み方には影響しない。保存しない
   */
  mode: TrainingMode;
  stage: Stage;
  answers: readonly Answer[];
  /** ③確認で本人が選んだ情報源。選ばずに進んだら null */
  source: SourceId | null;
  event: EventId | null;
  ai: AiStatus;
  /** ソナのいまの発言。質問を出していない段階では null */
  prompt: Prompt | null;
  /** Claude の返事を待っているか。待っている間は次の回答を受け付けない */
  waiting: boolean;
  /** 最後に検査を通った観点の判定。失敗したら使わない */
  judgments: Judgments | null;
  /** ③確認の初期選択の候補（Claude。docs/phase2-decisions.md 項目6） */
  sourceGuess: SourceId | null;
  /** 前半・後半の最後の回答への受け止め。③確認と振り返りの冒頭に出す（ADR-0029 の2） */
  closingAck: string | null;
  /** 振り返りの冒頭に添える Claude の一言（Issue #200）。検査と監査役を通ったものだけ。無ければ null */
  closingRemark: string | null;
  /** 固定の進行に切り替えたときの入力の件数。その回答の後に1回だけ知らせを出す（ADR-0029 の4） */
  failedAfter: number | null;
}

export type TrainingAction =
  /** はじめにで選んだモードを渡す。省くと 2D（文字で答える） */
  | { type: "start"; mode?: TrainingMode }
  | { type: "answer"; text: string }
  /** session と seq（そのやり取りを始めたときの入力の件数）で、古い返事を取り違えないようにする */
  | { type: "turn_result"; session: number; seq: number; result: TurnResponse | null }
  | { type: "confirm"; source: SourceId | null }
  | { type: "continue_after_event" }
  | { type: "choose_prep"; action: PrepActionId; timing: TimingId }
  | { type: "stop" }
  | { type: "restart" };

export const initialState: TrainingState = {
  session: 0,
  mode: "2d",
  stage: { name: "intro" },
  answers: [],
  source: null,
  event: null,
  ai: AI_CONNECTED ? "on" : "off",
  prompt: null,
  waiting: false,
  judgments: null,
  sourceGuess: null,
  closingAck: null,
  closingRemark: null,
  failedAfter: null,
};

const QUESTION_BY_ID: ReadonlyMap<string, Question> = new Map(ALL_QUESTIONS.map((q) => [q.id, q]));

/**
 * 今の段階で出している固定の質問。質問を出していない段階では null。
 * ふだんは今の発言（prompt）の質問IDから決める。発言が無いとき（試験で段階だけを作ったとき）は、固定の順番の index 番目
 */
export function currentQuestion(state: TrainingState): Question | null {
  const { stage } = state;
  if ((stage.name === "first" || stage.name === "second") && state.prompt !== null) {
    const q = QUESTION_BY_ID.get(state.prompt.questionId);
    if (q !== undefined) return q;
  }
  if (stage.name === "first") return firstHalfQuestions()[stage.index] ?? null;
  if (stage.name === "second" && state.event !== null) {
    return secondHalfQuestions(state.event)[stage.index] ?? null;
  }
  return null;
}

function maxAnswersOf(half: Half): number {
  return half === "first" ? MAX_FIRST_HALF_ANSWERS : MAX_SECOND_HALF_ANSWERS;
}

/** その半分で回数に数える回答の数（聞き返しへの回答を含み、質問し直した入力を除く。ADR-0019・0025） */
export function countedAnswers(answers: readonly Answer[], half: Half): number {
  return answers.filter((a) => a.half === half && a.kind === "answer").length;
}

function askPrompt(question: Question, text: string | null): Prompt {
  return { questionId: question.id, text: text ?? question.text, type: "ask" };
}

/** その半分の、次に聞いてよいゴール（rules.ts の planGoals。Workers と同じ関数。Issue #200） */
function planOf(state: TrainingState, half: Half): GoalPlan {
  const asked = state.answers.filter((a) => a.half === half && a.kind === "answer").map((a) => a.questionId);
  return planGoals(asked, half, state.event);
}

/**
 * 回答の後に、次の質問へ進む。target は Claude が選び、確かめたゴール（質問ID）。省くと固定の順番の次の質問（fallback）。
 * 次の質問が無ければ（半分の上限、必ず聞くゴールを聞き終えた）、前半は③確認、後半は振り返りへ進む（ADR-0019）。
 * text は Claude の文（次の質問の言い回し、または半分の最後の受け止め）。無ければ、
 * 固定の受け止めの一言と固定の質問文を使う（ADR-0029 の2・3）。remark は後半を終えるときの Claude の一言
 */
function advance(
  state: TrainingState,
  text: string | null,
  target: string | null = null,
  remark: string | null = null,
): TrainingState {
  const { stage } = state;
  if (stage.name !== "first" && stage.name !== "second") return state;
  const half = stage.name;
  const nextId = target ?? planOf(state, half).fallback;
  const question = nextId === null ? undefined : QUESTION_BY_ID.get(nextId);
  if (question !== undefined) {
    return {
      ...state,
      stage: { name: half, index: stage.index + 1 },
      // 固定の受け止めは回答の数で替え、同じ言い方を続けない
      prompt: askPrompt(question, text ?? ackFor(state.answers.length) + question.text),
    };
  }
  return {
    ...state,
    stage: half === "first" ? { name: "confirm" } : { name: "review" },
    prompt: null,
    closingAck: text ?? ACK_TEXT,
    closingRemark: half === "second" ? remark : null,
  };
}

/** 固定の順番での次の質問のID。この回答で半分が終わるなら null */
function nextQuestionId(state: TrainingState): string | null {
  const { stage } = state;
  if (stage.name !== "first" && stage.name !== "second") return null;
  return planOf(state, stage.name).fallback;
}

function alreadyRedirected(answers: readonly Answer[], questionId: string): boolean {
  return answers.some((a) => a.questionId === questionId && a.kind === "redirected");
}

/**
 * /api/turn に送る内容（docs/phase2-decisions.md 項目4）。回答の原文と、その直前に画面に出した文。
 * 最後の入力が、いま答えたもの。関係のない話として質問し直した入力は、その後は送らない。
 * 聞き返しは半分の上限の前だけ、質問し直しは質問ごとに1回まで
 */
export function buildTurnRequest(state: TrainingState): TurnRequest | null {
  const last = state.answers[state.answers.length - 1];
  if (last === undefined) return null;
  const earlier = state.answers.slice(0, -1);
  return {
    inputs: state.answers
      .filter((a) => a.kind === "answer")
      .map((a) => ({ question_id: a.questionId, half: a.half, asked: a.prompt, text: a.text })),
    event: state.event,
    source: state.source,
    next_question_id: nextQuestionId(state),
    allow_clarify: countedAnswers(state.answers, last.half) < maxAnswersOf(last.half),
    allow_redirect: !alreadyRedirected(earlier, last.questionId),
  };
}

/** Claude の返事を受け取って、次の発言と段階を決める。値の範囲はブラウザでも確かめる */
function applyTurn(state: TrainingState, result: TurnResponse): TrainingState {
  const { stage } = state;
  if (stage.name !== "first" && stage.name !== "second") return state;
  const last = state.answers[state.answers.length - 1];
  const earlier = state.answers.slice(0, -1);

  const judged: TrainingState = {
    ...state,
    judgments: result.viewpoints,
    // 毎回それまでの回答をすべて送るので、最新の候補（無ければ null）をそのまま使う
    sourceGuess: result.source_guess,
    answers: [...earlier, { ...last, recall: result.recall }],
  };

  const { type, question_id, text } = result.next;
  if (type === "redirect" && question_id === last.questionId && !alreadyRedirected(earlier, last.questionId)) {
    return {
      ...judged,
      answers: [...earlier, { ...last, recall: result.recall, kind: "redirected" }],
      prompt: {
        questionId: last.questionId,
        text: text ?? REDIRECT_TEXTS[last.questionId] ?? last.prompt,
        type: "redirect",
      },
    };
  }
  if (
    type === "clarify" &&
    question_id === last.questionId &&
    countedAnswers(state.answers, stage.name) < maxAnswersOf(stage.name)
  ) {
    return {
      ...judged,
      prompt: {
        questionId: last.questionId,
        text: text ?? CLARIFY_TEXTS[last.questionId] ?? last.prompt,
        type: "clarify",
      },
    };
  }
  // 質問を進める。Claude が選んだゴールは、今選んでよいもの（planGoals の choices）のときだけ使う。
  // 半分を終えるのは、必ず聞くゴールが残っていないときだけ。どちらでもなければ、固定の順番の次の質問へ（文は使わない）
  const plan = planOf(state, stage.name);
  if (type === "ask" && question_id !== null && plan.choices.includes(question_id)) {
    return advance(judged, text, question_id);
  }
  if (type === "finish" && (plan.canFinish || plan.choices.length === 0)) {
    return {
      ...judged,
      stage: stage.name === "first" ? { name: "confirm" } : { name: "review" },
      prompt: null,
      closingAck: text ?? ACK_TEXT,
      closingRemark: stage.name === "second" ? result.remark : null,
    };
  }
  return advance(judged, null);
}

export function trainingReducer(
  state: TrainingState,
  action: TrainingAction,
): TrainingState {
  if (action.type === "stop") {
    return { ...state, waiting: false, stage: { name: "stopped", reason: "manual" } };
  }
  if (action.type === "restart") {
    return { ...initialState, session: state.session + 1 };
  }

  const { stage } = state;
  switch (action.type) {
    case "start": {
      if (stage.name !== "intro") return state;
      const first = firstHalfQuestions()[0];
      return {
        ...initialState,
        session: state.session,
        ai: state.ai,
        mode: action.mode ?? "2d",
        stage: { name: "first", index: 0 },
        prompt: askPrompt(first, null),
      };
    }

    case "answer": {
      const question = currentQuestion(state);
      if (question === null || state.waiting) return state;
      if (stage.name !== "first" && stage.name !== "second") return state;
      // 体調の訴えらしい入力では、回答として受け取らずに中断する。Claude に送る前に照合する（ADR-0011、項目10）
      const distress = detectDistress(action.text);
      if (distress !== null) {
        return { ...state, stage: { name: "stopped", reason: distress } };
      }
      if (!isAcceptableAnswer(action.text)) return state;

      const answers: Answer[] = [
        ...state.answers,
        {
          questionId: question.id,
          half: stage.name,
          text: action.text,
          prompt: state.prompt?.text ?? question.text,
          kind: "answer",
          recall: false,
        },
      ];
      if (state.ai === "on") {
        return { ...state, answers, waiting: true };
      }
      return advance({ ...state, answers }, null);
    }

    case "turn_result": {
      if (
        !state.waiting ||
        action.session !== state.session ||
        action.seq !== state.answers.length
      ) {
        return state;
      }
      const settled = { ...state, waiting: false };
      if (action.result === null) {
        // 失敗したら、その回の残りは固定の進行にし、判定は使わない（ADR-0012、項目9）
        return advance(
          {
            ...settled,
            ai: "failed",
            judgments: null,
            sourceGuess: null,
            failedAfter: state.answers.length,
          },
          null,
        );
      }
      // Claude の緊急の判定は補助。自傷のほのめかしには自傷用の案内を出す（ADR-0011）
      if (action.result.emergency !== "none") {
        return { ...settled, stage: { name: "stopped", reason: action.result.emergency } };
      }
      return applyTurn(settled, action.result);
    }

    case "confirm":
      if (stage.name !== "confirm") return state;
      return {
        ...state,
        source: action.source,
        event: selectEvent(action.source),
        stage: { name: "event" },
      };

    case "continue_after_event": {
      if (stage.name !== "event") return state;
      // 後半の最初は固定の立て直しの問い（ADR-0019）。Claude の言い回しにしない
      const opening = secondHalfQuestions(state.event ?? "handover")[0];
      return {
        ...state,
        stage: { name: "second", index: 0 },
        prompt: askPrompt(opening, null),
        closingAck: null,
      };
    }

    case "choose_prep":
      if (stage.name !== "review") return state;
      return {
        ...state,
        stage: { name: "done", action: action.action, timing: action.timing },
      };
  }
}
