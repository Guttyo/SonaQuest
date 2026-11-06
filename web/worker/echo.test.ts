import { describe, expect, it } from "vitest";
import { isAffirmative } from "../src/flow/emergency";
import { maskEchoed, promptTextProblem } from "./checks";

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
