// Workers でのゴールの確かめと、振り返りの一言の検査（Issue #200、ADR-0025 の B）

import { describe, expect, it, vi } from "vitest";
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
  next_question_id: "second_recheck",
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

  it("聞き返しは、ゴールに関係なくいまの質問を聞き直す", () => {
    const next = chooseNext(afterFirst, { ...output, next_type: "clarify", next_goal_id: null, text: "もう少し教えてください。" }).next;
    expect(next).toEqual({ type: "clarify", question_id: "first_medicines", text: "もう少し教えてください。" });
  });

  it("選んだゴールの言い直しにも、利用者の言葉の繰り返しの検査をそのまま通す", () => {
    const repeat = { ...output, text: "胃腸の薬のほかにも、使っている薬はありますか？" };
    expect(chooseNext(afterFirst, repeat).rejected).toBe("repeat");
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

describe("振り返りの一言（案A：観点と判定の名前だけ。繰り返しの検査は緩めない）", () => {
  const finish = { ...output, next_goal_id: null, text: null };
  const remark = "お話しくださってありがとうございました。代わりに伝える人は、話せていました。記録に無い情報は、まだ考える余地がありそうです。";

  it("後半を終えるときの一言は、検査と監査役を通れば返す。監査役には一言と固定の役目の文だけを送る", async () => {
    const audit = vi.fn<Audit>(async () => passed);
    const outcome = await runTurn(secondDone, fake({ ...finish, closing_remark: remark }), audit);
    if (!outcome.ok) throw new Error("ok のはず");
    expect(outcome.response.next.type).toBe("finish");
    expect(outcome.response.remark).toBe(remark);
    expect(audit).toHaveBeenCalledWith(remark, REMARK_PURPOSE);
    for (const args of audit.mock.calls) expect(JSON.stringify(args)).not.toContain("美香");
  });

  it("利用者の言葉を繰り返した一言は捨てる（漢字2文字の繰り返し）", async () => {
    const outcome = await runTurn(secondDone, fake({ ...finish, closing_remark: "美香さんのことは話せていました。" }), null);
    if (!outcome.ok) throw new Error("ok のはず");
    expect(outcome.response.remark).toBeNull();
    expect(outcome.remarkRejectReason).toBe("repeat");
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
