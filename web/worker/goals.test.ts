// Workers でのゴールの確かめと、振り返りの一言の検査（Issue #200、ADR-0025 の B）

import { describe, expect, it, vi } from "vitest";
import { MEDICINES_FOLLOWUP_QUESTION } from "../src/flow/content";
import type { TurnRequest } from "../src/flow/turnContract";
import type { Audit, AuditResult } from "./audit";
import type { CallClaude, ClaudeResult } from "./claude";
import { buildUserMessage } from "./prompt";
import { REMARK_PURPOSE, chooseNext, followsGoalRules, parseClaudeOutput, runTurn, type ClaudeOutput } from "./turn";

const input = (question_id: string, half: "first" | "second" = "first", text = "架空の回答です") => ({
  question_id,
  half,
  asked: "固定の質問",
  text,
});

const afterFirst: TurnRequest = {
  inputs: [input("first_medicines", "first", "胃腸の薬を朝に")],
  event: null,
  source: null,
  next_question_id: "first_location",
  allow_clarify: true,
  allow_redirect: true,
};

const secondDone: TurnRequest = {
  inputs: [
    ...["first_medicines", "first_location", "first_other", "first_unrecorded"].map((id) => input(id)),
    ...["second_recovery", "second_recent", "second_proxy"].map((id) => input(id, "second", "姉の美香に電話します")),
  ],
  event: "battery",
  source: "smartphone",
  next_question_id: null,
  allow_clarify: true,
  allow_redirect: true,
};

const output: ClaudeOutput = {
  emergency: "none",
  viewpoints: {
    location: "confirmed",
    alternative: "confirmed",
    current: "confirmed",
    unrecorded: "not_mentioned",
    proxy: "confirmed",
  },
  next_type: "ask",
  next_goal_id: "first_medicines_more",
  text: "はい。ほかにも、使っている薬はありますか？",
  closing_remark: null,
  recall: false,
  source_guess: null,
};

const ok = (value: unknown): ClaudeResult => ({
  ok: true,
  value,
  raw: JSON.stringify(value),
  servedBy: "claude-opus-5-5",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});
const fake = (value: unknown): CallClaude => async () => ok(value);
const passed: AuditResult = {
  ok: true,
  pass: true,
  category: null,
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  servedBy: "claude-haiku-5-5",
};

describe("Claude の出力のゴール", () => {
  it("閉じた一覧に無いゴールは、出力ごと拒否する（ADR-0015）", () => {
    expect(parseClaudeOutput({ ...output, next_goal_id: "ask_disease" })).toBeNull();
    expect(parseClaudeOutput({ ...output, closing_remark: 3 })).toBeNull();
    expect(parseClaudeOutput(output)).not.toBeNull();
  });
});

describe("chooseNext（ゴールの確かめ）", () => {
  it("今選んでよいゴールなら、その質問と Claude の文を使う", () => {
    expect(chooseNext(afterFirst, output)).toEqual({
      next: { type: "ask", question_id: "first_medicines_more", text: output.text },
      rejected: null,
      overridden: null,
    });
  });

  it("今選べないゴールは、固定の順番の次の質問に戻し、文を使わない", () => {
    expect(chooseNext(afterFirst, { ...output, next_goal_id: "second_proxy" })).toEqual({
      next: { type: "ask", question_id: "first_location", text: null },
      rejected: null,
      overridden: "goal_not_allowed",
    });
  });

  it("必ず聞くゴールが残っているのに終えようとしたら、固定の順番の次の質問に戻す", () => {
    expect(chooseNext(afterFirst, { ...output, next_goal_id: null, text: "ありがとうございます。" })).toEqual({
      next: { type: "ask", question_id: "first_location", text: null },
      rejected: null,
      overridden: "finish_not_allowed",
    });
  });

  it("掘り下げの固定文（2026-11-07）を言い直した文は、「〜薬」の言葉も固定の文として通る。固定文は60字以内で、症状の語を含まない", () => {
    const reword = { ...output, text: "はい。貼り薬や目薬、注射薬なども含めて、ほかに使っているお薬はありますか？" };
    expect(chooseNext(afterFirst, reword).rejected).toBeNull();
    expect([...MEDICINES_FOLLOWUP_QUESTION.text].length).toBeLessThanOrEqual(60);
    expect(MEDICINES_FOLLOWUP_QUESTION.text).not.toContain("症状");
  });

  it("聞き返しは、ゴールに関係なくいまの質問を聞き直す", () => {
    const next = chooseNext(afterFirst, { ...output, next_type: "clarify", next_goal_id: null, text: "もう少し教えてください。" }).next;
    expect(next).toEqual({ type: "clarify", question_id: "first_medicines", text: "もう少し教えてください。" });
  });

  it("選んだゴールの言い直しにも、利用者の言葉の繰り返しの検査を通す（直前より前の回答の言葉は捨てる）", () => {
    const later: TurnRequest = {
      ...afterFirst,
      inputs: [...afterFirst.inputs, input("first_location", "first", "お薬手帳にあります")],
      next_question_id: "first_other",
    };
    const repeat = { ...output, next_goal_id: "first_other", text: "胃腸の薬のほかにも、使っている薬はありますか？" };
    expect(chooseNext(later, repeat).rejected).toBe("repeat");
  });

  it("直前の回答の言葉の復唱は通る（2026-11-07 のオーナーの答え）", () => {
    const echo = { ...output, text: "胃腸の薬ですね。その情報は、どこで確かめられますか？" };
    expect(chooseNext(afterFirst, echo).rejected).toBeNull();
  });
});

