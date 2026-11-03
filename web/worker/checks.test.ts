// Claude が作った文の検査（ADR-0025、docs/safety-test-plan.md S16〜S18）

import { describe, expect, it } from "vitest";
import { FIRST_HALF_QUESTIONS, PROXY_QUESTION } from "../src/flow/content";
import { isAcceptablePromptText, repeatsUserWords } from "./checks";

const location = FIRST_HALF_QUESTIONS[1].text;
const context = (userTexts: string[] = []) => ({ userTexts, allowed: [location] });

describe("通してよい文", () => {
  it.each([
    "教えてくださってありがとうございます。その薬のことは、何を見れば確かめられますか？",
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。",
    "もう少し教えてください。ほかに、どうやって伝えられますか？",
  ])("%s", (text) => {
    expect(isAcceptablePromptText(text, context(["A薬を朝に1錠飲んでいます"]))).toBe(true);
  });

  it("固定の質問文にある言葉は、利用者が同じ言葉を使っていても繰り返しとみなさない", () => {
    const text = "その薬のことは、お薬手帳などで確かめられますか？";
    expect(isAcceptablePromptText(text, context(["お薬手帳を見ます"]))).toBe(true);
  });
});

describe("禁止表現を含む文は捨てる（S16）", () => {
  it.each([
    ["推測の確認", "それはロキソニンではないですか？"],
    ["推測", "血圧の薬かもしれませんね。"],
    ["名前の修正", "正しくはアムロジピンです。"],
    ["薬効", "その薬は痛みに効く薬ですね。"],
    ["副作用", "副作用は出ていませんか？"],
    ["用量", "1日2錠で合っていますか？"],
    ["用法", "食後に飲んでいますか？"],
    ["服薬の助言", "今日は飲まないでください。"],
    ["服薬の助言", "薬は続けてください。"],
    ["受診", "早めに受診してください。"],
    ["診断", "高血圧の疑いがあります。"],
    ["緊急度", "緊急ではないので安心してください。"],
    ["安心させる判断", "それなら問題ありません。"],
    ["備蓄", "薬は7日分あると安心です。"],
    ["制度", "公的な制度で薬をもらえます。"],
    ["連絡先", "その方の電話番号を教えてください。"],
    ["氏名", "その方のお名前を教えてください。"],
    ["外部への誘導", "https://example.com を見てください。"],
  ])("%s：%s", (_label, text) => {
    expect(isAcceptablePromptText(text, context())).toBe(false);
  });
});

describe("利用者の言葉の繰り返しは捨てる（S17）", () => {
  it("薬の名前（カタカナ）の繰り返し", () => {
    expect(
      isAcceptablePromptText("ロキソニンは、何を見れば確かめられますか？", context(["ロキソニンを飲んでいます"])),
    ).toBe(false);
  });

  it("病名（漢字）の繰り返し", () => {
    expect(
      isAcceptablePromptText("高血圧の薬のことは、何で確かめられますか？", context(["高血圧の薬です"])),
    ).toBe(false);
  });

  it("全角・半角の違いがあっても見つける", () => {
    expect(repeatsUserWords("ＡＢＣ錠は何で確かめますか", ["abc錠を朝に"], [])).toBe(true);
  });

  it("ひらがなだけの並びは繰り返しとみなさない", () => {
    expect(repeatsUserWords("ありがとうございます", ["ありがとうございます"], [])).toBe(false);
  });
});

describe("長さ（S18）", () => {
  it("上限を超える文は捨てる", () => {
    expect(isAcceptablePromptText("あ".repeat(201), context())).toBe(false);
  });

  it("空の文は捨てる", () => {
    expect(isAcceptablePromptText("   ", context())).toBe(false);
  });
});

describe("固定の質問文そのものは検査を通る", () => {
  it.each([...FIRST_HALF_QUESTIONS, PROXY_QUESTION].map((q) => [q.id, q.text]))("%s", (_id, text) => {
    expect(isAcceptablePromptText(text, { userTexts: [], allowed: [text] })).toBe(true);
  });
});
