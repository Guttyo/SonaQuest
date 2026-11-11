import { RECHECK_CLOSING } from "./content";
// 聞き取りのゴールの決まり（Issue #200、ADR-0025 の B）。ブラウザと Workers が同じ planGoals を使う

import { describe, expect, it } from "vitest";
import { ACK_TEXT } from "./content";
import { FOLLOWUP_LIMIT, MAX_FIRST_HALF_ANSWERS, planGoals } from "./rules";
import { initialState, trainingReducer, type TrainingAction, type TrainingState } from "./training";
import type { TurnResponse } from "./turnContract";

describe("planGoals（前半）", () => {
  it("1問目の後は、前半の残りのゴールと掘り下げを選べる。固定の順番は今までどおり", () => {
    expect(planGoals(["first_medicines"], "first", null)).toEqual({
      choices: ["first_location", "first_other", "first_unrecorded", "first_medicines_more"],
      fallback: "first_location",
      canFinish: false,
    });
  });

  it("必ず聞くゴールを聞き終えるまで、前半は終えられない。聞き終えたら固定の進行は③確認へ", () => {
    expect(planGoals(["first_medicines", "first_location", "first_other"], "first", null).canFinish).toBe(false);
    const done = planGoals(["first_medicines", "first_location", "first_other", "first_unrecorded"], "first", null);
    expect(done).toEqual({ choices: ["first_medicines_more"], fallback: null, canFinish: true });
  });

  it(`掘り下げは ${FOLLOWUP_LIMIT} 回まで`, () => {
    const asked = ["first_medicines", ...Array(FOLLOWUP_LIMIT).fill("first_medicines_more")];
    expect(planGoals(asked, "first", null).choices).not.toContain("first_medicines_more");
  });

  it("残りの回数で必ず聞くゴールを聞ききれないときは、掘り下げを出さない", () => {
    // 5回のうち2回使い、必ず聞くゴールが3つ残る
    const plan = planGoals(["first_medicines", "first_medicines_more"], "first", null);
    expect(plan.choices).toEqual(["first_location", "first_other", "first_unrecorded"]);
  });

  it("回数の上限に達したら、半分を終える", () => {
    const asked = Array(MAX_FIRST_HALF_ANSWERS).fill("first_medicines");
    expect(planGoals(asked, "first", null)).toEqual({ choices: [], fallback: null, canFinish: true });
  });
});

describe("planGoals（後半）", () => {
  it("立て直しの後は、記録の新しさと代わりに伝えられる人が必ず聞くゴール。思い出せなかったことは聞かない（2026-11-07）", () => {
    expect(planGoals(["second_recovery"], "second", "battery")).toEqual({
      choices: ["second_recent", "second_proxy"],
      fallback: "second_recent",
      canFinish: false,
    });
  });

  it("家族と連絡がつかない出来事の後は、家族のほかの人を聞く", () => {
    expect(planGoals(["second_recovery"], "second", "family_unreachable").choices).toContain("second_proxy_other");
  });

  it("必ず聞くゴールを聞き終えたら、後半を終える（思い出せなかったことは聞かず、終わりの固定文で促す。2026-11-07）", () => {
    expect(planGoals(["second_recovery", "second_recent", "second_proxy"], "second", "battery")).toEqual({
      choices: [],
      fallback: null,
      canFinish: true,
    });
  });
});

// --- 画面の進行 -------------------------------------------------------------

const judged = {
  location: "confirmed",
  alternative: "not_mentioned",
  current: "confirmed",
  unrecorded: "not_mentioned",
  proxy: "not_mentioned",
} as const;

const reply = (next: TurnResponse["next"], remark: string | null = null): TurnResponse => ({
  emergency: "none",
  viewpoints: judged,
  next,
  recall: false,
  source_guess: null,
  remark,
});

const result = (state: TrainingState, response: TurnResponse | null): TrainingAction => ({
  type: "turn_result",
  session: state.session,
  seq: state.answers.length,
  result: response,
});

function answerWith(state: TrainingState, response: TurnResponse): TrainingState {
  const waiting = trainingReducer(state, { type: "answer", text: "架空の回答です" });
  return trainingReducer(waiting, result(waiting, response));
}

