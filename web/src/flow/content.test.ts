import { describe, expect, it } from "vitest";
import { detectDistress } from "./emergency";
import { MAX_PROMPT_LENGTH } from "./turnContract";
import {
  ACK_TEXT,
  ALL_QUESTIONS,
  ANSWER_HINTS,
  CLARIFY_TEXTS,
  CONTACT_CHOICES,
  CONTACT_CHOICE_QUESTIONS,
  FIRST_HALF_QUESTIONS,
  INTERRUPTION_NOTE,
  INTRO_LEAD,
  INTRO_POINTS,
  PRIVACY_VOICE,
  PROTOTYPE_LEAD,
  PROXY_QUESTION,
  PROXY_QUESTION_AFTER_FAMILY,
  RECALL_FEEDBACK,
  RECHECK_QUESTION,
  REDIRECT_TEXTS,
} from "./content";
import type { AnswerAs } from "./types";

const answerAsOf = (id: string): AnswerAs | undefined =>
  ALL_QUESTIONS.find((q) => q.id === id)?.answerAs;

describe("答える範囲（ADR-0022 案B）", () => {
  it("薬の中身を聞く質問は、架空の内容で答える", () => {
    expect(answerAsOf("first_medicines")).toBe("fictional");
    expect(answerAsOf("first_other")).toBe("fictional");
    expect(answerAsOf("first_unrecorded")).toBe("fictional");
  });

  it.each(["first_location", "second_recovery", "second_proxy", "second_proxy_other", "second_recheck"])(
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

  it("架空にする範囲には、薬があるかと飲めているかも含める（ADR-0022）", () => {
    for (const hint of [ANSWER_HINTS.fictional, ANSWER_HINTS.both]) {
      expect(hint).toContain("薬があるか");
      expect(hint).toContain("飲めているか");
    }
  });

  it("本人のこととして答える案内でも、薬の中身は書かないよう示す", () => {
    expect(ANSWER_HINTS.self).toContain("薬の中身は書かないでください");
  });

  it("声の送信先の説明は、音声認識と ElevenLabs を挙げ、回答や声を ElevenLabs に送らないこと、2D では送らないことを示す（ADR-0033、A-08）", () => {
    expect(PRIVACY_VOICE).toContain("音声認識");
    expect(PRIVACY_VOICE).toContain("ElevenLabs");
    expect(PRIVACY_VOICE).toContain("あなたの回答や声は送りません");
    expect(PRIVACY_VOICE).toContain("確かめられていません");
    expect(PRIVACY_VOICE).toContain("「文字で答える」ではどちらにも送りません");
  });

  it("利用開始の文面は、架空にするのが薬の中身であることを示す（案Bと食い違わない）", () => {
    expect(INTRO_LEAD).toContain("薬の中身は架空");
    expect(PROTOTYPE_LEAD).toContain("薬の中身は架空");
  });

  it.each([PROXY_QUESTION, PROXY_QUESTION_AFTER_FAMILY])(
    "薬を知っている人の質問（$id）は、連絡先や薬の中身を聞かず、伝えられる人を続柄で聞く。連絡の手段は画面の選択肢で補う（Issue #110）",
    (q) => {
      expect(q.text).not.toContain("どうやって連絡がとれますか");
      expect(q.text).not.toContain("電話番号");
      expect(q.text).toContain("続柄");
      expect(CONTACT_CHOICE_QUESTIONS.has(q.id)).toBe(true);
      // 連絡先そのものを書かせない案内は、回答欄に出る
      expect(ANSWER_HINTS[q.answerAs]).toContain("電話番号");
    },
  );

  it("連絡の手段の選択肢は、手段の種類だけで、連絡先や体調の語を含まない（Issue #110）", () => {
    for (const c of CONTACT_CHOICES) {
      expect(c).not.toMatch(/[0-9０-９]/);
      expect(detectDistress(c), c).toBeNull();
    }
  });

  it("質問は1問1問いで短い：疑問符は1つまで、声で聞いても負担にならない長さ（Issue #110）", () => {
    for (const q of ALL_QUESTIONS) {
      expect((q.text.match(/？/g) ?? []).length, q.id).toBeLessThanOrEqual(1);
      // 1問目は挨拶と、オーナーが決めた剤形の言葉（Issue #94）を含むので長い。ほかは60字以内
      const limit = q.id === "first_medicines" ? 90 : 60;
      expect(q.text.length, q.id).toBeLessThanOrEqual(limit);
    }
  });

  it("例は聞き返しのときだけ：質問文には例を入れず、聞き返しの固定文には入れる（Issue #110）", () => {
    for (const q of ALL_QUESTIONS) {
      expect(q.text, q.id).not.toContain("たとえば");
      if (q.examples !== undefined) expect(detectDistress(q.examples), q.id).toBeNull();
    }
    expect(CLARIFY_TEXTS.first_location).toContain("たとえば");
  });

  it("思い出せなかったことの問いは、候補を出さず、確かめた内容の入力も求めない（ADR-0022、Issue #41）", () => {
    expect(RECHECK_QUESTION.text).toContain("思い出せなかったこと");
    expect(RECHECK_QUESTION.text).not.toContain("ではないですか");
    expect(RECHECK_QUESTION.text).not.toContain("確かめた内容");
    expect(RECHECK_QUESTION.text).not.toContain("書いて");
  });

  it("固定の質問文は、体調の訴えの照合に当たらない（利用者が質問の言葉を言い返しても中断しないように）", () => {
    for (const q of ALL_QUESTIONS) {
      expect(detectDistress(q.text), q.id).toBeNull();
    }
    // 足した問いの例をなぞった回答でも中断しない（Issue #41）
    expect(detectDistress("ときどきだけ飲む薬があります。最近やめた薬はありません")).toBeNull();
  });

  it("どの固定の質問にも、聞き返しと質問し直しの固定文がある", () => {
    for (const q of ALL_QUESTIONS) {
      expect(CLARIFY_TEXTS[q.id]).toBeTruthy();
      expect(REDIRECT_TEXTS[q.id]).toBeTruthy();
    }
  });

  it("固定の質問文は、受け止めの一言を前に付けても、画面に出した文の上限に収まる（/api/turn で拒否されない）", () => {
    for (const q of ALL_QUESTIONS) {
      expect((ACK_TEXT + q.text).length).toBeLessThanOrEqual(MAX_PROMPT_LENGTH);
    }
  });

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

describe("1問目と、中断すると体調を崩しやすい薬の固定文（Issue #94、ADR-0040 の決定7）", () => {
  const first = FIRST_HALF_QUESTIONS[0];

  it("1問目は、飲み薬のほかに注射・貼り薬・塗り薬と、毎日でなく決まった日だけ使う薬も聞く", () => {
    expect(first.id).toBe("first_medicines");
    for (const word of ["注射", "貼り薬", "塗り薬", "決まった日", "毎日"]) {
      expect(first.text).toContain(word);
    }
    // 薬の中身は架空で答える（ADR-0022）
    expect(first.answerAs).toBe("fictional");
  });

  it("1問目に数字を入れない（Claude の言い直しが用量の形の検査に当たって固定文に戻るのを避ける）", () => {
    expect(first.text).not.toMatch(/[0-9０-９]/);
    expect(first.text).not.toMatch(/[一二三四五六七八九十]回/);
  });

  it("振り返りの固定文は、薬の種類を挙げず、飲む・やめるの助言も、候補の提示もしない", () => {
    expect(INTERRUPTION_NOTE).toContain("名前");
    for (const word of [
      "ステロイド",
      "麻薬",
      "飲んで",
      "飲み続け",
      "やめ",
      "続けて",
      "ではないですか",
      "かもしれません",
      "mg",
      "錠",
    ]) {
      expect(INTERRUPTION_NOTE, word).not.toContain(word);
    }
    expect(INTERRUPTION_NOTE).not.toMatch(/[0-9０-９]/);
    // 利用者が同じ言葉を言い返しても中断しない
    expect(detectDistress(INTERRUPTION_NOTE)).toBeNull();
  });
});
