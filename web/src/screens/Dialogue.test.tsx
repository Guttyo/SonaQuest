// 回答の欄の連絡の手段の選択肢（Issue #110）

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ANSWER_HINTS, CONTACT_CHOICES, CONTACT_CHOICES_LABEL } from "../flow/content";
import { MAX_ANSWER_LENGTH } from "../flow/rules";
import { AnswerForm, appendChoice } from "./Dialogue";

const noop = () => {};

describe("appendChoice", () => {
  it("空なら選択肢だけ、文があれば「、」でつなぎ、句読点の後はそのまま足す", () => {
    expect(appendChoice("", "電話で連絡できる")).toBe("電話で連絡できる");
    expect(appendChoice("姉です ", "電話で連絡できる")).toBe("姉です、電話で連絡できる");
    expect(appendChoice("姉です。", "同じ避難所にいる")).toBe("姉です。同じ避難所にいる");
  });

  it("上限の字数を超えない", () => {
    expect(appendChoice("あ".repeat(MAX_ANSWER_LENGTH), "電話で連絡できる").length).toBe(MAX_ANSWER_LENGTH);
  });
});

describe("AnswerForm の選択肢", () => {
  it("選択肢を渡したときだけ、見出しとボタンを出す（押すまで送らない type=button）", () => {
    const html = renderToStaticMarkup(
      <AnswerForm hint={ANSWER_HINTS.self} choices={CONTACT_CHOICES} onSubmit={noop} onListeningChange={noop} voice={null} />,
    );
    expect(html).toContain(CONTACT_CHOICES_LABEL);
    for (const c of CONTACT_CHOICES) expect(html).toContain(c);
    expect(html.match(/class="answer-choice"/g)?.length).toBe(CONTACT_CHOICES.length);
    expect(html).toContain('type="button" class="answer-choice"');

    const none = renderToStaticMarkup(
      <AnswerForm hint={ANSWER_HINTS.self} onSubmit={noop} onListeningChange={noop} voice={null} />,
    );
    expect(none).not.toContain(CONTACT_CHOICES_LABEL);
  });
});