describe("followsGoalRules（問い合わせの確かめ。ADR-0028 の12）", () => {
  it("固定の順番での次の質問が合えば通す", () => {
    expect(followsGoalRules(afterFirst)).toBe(true);
    expect(followsGoalRules(secondDone)).toBe(true);
  });

  it("次の質問が合わない・半分に無い質問ID・前半と後半の入れ替わりは拒否する", () => {
    expect(followsGoalRules({ ...afterFirst, next_question_id: "first_other" })).toBe(false);
    expect(followsGoalRules({ ...afterFirst, inputs: [input("second_proxy")] })).toBe(false);
    expect(
      followsGoalRules({ ...secondDone, inputs: [...secondDone.inputs, input("first_other")], next_question_id: "first_location" }),
    ).toBe(false);
  });
});

describe("振り返りの一言（案B：一言用の検査。監査役は必ず通す）", () => {
  const finish = { ...output, next_goal_id: null, text: null };
  const remark = "お話しくださってありがとうございました。自分のお薬情報がどこに記録されているのか把握できていましたね。代わりに伝える人は、話せていました。";

  it("後半を終えるときの一言は、検査と監査役を通れば返す。監査役には一言と固定の役目の文だけを送る", async () => {
    const audit = vi.fn<Audit>(async () => passed);
    const outcome = await runTurn(secondDone, fake({ ...finish, closing_remark: remark }), audit);
    if (!outcome.ok) throw new Error("ok のはず");
    expect(outcome.response.next.type).toBe("finish");
    expect(outcome.response.remark).toBe(remark);
    expect(audit).toHaveBeenCalledWith(remark, REMARK_PURPOSE);
    for (const args of audit.mock.calls) expect(JSON.stringify(args)).not.toContain("美香");
  });

  it("よくある回答の言い回し（〜いました、そうです）があっても、決まった言い回しで書いた一言は通る", async () => {
    const answers = ["毎朝飲んでいました", "そうです", "ありがとうございます", "家族が知っています"];
    const req = {
      ...secondDone,
      inputs: secondDone.inputs.map((i, n) => ({ ...i, text: answers[n % answers.length] })),
    };
    const outcome = await runTurn(req, fake({ ...finish, closing_remark: remark }), null);
    if (!outcome.ok) throw new Error("ok のはず");
    expect(outcome.remarkRejectReason).toBeNull();
    expect(outcome.response.remark).toBe(remark);
  });

  it("利用者が挙げた情報源・手段・人の続柄の言葉には触れてよい（案B）", async () => {
    const req = { ...secondDone, inputs: [...secondDone.inputs.slice(0, -1), input("second_proxy", "second", "お薬手帳を家族が持っています")] };
    for (const ok of [
      "お薬手帳のことは話せていました。",
      "家族に頼めることも話せていました。",
      "スマホのほかに、いつもの確認方法が使えないとき、ほかの方法でお薬の情報を確認できるか、今のうちに確かめておくと安心です。",
    ]) {
      const outcome = await runTurn(req, fake({ ...finish, closing_remark: ok }), null);
      if (!outcome.ok) throw new Error("ok のはず");
      expect(outcome.remarkRejectReason, ok).toBeNull();
      expect(outcome.response.remark).toBe(ok);
    }
  });

  it("薬の名前・病名・固定の文に無いカタカナと「〜薬」の言葉は、案B でも捨てる", async () => {
    for (const [bad, reason] of [
      ["ロキソニンのことは話せていました。", "unknown_term"],
      ["胃腸薬のことは話せていました。", "unknown_term"],
      ["血圧のお話は話せていました。", "forbidden"],
      ["お薬手帳を見て1日2錠と言えていました。", "forbidden"],
    ] as const) {
      const outcome = await runTurn(secondDone, fake({ ...finish, closing_remark: bad }), null);
      if (!outcome.ok) throw new Error("ok のはず");
      expect(outcome.response.remark, bad).toBeNull();
      expect(outcome.remarkRejectReason, bad).toBe(reason);
    }
  });

  it("人の名前は語の照合では止まらないので、監査役が止めたら捨てる（案B の限界。監査役は必ず通す）", async () => {
    const audit = vi.fn<Audit>(async () => ({ ...passed, pass: false, category: "personal_info" }));
    const outcome = await runTurn(secondDone, fake({ ...finish, closing_remark: "美香さんのことは話せていました。" }), audit);
    if (!outcome.ok) throw new Error("ok のはず");
    expect(audit).toHaveBeenCalledWith("美香さんのことは話せていました。", REMARK_PURPOSE);
    expect(outcome.response.remark).toBeNull();
    expect(outcome.remarkRejectReason).toBe("audit_personal_info");
  });

  it("言い換えた言い回し「いつもの確認方法が使えないとき、ほかの方法でお薬の情報を確認できるか」は、禁止表現に当たらずに通る（2026-11-07 オーナー決定）", async () => {
    const text = "記録に載っていないことは、いつもの確認方法が使えないとき、ほかの方法でお薬の情報を確認できるか、今のうちに確かめておくと安心です。";
    const outcome = await runTurn(secondDone, fake({ ...finish, closing_remark: text }), null);
    if (!outcome.ok) throw new Error("ok のはず");
    expect(outcome.remarkRejectReason).toBeNull();
  });

  it("準備の助言・安心させる言い方の一言は捨てる", async () => {
    for (const bad of ["薬は飲み忘れないよう気をつけましょう。", "これなら大丈夫です。"]) {
      const outcome = await runTurn(secondDone, fake({ ...finish, closing_remark: bad }), null);
      if (!outcome.ok) throw new Error("ok のはず");
      expect(outcome.response.remark).toBeNull();
      expect(outcome.remarkRejectReason).toBe("forbidden");
    }
  });

  it("監査役が止めたとき・答えられないときは、一言を捨てる", async () => {
    const stop: Audit = async () => ({ ...passed, pass: false, category: "off_role" });
    const fail: Audit = async () => ({ ok: false, failure: "timeout" });
    for (const [audit, reason] of [[stop, "audit_off_role"], [fail, null]] as const) {
      const outcome = await runTurn(secondDone, fake({ ...finish, closing_remark: remark }), audit);
      if (!outcome.ok) throw new Error("ok のはず");
      expect(outcome.response.remark).toBeNull();
      expect(outcome.remarkRejectReason).toBe(reason);
    }
  });

  it("後半を終えるとき以外の一言は使わない（監査役にも送らない）", async () => {
    const audit = vi.fn<Audit>(async () => passed);
    const outcome = await runTurn(afterFirst, fake({ ...output, closing_remark: remark }), audit);
    if (!outcome.ok) throw new Error("ok のはず");
    expect(outcome.response.remark).toBeNull();
    expect(audit).not.toHaveBeenCalledWith(remark, REMARK_PURPOSE);
  });

  it("後半の終わりの問い合わせだけ、一言を頼み、観点と判定の名前を添える", () => {
    const payload = (r: TurnRequest) => JSON.parse(buildUserMessage(r).slice(buildUserMessage(r).indexOf("\n") + 1));
    expect(payload(secondDone).remark_requested).toBe(true);
    expect(payload(secondDone).remark_vocabulary).toContain("代わりに伝える人");
    expect(payload(afterFirst).remark_requested).toBe(false);
    expect(payload(afterFirst).remark_vocabulary).toBeUndefined();
  });
});

