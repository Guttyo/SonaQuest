// Claude が作った文の検査（ADR-0025、docs/safety-test-plan.md S16〜S18）

import { describe, expect, it } from "vitest";
import {
  ACK_TEXT,
  ACK_TEXTS,
  ALL_QUESTIONS,
  FIRST_HALF_QUESTIONS,
  HANDOVER_QUESTION,
  PROXY_QUESTION,
} from "../src/flow/content";
import { MAX_QUESTION_TEXT_LENGTH, MAX_REMARK_LENGTH } from "../src/flow/turnContract";
import {
  ECHOABLE_PATTERNS,
  FORBIDDEN_PATTERNS,
  isAcceptablePromptText,
  promptTextProblem,
  remarkTextProblem,
  repeatsUserWords,
  textForMatch,
  unknownTerms,
} from "./checks";
import { ALLOWED_VOCABULARY } from "./turn";

const location = FIRST_HALF_QUESTIONS[1].text;
// 聞き返しで添えてよい例も、turn.ts と同じく許す言葉に入れる（Issue #110）
const context = (userTexts: string[] = []) => ({
  userTexts,
  allowed: [location, FIRST_HALF_QUESTIONS[1].examples ?? ""],
});

describe("通してよい文", () => {
  it.each([
    "教えてくださってありがとうございます。その薬のことは、何を見れば確かめられますか？",
    "お話しくださってありがとうございます。いまは普段の薬のことを伺っています。",
    "もう少し教えてください。ほかに、どうやって伝えられますか？",
  ])("%s", (text) => {
    expect(isAcceptablePromptText(text, context(["A薬を朝に1錠飲んでいます"]))).toBe(true);
  });

  it("1問目（剤形と決まった日だけ使う薬の例を含む。Issue #94）を、受け止めを付けてそのまま言い直した文は通る", () => {
    const first = FIRST_HALF_QUESTIONS[0].text;
    const text = `教えてくださってありがとうございます。${first}`;
    expect(isAcceptablePromptText(text, { userTexts: [], allowed: [first] })).toBe(true);
    // 固定の質問文に出てくるカタカナ以外の言い回しでも、剤形の言葉は通る
    expect(
      isAcceptablePromptText(
        "ありがとうございます。飲み薬のほかに、注射や貼り薬、塗り薬で使っているものはありますか？",
        { userTexts: ["A薬を朝に1錠飲んでいます"], allowed: [first] },
      ),
    ).toBe(true);
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
    // 2026-11-04 のレビューで見逃しが見つかったもの
    ["推測の確かめ", "ワーファリンでしょうか？その薬は何で確かめられますか？"],
    ["推測", "高血圧のお薬のようですね。"],
    ["病名", "糖尿病の薬はありますか？"],
    ["服薬の助言", "朝と夜にお飲みください。"],
    ["漢数字の用量", "一日二錠のお薬ですね。"],
    ["安心させる判断", "それなら大丈夫です。様子を見ましょう。"],
    ["公的な制度", "災害時の特例で薬をもらえます。"],
    ["備蓄", "薬は多めに用意しておきましょう。"],
    // 2026-11-04 の2回目のレビューで見逃しが見つかったもの
    ["薬の名前の推測（お薬をはさむ）", "ワーファリンのお薬でしょうか？"],
    ["病名の推測", "リウマチのお薬ですか？その薬は何で確かめられますか？"],
    ["病名の推測（漢字）", "不眠のお薬でしょうか？"],
    ["薬の名前（利用者は言っていない）", "アムロジピンを飲んでいませんか？"],
    ["薬の種類の推測", "ロキソニンのような痛み止めでしょうか？"],
    ["薬の種類", "睡眠薬や痛み止めはありますか？"],
    ["薬効から推測", "血液をさらさらにするお薬ですか？"],
    ["推測の確かめ", "ロキソニンではないでしょうか？"],
    ["用量（ずつ）", "朝晩2つずつ飲むお薬ですね"],
    ["用量（度）", "一日に二度飲む薬ですね"],
    ["用量（粒）", "一日一粒のお薬ですか？"],
    ["安心させる", "安心してください。"],
    ["安心させる（ひらがな）", "だいじょうぶですよ"],
    ["安心させる（平気）", "それなら平気ですよ。"],
    ["服薬の助言（飲み忘れ）", "飲み忘れに気をつけましょう"],
    ["服薬の助言（切らさない）", "お薬は切らさないようにしましょう"],
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

  it("2文字の病名の繰り返し（2026-11-04 のレビュー）", () => {
    expect(isAcceptablePromptText("教えてくださってありがとうございます。", context(["喘息の吸入薬があります"]))).toBe(true);
    expect(repeatsUserWords("喘息のお薬なのですね", ["喘息の吸入薬があります"], [])).toBe(true);
    expect(repeatsUserWords("血圧のお薬ですね", ["血圧の薬を朝に1錠"], [])).toBe(true);
  });

  it("ひらがなで書いた薬の名前と、カタカナとひらがなの書き換え", () => {
    expect(repeatsUserWords("あむろじぴんですね", ["あむろじぴんをのんでる"], [])).toBe(true);
    expect(repeatsUserWords("あむろじんですね", ["アムロジンを飲んでる"], [])).toBe(true);
  });

  it("長音を含むひらがなの薬の名前と、4文字の名前（2回目のレビュー）", () => {
    expect(repeatsUserWords("わーふぁりんは何で確かめられますか", ["わーふぁりんをのんでる"], [])).toBe(true);
    expect(repeatsUserWords("りぴとーるのことは何で確かめられますか", ["りぴとーるをのんでいます"], [])).toBe(true);
    expect(repeatsUserWords("めじこんは何で確かめられますか", ["めじこんです"], [])).toBe(true);
  });

  it("漢字の並びの一部の繰り返し（2回目のレビュー）", () => {
    expect(repeatsUserWords("頭痛のお薬なのですね", ["頭痛薬を飲んでいます"], [])).toBe(true);
    expect(repeatsUserWords("毎朝飲んでいるのですね", ["毎朝一錠飲んでる"], [])).toBe(true);
  });

  it("受け止めの決まった言葉は、利用者が使っていても繰り返しとみなさない（ADR-0029 の5）", () => {
    expect(repeatsUserWords("わかりました。その薬は何で確かめられますか？", ["わかりました、手帳です"], [])).toBe(false);
    // 「わからない」を受け止める文は許さない
    expect(repeatsUserWords("わからないことに気づけたのも大切です", ["わからないです"], [])).toBe(true);
  });

  it("ひらがなの短い言葉は見ない", () => {
    expect(repeatsUserWords("はい、ありがとうございます", ["はい"], [])).toBe(false);
  });
});

describe("「大丈夫」の例外（ADR-0029 の6）", () => {
  it.each(["ゆっくりで大丈夫です。その薬は何で確かめられますか？", "急がなくて大丈夫です。", "あわてなくて大丈夫ですよ。"])(
    "急がなくてよいことを伝える受け止めは通す：%s",
    (text) => {
      expect(isAcceptablePromptText(text, context())).toBe(true);
    },
  );

  it.each(["その薬なら大丈夫です。", "ゆっくりで大丈夫です。体調も大丈夫ですよ。", "飲まなくても大丈夫です。"])(
    "それ以外の「大丈夫」は捨てる：%s",
    (text) => {
      expect(isAcceptablePromptText(text, context())).toBe(false);
    },
  );
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

describe("係の名前（ソナ・クエ。Issue #164）", () => {
  it("交代の問いを言い直すときは、固定の質問にある名前を使ってよい", () => {
    const allowed = [HANDOVER_QUESTION.text];
    expect(isAcceptablePromptText(`はい。${HANDOVER_QUESTION.text}`, { userTexts: [], allowed })).toBe(true);
    expect(
      isAcceptablePromptText("クエです。ほかに、薬のことが分かるものはありますか？", { userTexts: [], allowed }),
    ).toBe(true);
  });

  it("固定の質問に名前が無いときに名乗る文は、知らないカタカナの言葉として捨てる", () => {
    expect(isAcceptablePromptText("ソナです。その薬のことは、何を見れば確かめられますか？", context())).toBe(false);
  });
});

describe("書式文字（ゼロ幅スペースなど）を挟んだ文（Issue #292）", () => {
  // 見た目で分からない文字は、ソースに直接書かず符号位置から作る
  const FORMAT_CHARS = [0x200b, 0x2060, 0x00ad, 0xfeff].map((c) => String.fromCodePoint(c));
  const zw = String.fromCodePoint(0x200b);
  const wj = String.fromCodePoint(0x2060);
  const spread = (text: string, ch: string) => [...text].join(ch);
  const samples = [
    ["禁止表現", "早めに受診してください。"],
    ["病名の言葉", "糖尿病の薬はありますか？"],
    ["カタカナの言葉", "アムロジピンはありますか？"],
  ] as const;

  it.each(FORMAT_CHARS.map((ch) => [ch.codePointAt(0)!.toString(16)]))(
    "U+%s を全部の文字の間に挟んでも、質問文と振り返りの一言の検査で捨てる",
    (hex) => {
      const ch = String.fromCodePoint(parseInt(hex, 16));
      for (const [label, text] of samples) {
        expect(promptTextProblem(spread(text, ch), context()), label).not.toBeNull();
        expect(remarkTextProblem(spread(text, ch), []), label).not.toBeNull();
      }
      // 利用者の言葉の繰り返し
      const repeat = spread("台所の引き出しは何で確かめられますか？", ch);
      expect(promptTextProblem(repeat, context(["台所の引き出しにあります"]))).not.toBeNull();
    },
  );

  it("書式文字を含む文は、それだけで捨てる（重ねる守り）", () => {
    expect(promptTextProblem(`はい。${zw}その薬のことは、何を見れば確かめられますか？`, context())).toBe("forbidden");
    expect(remarkTextProblem(`お話しくださってありがとうございました。${wj}`, [])).toBe("forbidden");
  });

  it("照合用の文は、空白と書式文字を除いてそろえる（文を捨てる守りが無くても、語の照合で見つかる）", () => {
    expect(textForMatch(`受${zw}診 して`)).toBe("受診して");
    // 文字と濁点の間に挟まっても、NFKC でまとまった形にそろえる（NFKC の前にも除く）
    expect(textForMatch(`ｼ${zw}ﾞ`)).toBe("ジ");
    expect(textForMatch(`か${zw}${String.fromCodePoint(0x3099)}`)).toBe("が");
    expect(repeatsUserWords("ゼブラジンは何で確かめますか", [`ｾ${zw}ﾞﾌﾞﾗｼ${zw}ﾞﾝを飲んでいます`], [])).toBe(true);
    expect(FORBIDDEN_PATTERNS.some((p) => p.test(textForMatch(spread("早めに受診してください。", zw))))).toBe(true);
    expect(FORBIDDEN_PATTERNS.some((p) => p.test(textForMatch(spread("糖尿病の薬", zw))))).toBe(true);
    expect(unknownTerms(spread("アムロジピンはありますか？", zw), [])).toEqual(["アムロジピン"]);
    expect(repeatsUserWords(spread("台所の引き出し", zw), ["台所の引き出しにあります"], [])).toBe(true);
    // 利用者の入力の側に書式文字があっても、同じ言葉として見る
    expect(repeatsUserWords("ロキソニンは何で確かめますか", [spread("ロキソニンを飲んでいます", zw)], [])).toBe(true);
  });
});

describe("区切って書いたカタカナと、固定の言葉の切れ端（Issue #292）", () => {
  it.each([
    ["空白で1文字ずつ", "ア ム ロ ジ ピ ンはありますか？"],
    ["全角の空白で1文字ずつ", "ア　ム　ロ　ジ　ピ　ンはありますか？"],
    ["中黒で1文字ずつ", "ア・ム・ロ・ジ・ピ・ンはありますか？"],
    ["半角の中黒で1文字ずつ", "ｱ･ﾑ･ﾛ･ｼﾞ･ﾋﾟ･ﾝはありますか？"],
    ["中黒と空白で1文字ずつ", "ア ・ ム ・ ロはありますか？"],
  ])("%s：知らない言葉として捨てる", (_label, text) => {
    expect(promptTextProblem(text, context())).toBe("unknown_term");
  });

  it("固定の文にある2つのカタカナの言葉を、中黒でつないだものは通す", () => {
    const allowed = ["アプリ・マイナポータル"];
    expect(unknownTerms("アプリ・マイナポータルで確かめられますか？", allowed)).toEqual([]);
  });

  it("固定の文のカタカナの言葉の切れ端は、許す言葉とみなさない（部分一致で通さない）", () => {
    const allowed = ["スマートフォン", "アプリ・マイナポータル"];
    expect(unknownTerms("スマートで確かめられますか？", allowed)).toEqual(["スマート"]);
    expect(unknownTerms("ポータルで確かめられますか？", allowed)).toEqual(["ポータル"]);
    expect(unknownTerms("スマートフォンで確かめられますか？", allowed)).toEqual([]);
  });

  it("固定の質問文を、どの受け止めの一言を前に付けて言い直しても通る（許す言葉の比べ方を変えた後も）", () => {
    for (const q of ALL_QUESTIONS) {
      const allowed = [q.text, ...ALLOWED_VOCABULARY];
      for (const ack of [ACK_TEXT, ...ACK_TEXTS]) {
        expect(promptTextProblem(`${ack}${q.text}`, { userTexts: [], allowed }), q.id).toBeNull();
      }
      if (q.examples !== undefined) {
        // 聞き返しでは、いまの質問の例を添えてよい（Issue #110）
        const clarify = `もう少し教えてください。${q.text}たとえば、${q.examples}などです。`;
        expect(promptTextProblem(clarify, { userTexts: [], allowed: [...allowed, q.examples] }), q.id).toBeNull();
      }
    }
  });
});

describe("「では？」（Issue #292）", () => {
  it.each(["ほかの方法では？", "ほかの方法では?", "お薬手帳では？その薬は何で確かめられますか？"])(
    "全角の？でも半角の ? でも捨てる：%s",
    (text) => {
      expect(promptTextProblem(text, context())).toBe("forbidden");
      expect(remarkTextProblem(text, [])).toBe("forbidden");
    },
  );

  it.each(["それでは、その薬のことは、何を見れば確かめられますか？", "ここでは、普段の薬のことを伺っています。"])(
    "「では」を含むほかの文は捨てない：%s",
    (text) => {
      expect(promptTextProblem(text, context())).toBeNull();
    },
  );
});

describe("復唱で許す禁止表現は、名前で指す（Issue #292）", () => {
  it("許す4つは FORBIDDEN_PATTERNS にあり、それぞれ決まった表現を指す", () => {
    const echoable = [...ECHOABLE_PATTERNS];
    expect(echoable).toHaveLength(4);
    for (const p of echoable) expect(FORBIDDEN_PATTERNS).toContain(p);
    const sources = echoable.map((p) => p.source);
    expect(sources[0]).toContain("でしょうか|ですね");
    expect(sources[1]).toContain("お?薬");
    expect(sources[2]).toContain("病(?!院)");
    expect(sources[3]).toContain("血圧");
    // 番号で選んでいないので、量・助言などの表現は入らない
    expect(sources.join("\n")).not.toMatch(/正しくは|飲んで|用法|止め/);
  });
});

describe("長さの上限（Issue #292）", () => {
  it("質問文は MAX_QUESTION_TEXT_LENGTH まで通し、超えたら捨てる", () => {
    expect(promptTextProblem("あ".repeat(MAX_QUESTION_TEXT_LENGTH), context())).toBeNull();
    expect(promptTextProblem("あ".repeat(MAX_QUESTION_TEXT_LENGTH + 1), context())).toBe("length");
  });

  it("振り返りの一言は MAX_REMARK_LENGTH まで通し、超えたら捨てる", () => {
    expect(remarkTextProblem("あ".repeat(MAX_REMARK_LENGTH), [])).toBeNull();
    expect(remarkTextProblem("あ".repeat(MAX_REMARK_LENGTH + 1), [])).toBe("length");
  });
});
