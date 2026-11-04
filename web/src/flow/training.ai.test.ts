// Claude を使う進行の試験（Issue #15、docs/phase2-decisions.md、ADR-0025）。Claude の返事は作った値で渡す。

import { describe, expect, it } from "vitest";
import { ACK_TEXT, CLARIFY_TEXTS, REDIRECT_TEXTS } from "./content";
import {
  buildTurnRequest,
  countedAnswers,
  currentQuestion,
  initialState,
  trainingReducer,
  type TrainingAction,
  type TrainingState,
} from "./training";
import type { TurnResponse } from "./turnContract";

const online: TrainingState = { ...initialState, ai: "on" };

function run(actions: TrainingAction[], from = online): TrainingState {
  return actions.reduce(trainingReducer, from);
}

const answer = (text: string): TrainingAction => ({ type: "answer", text });

const judged = {
  location: "confirmed",
  alternative: "not_mentioned",
  current: "confirmed",
  unrecorded: "not_mentioned",
  proxy: "not_mentioned",
} as const;

function reply(
  next: TurnResponse["next"],
  extra: Partial<Omit<TurnResponse, "next">> = {},
): TurnResponse {
  return { emergency: "none", viewpoints: judged, next, recall: false, source_guess: null, ...extra };
}

/** いまの状態に対する Claude の返事を渡す */
function result(state: TrainingState, response: TurnResponse | null): TrainingAction {
  return { type: "turn_result", session: state.session, seq: state.answers.length, result: response };
}

const ask = (question_id: string, text: string | null = null): TurnResponse["next"] => ({
  type: "ask",
  question_id,
  text,
});

