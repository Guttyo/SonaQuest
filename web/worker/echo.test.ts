import { describe, expect, it } from "vitest";
import { isAffirmative } from "../src/flow/emergency";
import { maskEchoed, promptTextProblem } from "./checks";
import { echoableAnswer } from "./turn";
import { secondHalfQuestions } from "../src/flow/rules";

// 復唱（2026-11-07 のオーナーの答え。親のセッション経由）：直前の回答の言葉だけは、そのまま繰り返してよい
const check = (text: string, lastAnswer: string, earlier: string[] = []) =>
  promptTextProblem(text, { userTexts: [...earlier, lastAnswer], allowed: [], lastAnswer });

describe("直前の回答の言葉の復唱", () => {
  it("「頭痛薬を飲んでいます」→「頭痛薬ですね。他に使用しているお薬はありませんか。」は通る", () => {
    expect(check("頭痛薬ですね。他に使用しているお薬はありませんか。", "頭痛薬を飲んでいます")).toBeNull();
  });

  it("病気の言葉を含む薬の言葉（花粉症の薬、血圧の薬）も、直前の回答にあれば通る", () => {
    expect(check("花粉症の薬ですね。ほかに使っているお薬はありますか？", "花粉症の薬を飲んでいます")).toBeNull();
    expect(check("血圧の薬ですね。ほかに使っているお薬はありますか？", "血圧の薬です")).toBeNull();
    expect(check("ロキソニンですね。ほかに使っているお薬はありますか？", "ロキソニンをときどき")).toBeNull();
  });

  it("直前の回答に無い薬の名前・薬の種類・病名は、今までどおり捨てる", () => {
    expect(check("胃腸薬ですね。ほかにありますか？", "頭痛薬を飲んでいます")).not.toBeNull();
    expect(check("ロキソニンですね。ほかにありますか？", "頭痛薬を飲んでいます")).not.toBeNull();
    expect(check("ロキソニンもありますか？", "頭痛薬を飲んでいます")).toBe("unknown_term");
    expect(check("高血圧の薬ですね。ほかにありますか？", "血圧の薬です")).toBe("forbidden");
    expect(check("片頭痛の薬ですね。ほかにありますか？", "頭痛の薬です")).toBe("forbidden");
  });

  it("名前の直し・推測の確かめ・量・用法・助言は、復唱の形でも捨てる", () => {
    expect(check("頭痛薬ではないですか？", "頭痛薬を飲んでいます")).toBe("forbidden");
    expect(check("頭痛薬のことですか？", "頭痛薬を飲んでいます")).toBe("forbidden");
    expect(check("1日2錠ですね。ほかにありますか？", "頭痛薬を1日2錠")).toBe("forbidden");
    expect(check("頭痛薬は食後ですね。", "頭痛薬を食後に")).toBe("forbidden");
    expect(check("頭痛薬は飲み続けてください。", "頭痛薬を飲んでいます")).toBe("forbidden");
  });

  it("それより前の回答の言葉は、今までどおり繰り返しとして捨てる", () => {
    expect(check("台所の引き出しですね。ほかにありますか？", "スマホです", ["台所の引き出しにあります"])).toBe("repeat");
  });

  it("直前の回答に書式文字が入っていても、その回答に文字どおりある言葉の復唱は通る（Issue #292）", () => {
    const zw = "​";
    expect(check("頭痛薬ですね。ほかに使っているお薬はありますか？", `頭${zw}痛${zw}薬を飲んでいます`)).toBeNull();
    expect(check("ロキソニンですね。ほかに使っているお薬はありますか？", `ロ${zw}キ${zw}ソ${zw}ニ${zw}ンをときどき`)).toBeNull();
    expect(check("花粉症の薬ですね。ほかに使っているお薬はありますか？", `花粉症${zw}の薬を飲んでいます`)).toBeNull();
  });

  it("空白で区切って2つの薬を挙げた回答でも、その1つの復唱は通る（Issue #292）", () => {
    expect(check("ロキソニンですね。ほかに使っているお薬はありますか？", "ロキソニン カロナール")).toBeNull();
  });

  it("直前の回答の言葉の切れ端（長い言葉の前半だけ）は、復唱とみなさない（Issue #292）", () => {
    expect(check("ロキソニンですね。ほかに使っているお薬はありますか？", "ロキソニンテープを貼っています")).toBe(
      "unknown_term",
    );
  });

  it("写した言葉は語の切れ目でだけ伏せる（言葉の一部だけを写して前後に足したものは伏せない）", () => {
    expect(maskEchoed("頭痛薬ですね。", "頭痛薬を飲んでいます")).toBe("〇ですね。");
    expect(maskEchoed("片頭痛の薬ですね。", "頭痛の薬です")).toBe("片頭痛の薬ですね。");
  });
});

describe("確かめの問いへの答え（ADR-0011 の追記）", () => {
  it("「はい」「うん」「そうです」は肯定、「いいえ」「違います」「そうではない」は肯定ではない", () => {
    for (const yes of ["はい", "はい、そうです", "うん", "そうです", "ええ"]) expect(isAffirmative(yes), yes).toBe(true);
    for (const no of ["いいえ", "違います", "そうではないです", "薬の説明です", "", "はいらない"]) {
      expect(isAffirmative(no), no).toBe(false);
    }
  });
});

describe("復唱は薬についての問いへの回答だけ（2026-11-07）", () => {
  const req = (questionId: string, text: string) => ({
    inputs: [{ question_id: questionId, half: "first" as const, asked: "問い", text }],
    event: null,
    source: null,
    next_question_id: null,
    allow_clarify: true,
    allow_redirect: true,
  });
  it("薬の問いの回答は復唱してよく、手段・人の問いの回答は復唱しない", () => {
    expect(echoableAnswer(req("first_medicines", "頭痛薬を飲んでいます"))).toBe("頭痛薬を飲んでいます");
    expect(echoableAnswer(req("first_medicines_more", "目薬"))).toBe("目薬");
    expect(echoableAnswer(req("second_recovery", "スマホのアプリ"))).toBeUndefined();
    expect(echoableAnswer(req("second_proxy", "妻"))).toBeUndefined();
  });
});

describe("お薬手帳が自宅のときの後半の問い（2026-11-07）", () => {
  it("お薬手帳を前提にしない問いに替わり、ほかの出来事では今までの問い", () => {
    expect(secondHalfQuestions("notebook_home").map((q) => q.id)).toContain("second_recent_other");
    expect(secondHalfQuestions("notebook_home").map((q) => q.text).join("")).not.toContain("お薬手帳などの記録");
    expect(secondHalfQuestions("battery").map((q) => q.id)).toContain("second_recent");
  });
});
