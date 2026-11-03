import { describe, expect, it } from "vitest";
import {
  ANSWER_HINTS,
  FIRST_HALF_QUESTIONS,
  HANDOVER_QUESTION,
  INTRO_LEAD,
  INTRO_POINTS,
  PROTOTYPE_LEAD,
  PROXY_QUESTION,
  PROXY_QUESTION_AFTER_FAMILY,
  RECALL_FEEDBACK,
  RECENT_QUESTION,
  RECOVERY_QUESTION,
} from "./content";
import type { AnswerAs, Question } from "./types";

const ALL_QUESTIONS: readonly Question[] = [
  ...FIRST_HALF_QUESTIONS,
  RECOVERY_QUESTION,
  HANDOVER_QUESTION,
  RECENT_QUESTION,
  PROXY_QUESTION,
  PROXY_QUESTION_AFTER_FAMILY,
];

const answerAsOf = (id: string): AnswerAs | undefined =>
  ALL_QUESTIONS.find((q) => q.id === id)?.answerAs;

describe("答える範囲（ADR-0022 案B）", () => {
  it("薬の中身を聞く質問は、架空の内容で答える", () => {
    expect(answerAsOf("first_medicines")).toBe("fictional");
    expect(answerAsOf("first_other")).toBe("fictional");
  });

  it.each(["first_location", "second_recovery", "second_proxy", "second_proxy_other"])(
    "在りか・伝え方・知っている人を聞く %s は、本人のこととして答える",
    (id) => {
      expect(answerAsOf(id)).toBe("self");
    },
  );

  it("伝え方と薬の中身の両方を聞く質問は both", () => {
    expect(answerAsOf("second_handover")).toBe("both");
    expect(answerAsOf("second_recent")).toBe("both");
  });

  it("どの質問にも回答欄の案内がある", () => {
    for (const q of ALL_QUESTIONS) {
      expect(ANSWER_HINTS[q.answerAs]).toBeTruthy();
    }
  });

  it("案内は、架空にするのが薬の中身であること、本人のことでも名前や電話番号は書かないことを示す", () => {
    expect(ANSWER_HINTS.fictional).toContain("架空");
    expect(ANSWER_HINTS.self).toContain("あなた自身");
    expect(ANSWER_HINTS.self).toContain("電話番号");
    expect(ANSWER_HINTS.both).toContain("架空");
    expect(ANSWER_HINTS.both).toContain("あなた自身");
    // second_recent が本人のこととして聞くのは「記録が新しいか」なので、記録にも触れる
    expect(ANSWER_HINTS.both).toContain("記録");
    expect(ANSWER_HINTS.both).toContain("電話番号");
  });

  it("利用開始の文面は、架空にするのが薬の中身であることを示す（案Bと食い違わない）", () => {
    expect(INTRO_LEAD).toContain("薬の中身は架空");
    expect(PROTOTYPE_LEAD).toContain("薬の中身は架空");
  });

  it.each([PROXY_QUESTION, PROXY_QUESTION_AFTER_FAMILY])(
    "薬を知っている人の質問（$id）は、連絡先そのものではなく手段の種類を聞く",
    (q) => {
      expect(q.text).not.toContain("どうやって連絡がとれますか");
      expect(q.text).toContain("手段");
      expect(q.text).toContain("電話番号などは書かなくて大丈夫です");
    },
  );

  it("初回画面は、すべてを架空の人として答えるようには案内しない", () => {
    expect(INTRO_POINTS.join("")).not.toContain("架空の人になったつもり");
  });
});

describe("思い出せないときの案内（ADR-0022）", () => {
  const text = RECALL_FEEDBACK.join("");

  it("実際のお薬手帳や薬の袋を今ここで確認するよう促す", () => {
    expect(text).toContain("お薬手帳");
    expect(text).toContain("薬の袋");
    expect(text).toContain("今ここで");
  });

  it("確認した内容の入力は求めない", () => {
    expect(text).toContain("書く必要はありません");
  });

  it("定期的に訓練をして復習することを勧める", () => {
    expect(text).toContain("定期的に");
    expect(text).toContain("復習");
  });

  it("候補を示したり、言い当てようとしたりしない", () => {
    expect(text).not.toContain("ではないですか");
    expect(text).not.toContain("かもしれません");
  });
});