describe("画面が作る問い合わせは、どの回でも Workers の確かめを通る（ブラウザと Workers が同じ planGoals）", () => {
  it("Claude が掘り下げ・順番の入れ替え・聞き返しを選ぶ回でも、最後まで 400 にならない", async () => {
    const { initialState, trainingReducer, buildTurnRequest } = await import("../src/flow/training");
    const judged = output.viewpoints;
    const reply = (next: { type: "ask" | "clarify" | "finish"; question_id: string | null }) => ({
      emergency: "none" as const,
      viewpoints: judged,
      next: { ...next, text: null },
      recall: false,
      source_guess: null,
      remark: null,
    });
    const script = [
      reply({ type: "ask", question_id: "first_medicines_more" }),
      reply({ type: "clarify", question_id: "first_medicines_more" }),
      reply({ type: "ask", question_id: "first_unrecorded" }),
      reply({ type: "ask", question_id: "first_location" }),
      reply({ type: "ask", question_id: "first_other" }),
      // 後半
      reply({ type: "ask", question_id: "second_recheck" }),
      reply({ type: "ask", question_id: "second_proxy" }),
      reply({ type: "ask", question_id: "second_recent" }),
      reply({ type: "finish", question_id: null }),
    ];
    let s = trainingReducer({ ...initialState, ai: "on" }, { type: "start" });
    let checked = 0;
    for (const r of script) {
      if (s.stage.name === "confirm") {
        s = trainingReducer(s, { type: "confirm", source: "notebook" });
        s = trainingReducer(s, { type: "continue_after_event" });
      }
      s = trainingReducer(s, { type: "answer", text: "架空の回答です" });
      const req = buildTurnRequest(s);
      expect(req).not.toBeNull();
      expect(followsGoalRules(req!), JSON.stringify(req!.inputs.map((i) => i.question_id))).toBe(true);
      checked += 1;
      s = trainingReducer(s, { type: "turn_result", session: s.session, seq: s.answers.length, result: r });
    }
    expect(checked).toBe(script.length);
    expect(s.stage.name).toBe("review");
    expect(s.ai).toBe("on");
  });
});
