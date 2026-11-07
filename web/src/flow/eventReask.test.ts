// 出来事の後の固定文の聞き返しの試験（Issue #246、ADR-0016 の追記）。Claude の返事は作った値で渡す。

import { describe, expect, it } from "vitest";
import { listenerSpeech } from "../voice/speech";
import { EVENT_REASK } from "./content";
import { detectDistress } from "./emergency";
import { needsEventReask } from "./rules";
import {
  buildTurnRequest,
  countedAnswers,
  initialState,
  trainingReducer,
  type TrainingAction,
  type TrainingState,
} from "./training";
import { MAX_PROMPT_LENGTH, type TurnResponse } from "./turnContract";
import type { EventId, SourceId } from "./types";

const answer = (text: string): TrainingAction => ({ type: "answer", text });

function run(actions: TrainingAction[], from: TrainingState): TrainingState {
  return actions.reduce(trainingReducer, from);
}

/** Claude を使わない進行で、出来事の後の「代わりの手段」の問いまで進める */
function toRecovery(source: SourceId | null, from: TrainingState = { ...initialState, ai: "off" }): TrainingState {
  if (from.ai === "on") {
    let state = run([{ type: "start" }], from);
    for (const [text, next] of [
      ["A薬を朝に1錠", "first_location"],
      ["お薬手帳", "first_other"],
      ["ありません", "first_unrecorded"],
    ] as const) {
      state = trainingReducer(state, answer(text));
      state = trainingReducer(state, result(state, reply({ type: "ask", question_id: next, text: null })));
    }
    state = trainingReducer(state, answer("ないです"));
    state = trainingReducer(state, result(state, reply({ type: "finish", question_id: null, text: null })));
    return run([{ type: "confirm", source }, { type: "continue_after_event" }], state);
  }
  return run(
    [
      { type: "start" },
      answer("A薬を朝に1錠"),
      answer("お薬手帳"),
      answer("ありません"),
      answer("ないです"),
      { type: "confirm", source },
      { type: "continue_after_event" },
    ],
    from,
  );
}

const judged = {
  location: "confirmed",
  alternative: "not_mentioned",
  current: "confirmed",
  unrecorded: "confirmed",
  proxy: "not_mentioned",
} as const;

function reply(next: TurnResponse["next"]): TurnResponse {
  return { emergency: "none", viewpoints: judged, next, recall: false, source_guess: null, remark: null };
}

function result(state: TrainingState, response: TurnResponse | null): TrainingAction {
  return { type: "turn_result", session: state.session, seq: state.answers.length, result: response };
}

describe("needsEventReask（使えなくなった手段に頼る回答か）", () => {
  it("通信断の後に「家族に電話して聞く」は聞き返す", () => {
    expect(needsEventReask("network", "家族に電話して聞く")).toBe(true);
    expect(needsEventReask("network", "マイナポータルで見ます")).toBe(true);
  });

  it("使えない手段を否定して別の手段を挙げた回答は止めない", () => {
    expect(needsEventReask("network", "電話は使えないので、紙の手帳を見せる")).toBe(false);
    expect(needsEventReask("network", "電話がつながらなくても、薬の袋がある")).toBe(false);
    expect(needsEventReask("battery", "スマホは切れているので、覚えている範囲で話します")).toBe(false);
  });

  it("使えなくなった手段の言葉が無い回答は止めない", () => {
    expect(needsEventReask("network", "救護所の人に薬の袋を見せます")).toBe(false);
    expect(needsEventReask("family_unreachable", "大丈夫です、自分で話せます")).toBe(false);
  });

  it("別の手段の言葉でも、直後に使えなくなった手段が続くもの（「お薬手帳アプリ」）は別の手段に数えない", () => {
    expect(needsEventReask("battery", "お薬手帳アプリを見せます")).toBe(true);
    // 自宅にお薬手帳があるときは、スマホのアプリは別の手段
    expect(needsEventReask("notebook_home", "お薬手帳アプリを見せます")).toBe(false);
    expect(needsEventReask("notebook_home", "お薬手帳を見せます")).toBe(true);
  });

  it("出来事ごとの言葉で聞き返す（電池切れ・家族・かかりつけ）", () => {
    expect(needsEventReask("battery", "スマホの写真を見せます")).toBe(true);
    expect(needsEventReask("family_unreachable", "妻に聞いてもらいます")).toBe(true);
    expect(needsEventReask("clinic_unreachable", "かかりつけの薬局に問い合わせます")).toBe(true);
  });

  it("係の交代と、出来事が無いときは聞き返さない", () => {
    expect(needsEventReask("handover", "家族に電話して聞く")).toBe(false);
    expect(needsEventReask(null, "家族に電話して聞く")).toBe(false);
  });
});