const started = trainingReducer({ ...initialState, ai: "on" }, { type: "start" });

describe("Claude が選んだゴールで進む（Issue #200）", () => {
  it("掘り下げを選んだら、その質問と Claude の文を出す", () => {
    const s = answerWith(started, reply({ type: "ask", question_id: "first_medicines_more", text: "はい。ほかにも、使っている薬はありますか？" }));
    expect(s.prompt).toMatchObject({ questionId: "first_medicines_more", text: "はい。ほかにも、使っている薬はありますか？", type: "ask" });
    expect(s.stage).toEqual({ name: "first", index: 1 });
  });

  it("固定の順番と違うゴールでも、今選んでよいものなら使う", () => {
    const s = answerWith(started, reply({ type: "ask", question_id: "first_unrecorded", text: "はい。薬のアレルギーや、薬が合わなかったことはありますか？" }));
    expect(s.prompt?.questionId).toBe("first_unrecorded");
  });

  it("今選べないゴール（後半の質問など）は使わず、固定の順番の次の質問を固定文で出す", () => {
    const s = answerWith(started, reply({ type: "ask", question_id: "second_proxy", text: "代わりに伝えられる人は？" }));
    expect(s.prompt?.questionId).toBe("first_location");
    expect(s.prompt?.text).not.toContain("代わりに伝えられる人は？");
  });

  it("必ず聞くゴールが残っているのに終えようとしたら、固定の順番の次の質問へ", () => {
    const s = answerWith(started, reply({ type: "finish", question_id: null, text: "ありがとうございます。" }));
    expect(s.stage.name).toBe("first");
    expect(s.prompt?.questionId).toBe("first_location");
  });

  it("後半を終えるときだけ、Claude の一言を振り返りに持つ", () => {
    let s = started;
    for (const id of ["first_location", "first_other", "first_unrecorded"]) {
      s = answerWith(s, reply({ type: "ask", question_id: id, text: null }));
    }
    // 前半の最後に一言が来ても、前半では持たない
    s = answerWith(s, reply({ type: "finish", question_id: null, text: null }, "前半の一言"));
    expect(s.stage.name).toBe("confirm");
    expect(s.closingRemark).toBeNull();
    s = trainingReducer(s, { type: "confirm", source: "smartphone" });
    s = trainingReducer(s, { type: "continue_after_event" });
    for (const id of ["second_recent", "second_proxy"]) {
      s = answerWith(s, reply({ type: "ask", question_id: id, text: null }));
    }
    s = answerWith(s, reply({ type: "finish", question_id: null, text: null }, "代わりに伝える人は、まだ考える余地がありそうです。"));
    expect(s.stage.name).toBe("review");
    expect(s.closingAck).toBe(ACK_TEXT + RECHECK_CLOSING);
    expect(s.closingRemark).toBe("代わりに伝える人は、まだ考える余地がありそうです。");
  });

  it("Claude が失敗したら、その回の残りは固定の順番で最後まで進む（ADR-0012）", () => {
    const waiting = trainingReducer(started, { type: "answer", text: "架空の回答です" });
    let s = trainingReducer(waiting, result(waiting, null));
    expect(s.ai).toBe("failed");
    expect(s.prompt?.questionId).toBe("first_location");
    for (const expected of ["first_other", "first_unrecorded"]) {
      s = trainingReducer(s, { type: "answer", text: "架空の回答です" });
      expect(s.prompt?.questionId).toBe(expected);
    }
    s = trainingReducer(s, { type: "answer", text: "架空の回答です" });
    expect(s.stage.name).toBe("confirm");
  });
});

describe("振り返りの一言の読み上げ（3D）", () => {
  it("受け止めの後に一言を続けて読み上げる", async () => {
    const { reviewSpeech } = await import("../voice/speech");
    const text = reviewSpeech({
      ...initialState,
      ai: "on",
      stage: { name: "review" },
      judgments: judged,
      closingAck: "ありがとうございます。",
      closingRemark: "代わりに伝える人は、まだ考える余地がありそうです。",
    });
    expect(text?.startsWith("ありがとうございます。代わりに伝える人は、まだ考える余地がありそうです。")).toBe(true);
  });
});
