import { describe, expect, it } from "vitest";
import { MAX_ANSWERS } from "./rules";
import {
  currentQuestion,
  initialState,
  trainingReducer,
  type TrainingAction,
  type TrainingState,
} from "./training";
import type { SourceId } from "./types";

/** Claude を使わない固定の進行（AI_CONNECTED=false、または失敗の後と同じ流れ） */
const offline: TrainingState = { ...initialState, ai: "off" };

function run(actions: TrainingAction[], from = offline): TrainingState {
  return actions.reduce(trainingReducer, from);
}

const answer = (text: string): TrainingAction => ({ type: "answer", text });
const firstHalf: TrainingAction[] = [
  { type: "start" },
  answer("お薬手帳です"),
  answer("たぶん同じです"),
  answer("特にありません"),
];

describe("訓練の流れ", () => {
  it("前半の3回の後は③確認へ進む", () => {
    expect(run(firstHalf).stage).toEqual({ name: "confirm" });
  });

  it("確認で選んだ情報源から出来事を選び、後半は立て直しの問いから始まる", () => {
    const state = run([
      ...firstHalf,
      { type: "confirm", source: "smartphone" },
    ]);
    expect(state.stage).toEqual({ name: "event" });
    expect(state.event).toBe("battery");

    const second = trainingReducer(state, { type: "continue_after_event" });
    expect(currentQuestion(second)?.id).toBe("second_recovery");
  });

  it("選ばずに進んだら係の交代になり、交代用の問いから始まる", () => {
    const state = run([
      ...firstHalf,
      { type: "confirm", source: null },
      { type: "continue_after_event" },
    ]);
    expect(state.event).toBe("handover");
    expect(currentQuestion(state)?.id).toBe("second_handover");
  });

  it.each<SourceId>(["smartphone", "online", "notebook", "family", "clinic", "none"])(
    "%s を選んだときも最後まで通せる",
    (source) => {
      const state = run([
        ...firstHalf,
        { type: "confirm", source },
        { type: "continue_after_event" },
        answer("紙のメモがあります"),
        answer("妻が知っています"),
        answer("ありません"),
      ]);
      expect(state.stage).toEqual({ name: "review" });
      expect(state.answers).toHaveLength(MAX_ANSWERS);
    },
  );

  it("上限に達した後の回答は受け付けない", () => {
    const review = run([
      ...firstHalf,
      { type: "confirm", source: "family" },
      { type: "continue_after_event" },
      answer("a"),
      answer("b"),
      answer("c"),
    ]);
    const after = trainingReducer(review, answer("さらに追加"));
    expect(after).toBe(review);
  });

  it("確認のタップは回答の回数に数えない", () => {
    const state = run([...firstHalf, { type: "confirm", source: "notebook" }]);
    expect(state.answers).toHaveLength(3);
  });

  it("回答は入力そのものを保持し、前半と後半を区別する", () => {
    const raw = "  手帳は台所の引き出し。\n最近変わった気がする  ";
    const state = run([{ type: "start" }, answer(raw)]);
    expect(state.answers[0]).toMatchObject({
      questionId: "first_medicines",
      half: "first",
      text: raw,
      kind: "answer",
      recall: false,
    });
  });

  it("空白だけの回答では進まない", () => {
    const started = run([{ type: "start" }]);
    expect(trainingReducer(started, answer("   "))).toBe(started);
  });

  it("準備行動を選ぶと終わる", () => {
    const review = run([
      ...firstHalf,
      { type: "confirm", source: "clinic" },
      { type: "continue_after_event" },
      answer("a"),
      answer("b"),
      answer("c"),
    ]);
    const done = trainingReducer(review, {
      type: "choose_prep",
      action: "wallet_memo",
      timing: "today",
    });
    expect(done.stage).toEqual({ name: "done", action: "wallet_memo", timing: "today" });
  });
});

describe("中断とやり直し", () => {
  it.each<[string, TrainingAction[]]>([
    ["はじめに", []],
    ["前半", [{ type: "start" }]],
    ["確認", firstHalf],
    ["出来事", [...firstHalf, { type: "confirm", source: "online" }]],
    [
      "後半",
      [...firstHalf, { type: "confirm", source: "online" }, { type: "continue_after_event" }],
    ],
  ])("%s から中断できる", (_label, actions) => {
    const stopped = trainingReducer(run(actions), { type: "stop" });
    expect(stopped.stage).toEqual({ name: "stopped", reason: "manual" });
  });

  it("中断した後は回答を受け付けない", () => {
    const stopped = run([{ type: "start" }, { type: "stop" }]);
    expect(trainingReducer(stopped, answer("続き"))).toBe(stopped);
  });
});

describe("体調の訴えらしい入力での中断（ADR-0011）", () => {
  it("前半の回答で体調の訴えがあれば中断し、その回答は受け取らない（E1）", () => {
    const state = run([{ type: "start" }, answer("お薬手帳です"), answer("今、胸が苦しい")]);
    expect(state.stage).toEqual({ name: "stopped", reason: "symptom" });
    expect(state.answers.map((a) => a.text)).toEqual(["お薬手帳です"]);
  });

  it("後半の「飲めていますか」に「飲めていない、今つらい」で中断する（E8）", () => {
    const state = run([
      ...firstHalf,
      { type: "confirm", source: "notebook" },
      { type: "continue_after_event" },
      answer("スマホの写真で見せます"),
      answer("飲めていない、今つらい"),
    ]);
    expect(state.stage).toEqual({ name: "stopped", reason: "symptom" });
  });

  it("自傷のほのめかしでは自傷用の理由で中断する（E5）", () => {
    const state = run([{ type: "start" }, answer("もう消えてしまいたい")]);
    expect(state.stage).toEqual({ name: "stopped", reason: "self_harm" });
  });

  it("自動で中断した後は回答を受け付けない", () => {
    const stopped = run([{ type: "start" }, answer("頭が痛い")]);
    expect(trainingReducer(stopped, answer("A薬を朝に1錠"))).toBe(stopped);
  });

  it("文字数の上限を超える回答でも、訴えがあれば中断する", () => {
    const state = run([{ type: "start" }, answer("あ".repeat(600) + "息ができない")]);
    expect(state.stage).toEqual({ name: "stopped", reason: "symptom" });
  });

  it("想定の話（E6）や過去の話（E9）では中断しない", () => {
    const state = run([
      { type: "start" },
      answer("もし薬が切れたら困る"),
      answer("お薬手帳です"),
      answer("以前、具合が悪くなった薬はない"),
    ]);
    expect(state.stage).toEqual({ name: "confirm" });
  });

  it("やり直すと回答も出来事も消える", () => {
    const state = run([
      ...firstHalf,
      { type: "confirm", source: "smartphone" },
      { type: "restart" },
    ]);
    expect(state).toEqual({ ...initialState, session: 1 });
  });
});

describe("段階に合わない操作は無視する", () => {
  it("確認の前に出来事は起きない", () => {
    const started = run([{ type: "start" }]);
    expect(trainingReducer(started, { type: "confirm", source: "family" })).toBe(started);
  });

  it("訓練中に start しても最初に戻らない", () => {
    const started = run([{ type: "start" }, answer("x")]);
    expect(trainingReducer(started, { type: "start" })).toBe(started);
  });
});