describe("固定の聞き返しの文（Claude Code の下書き）", () => {
  const texts = Object.entries(EVENT_REASK).filter(
    (e): e is [EventId, NonNullable<(typeof EVENT_REASK)[EventId]>] => e[1] !== null,
  );

  it("係の交代のほかの5つの出来事に1つずつある", () => {
    expect(texts.map(([id]) => id).sort()).toEqual(
      ["battery", "clinic_unreachable", "family_unreachable", "network", "notebook_home"].sort(),
    );
    expect(EVENT_REASK.handover).toBeNull();
  });

  it("数字・体調の訴えの語を含まず、送れる文の長さに収まる", () => {
    for (const [, r] of texts) {
      expect(r.text).not.toMatch(/[0-9０-９]/);
      expect(detectDistress(r.text)).toBeNull();
      expect(r.text.length).toBeLessThanOrEqual(MAX_PROMPT_LENGTH);
    }
  });
});

describe("出来事の後の固定の聞き返し（訓練の進行）", () => {
  it("Claude を使わない進行：通信断の後に「家族に電話して聞く」で固定文を1回出し、次の回答で先へ進む", () => {
    let state = toRecovery("online");
    expect(state.event).toBe("network");
    expect(state.prompt?.questionId).toBe("second_recovery");
    state = trainingReducer(state, answer("家族に電話して聞く"));
    expect(state.stage).toEqual({ name: "second", index: 0 });
    expect(state.prompt).toEqual({ questionId: "second_recovery", text: EVENT_REASK.network?.text, type: "clarify" });
    // 止めた入力は原文のまま残し、回答の回数に数えない
    expect(state.answers.at(-1)).toMatchObject({ text: "家族に電話して聞く", kind: "event_reasked" });
    expect(countedAnswers(state.answers, "second")).toBe(0);
    // 聞き返しへの回答で先へ進む。2回目は同じ言葉でも聞き返さない
    state = trainingReducer(state, answer("やっぱり電話で聞きます"));
    expect(state.prompt?.questionId).toBe("second_recent");
    expect(state.answers.at(-1)).toMatchObject({ kind: "answer", prompt: EVENT_REASK.network?.text });
    expect(state.answers.filter((a) => a.kind === "event_reasked")).toHaveLength(1);
  });

  it("「電話は使えないので、紙の手帳を見せる」は止めない", () => {
    let state = toRecovery("online");
    state = trainingReducer(state, answer("電話は使えないので、紙の手帳を見せる"));
    expect(state.prompt?.questionId).toBe("second_recent");
    expect(state.answers.some((a) => a.kind === "event_reasked")).toBe(false);
  });

  it("係の交代の回では聞き返さない", () => {
    let state = toRecovery(null);
    expect(state.event).toBe("handover");
    state = trainingReducer(state, answer("家族に電話して聞く"));
    expect(state.answers.some((a) => a.kind === "event_reasked")).toBe(false);
  });

  it("Claude を使う進行：Claude を呼ばずに固定文を出し、止めた入力は Claude に送らない", () => {
    let state = toRecovery("online", { ...initialState, ai: "on" });
    expect(state.event).toBe("network");
    state = trainingReducer(state, answer("家族に電話して聞く"));
    // 返事を待たない（Claude を呼ばない）
    expect(state.waiting).toBe(false);
    expect(state.prompt).toEqual({ questionId: "second_recovery", text: EVENT_REASK.network?.text, type: "clarify" });
    // 3D の読み上げも同じ固定文を読む
    expect(listenerSpeech({ ...state, mode: "3d" })).toBe(EVENT_REASK.network?.text);
    // 次の回答は Claude に送る。止めた入力は送らず、回数にも数えない
    state = trainingReducer(state, answer("紙のお薬手帳を見せます"));
    expect(state.waiting).toBe(true);
    const request = buildTurnRequest(state);
    const second = request?.inputs.filter((i) => i.half === "second") ?? [];
    expect(second).toEqual([
      { question_id: "second_recovery", half: "second", asked: EVENT_REASK.network?.text, text: "紙のお薬手帳を見せます" },
    ]);
    expect(request?.allow_clarify).toBe(true);
    expect(request?.next_question_id).toBe("second_recent");
    state = trainingReducer(state, result(state, reply({ type: "ask", question_id: "second_recent", text: null })));
    expect(state.prompt?.questionId).toBe("second_recent");
  });

  it("やり直すと、次の訓練ではまた1回聞き返せる", () => {
    let state = toRecovery("online");
    state = trainingReducer(state, answer("家族に電話して聞く"));
    state = trainingReducer(state, { type: "restart" });
    state = toRecovery("online", state);
    state = trainingReducer(state, answer("家族に電話して聞く"));
    expect(state.prompt?.type).toBe("clarify");
    expect(state.prompt?.text).toBe(EVENT_REASK.network?.text);
  });
});