describe("Claude を使う進行", () => {
  it("回答すると返事を待ち、待っている間は次の回答を受け付けない", () => {
    const waiting = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    expect(waiting.waiting).toBe(true);
    expect(waiting.stage).toEqual({ name: "first", index: 0 });
    expect(trainingReducer(waiting, answer("もう一つ"))).toBe(waiting);
  });

  it("次へ進むときは、Claude の言い回し（検査を通ったもの）で次の固定の質問を出す", () => {
    const waiting = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    const next = trainingReducer(
      waiting,
      result(waiting, reply(ask("first_location", "その薬は、何で確かめられますか？"))),
    );
    expect(next.waiting).toBe(false);
    expect(next.stage).toEqual({ name: "first", index: 1 });
    expect(next.prompt).toEqual({
      questionId: "first_location",
      text: "その薬は、何で確かめられますか？",
      type: "ask",
    });
    expect(next.judgments).toEqual(judged);
  });

  it("文が無いときや、次の質問と違うIDの文は使わず、固定文を出す", () => {
    const waiting = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    const noText = trainingReducer(waiting, result(waiting, reply(ask("first_location"))));
    // Claude の文が使えないときは、固定の受け止めの一言と固定の質問文（ADR-0029 の3）
    expect(noText.prompt?.text).toBe(ACK_TEXT + currentQuestion(noText)?.text);
    const wrongId = trainingReducer(
      waiting,
      result(waiting, reply(ask("second_proxy", "別の質問"))),
    );
    expect(wrongId.prompt?.text).toBe(ACK_TEXT + currentQuestion(wrongId)?.text);
  });

  it("半分の最後は、Claude の受け止めを③確認の冒頭に出し、無ければ固定の一言を出す（ADR-0029 の2）", () => {
    let state = run([{ type: "start" }]);
    for (const [text, next] of [
      ["A薬", ask("first_location")],
      ["手帳", ask("first_other")],
    ] as const) {
      state = trainingReducer(state, answer(text));
      state = trainingReducer(state, result(state, reply(next)));
    }
    state = trainingReducer(state, answer("ない"));
    const withAck = trainingReducer(
      state,
      result(state, reply({ type: "finish", question_id: null, text: "ありがとうございます。よく分かりました。" })),
    );
    expect(withAck.stage).toEqual({ name: "confirm" });
    expect(withAck.closingAck).toBe("ありがとうございます。よく分かりました。");
    const withoutAck = trainingReducer(
      state,
      result(state, reply({ type: "finish", question_id: null, text: null })),
    );
    expect(withoutAck.closingAck).toBe(ACK_TEXT);
  });

  it("失敗したときは、その回答の位置を覚えて、知らせを1回だけ出せるようにする（ADR-0029 の4）", () => {
    let state = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    state = trainingReducer(state, result(state, null));
    expect(state.failedAfter).toBe(1);
    expect(state.prompt?.text).toBe(ACK_TEXT + currentQuestion(state)?.text);
    state = trainingReducer(state, answer("手帳です"));
    expect(state.failedAfter).toBe(1);
  });

  it("失敗したら、その回の残りは固定の進行にし、判定を使わない（F1〜F3）", () => {
    let state = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    state = trainingReducer(state, result(state, reply(ask("first_location"))));
    state = trainingReducer(state, answer("お薬手帳です"));
    state = trainingReducer(state, result(state, null));
    expect(state.ai).toBe("failed");
    expect(state.judgments).toBeNull();
    expect(state.stage).toEqual({ name: "first", index: 2 });
    // 以後は待たずに進む。回答は失わない
    state = trainingReducer(state, answer("ありません"));
    expect(state.waiting).toBe(false);
    expect(state.stage).toEqual({ name: "confirm" });
    expect(state.answers.map((a) => a.text)).toEqual(["A薬を朝に1錠", "お薬手帳です", "ありません"]);
  });

  it("前の回や古い返事は使わない", () => {
    const waiting = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    const stale = { ...result(waiting, null), session: waiting.session - 1 };
    expect(trainingReducer(waiting, stale)).toBe(waiting);
    const old = { ...result(waiting, null), seq: 0 };
    expect(trainingReducer(waiting, old)).toBe(waiting);
  });

  it("待っている間にやめたら、届いた返事を使わない", () => {
    const waiting = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    const stopped = trainingReducer(waiting, { type: "stop" });
    expect(trainingReducer(stopped, result(waiting, null))).toBe(stopped);
  });

  it("やり直した後に届いた前の回の返事は使わない", () => {
    const waiting = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    const again = run([{ type: "restart" }, { type: "start" }, answer("B薬")], waiting);
    expect(trainingReducer(again, result(waiting, null))).toBe(again);
  });

  it("Claude が体調の訴えを見つけたら中断する（補助。ADR-0011）", () => {
    const waiting = run([{ type: "start" }, answer("ちょっと待って")]);
    const next = trainingReducer(
      waiting,
      result(waiting, reply(ask("first_location"), { emergency: "symptom" })),
    );
    expect(next.stage).toEqual({ name: "stopped", reason: "symptom" });
  });

  it("Claude が自傷のほのめかしを見つけたら、自傷用の案内で中断する（ADR-0011）", () => {
    const waiting = run([{ type: "start" }, answer("もう全部どうでもいい")]);
    const next = trainingReducer(
      waiting,
      result(waiting, reply(ask("first_location"), { emergency: "self_harm" })),
    );
    expect(next.stage).toEqual({ name: "stopped", reason: "self_harm" });
  });

  it("語の照合で中断するときは、Claude に送らない（項目10）", () => {
    const state = run([{ type: "start" }, answer("今、胸が苦しい")]);
    expect(state.stage).toEqual({ name: "stopped", reason: "symptom" });
    expect(state.waiting).toBe(false);
    expect(state.answers).toHaveLength(0);
  });

  it("関係のない話は回数に数えず、同じ質問を質問し直す。2回目はそのまま回答として受け取る（S19）", () => {
    let state = run([{ type: "start" }, answer("今日はいい天気ですね")]);
    state = trainingReducer(
      state,
      result(state, reply({ type: "redirect", question_id: "first_medicines", text: null })),
    );
    expect(state.answers[0].kind).toBe("redirected");
    expect(state.stage).toEqual({ name: "first", index: 0 });
    expect(state.prompt?.type).toBe("redirect");
    expect(state.prompt?.text).toBe(REDIRECT_TEXTS.first_medicines);
    expect(countedAnswers(state.answers, "first")).toBe(0);

    state = trainingReducer(state, answer("お昼は何を食べようかな"));
    const request = buildTurnRequest(state);
    expect(request?.allow_redirect).toBe(false);
    // 質問し直した入力は、その後のやり取りでは送らない
    expect(request?.inputs.map((i) => i.text)).toEqual(["お昼は何を食べようかな"]);
    expect(request?.inputs[0].asked).toBe(REDIRECT_TEXTS.first_medicines);
    state = trainingReducer(
      state,
      result(state, reply({ type: "redirect", question_id: "first_medicines", text: null })),
    );
    expect(state.answers[1].kind).toBe("answer");
    expect(state.stage).toEqual({ name: "first", index: 1 });
  });

  it("聞き返しへの回答は回数に数え、半分の上限を超えては聞き返さない", () => {
    let state = run([{ type: "start" }, answer("うーん")]);
    const firstText = state.prompt?.text;
    state = trainingReducer(
      state,
      result(state, reply({ type: "clarify", question_id: "first_medicines", text: null })),
    );
    expect(state.prompt).toEqual({
      questionId: "first_medicines",
      text: CLARIFY_TEXTS.first_medicines,
      type: "clarify",
    });
    expect(state.stage).toEqual({ name: "first", index: 0 });

    state = trainingReducer(state, answer("A薬を朝に1錠"));
    state = trainingReducer(state, result(state, reply(ask("first_location"))));
    const locationText = state.prompt?.text;
    state = trainingReducer(state, answer("たぶん手帳"));
    expect(buildTurnRequest(state)?.allow_clarify).toBe(false);
    expect(buildTurnRequest(state)?.next_question_id).toBeNull();
    // 3回目の回答の後に聞き返しが来ても、確認へ進む
    state = trainingReducer(
      state,
      result(state, reply({ type: "clarify", question_id: "first_location", text: null })),
    );
    expect(state.stage).toEqual({ name: "confirm" });
    expect(state.answers.map((a) => a.prompt)).toEqual([
      firstText,
      CLARIFY_TEXTS.first_medicines,
      locationText,
    ]);
  });

  it("思い出せないという回答に印を付け、③確認の初期選択の候補を持つ", () => {
    let state = run([{ type: "start" }, answer("名前は覚えていない")]);
    state = trainingReducer(
      state,
      result(state, reply(ask("first_location"), { recall: true, source_guess: "notebook" })),
    );
    expect(state.answers[0].recall).toBe(true);
    expect(state.sourceGuess).toBe("notebook");
  });

  it("③確認の候補は、最新の返事で置き換える（候補が無くなったら選ばない）", () => {
    let state = run([{ type: "start" }, answer("手帳です")]);
    state = trainingReducer(state, result(state, reply(ask("first_location"), { source_guess: "notebook" })));
    expect(state.sourceGuess).toBe("notebook");
    state = trainingReducer(state, answer("やっぱり家族が知っています"));
    state = trainingReducer(state, result(state, reply(ask("first_other"), { source_guess: null })));
    expect(state.sourceGuess).toBeNull();
  });

  it("後半の最初は、Claude を使っていても固定の立て直しの問いにする（ADR-0019）", () => {
    let state = run([{ type: "start" }]);
    const steps: [string, TurnResponse["next"]][] = [
      ["A薬", ask("first_location")],
      ["手帳", ask("first_other")],
      ["ない", { type: "finish", question_id: null, text: null }],
    ];
    for (const [text, next] of steps) {
      state = trainingReducer(state, answer(text));
      state = trainingReducer(state, result(state, reply(next)));
    }
    expect(state.stage).toEqual({ name: "confirm" });
    state = run([{ type: "confirm", source: "notebook" }, { type: "continue_after_event" }], state);
    expect(state.prompt).toEqual({
      questionId: "second_recovery",
      text: currentQuestion(state)?.text,
      type: "ask",
    });
  });

  it("送る内容は、これまでの回答と画面に出した文、出来事・選んだ情報源・次の質問だけ（項目4）", () => {
    const state = run([{ type: "start" }, answer("A薬を朝に1錠")]);
    expect(buildTurnRequest(state)).toEqual({
      inputs: [
        {
          question_id: "first_medicines",
          half: "first",
          asked: currentQuestion(state)?.text,
          text: "A薬を朝に1錠",
        },
      ],
      event: null,
      source: null,
      next_question_id: "first_location",
      allow_clarify: true,
      allow_redirect: true,
    });
  });
});
