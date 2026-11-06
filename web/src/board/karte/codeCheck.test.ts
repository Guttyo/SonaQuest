// カルテの要約の1段目（コードでの確認）の試験（Issue #142、docs/safety-test-plan.md の H13）。
// 検査の語の一覧（codeCheck.ts の KARTE_FORBIDDEN_PATTERNS）と、この試験を一緒に直す。

import { describe, expect, it } from "vitest";
import { checkSummary, maskForbidden, MASKED_TEXT, quoteFound, termsNotInQuote, textForbidden } from "./codeCheck";
import { KARTE_ASPECTS, parseAuditRequest, parseKarteSummary, parseSummaryRequest, type KarteSummary } from "./contract";
import { findSample, KARTE_SAMPLES, PLANTED_DEMO_SAMPLE_ID, patientUtterances, plantedSummary } from "./samples";

const kinds = (s: KarteSummary, utterances: readonly string[]) => checkSummary(s, utterances).map((f) => f.kind);

describe("架空の会話の見本", () => {
  it("10本あり、ID が重ならない", () => {
    expect(KARTE_SAMPLES).toHaveLength(10);
    expect(new Set(KARTE_SAMPLES.map((s) => s.id)).size).toBe(10);
  });

  it("聞き手の質問に、助言・診断めいた言い方が無い", () => {
    for (const sample of KARTE_SAMPLES) {
      for (const turn of sample.turns.filter((t) => t.speaker === "staff")) {
        expect(textForbidden(turn.text.replace(/教えてください/g, "")), `${sample.id}: ${turn.text}`).toBe(false);
      }
    }
  });

  it("正解の要約は、10本すべてでコードでの確認の指摘が0件", () => {
    for (const sample of KARTE_SAMPLES) {
      expect(parseKarteSummary(sample.expected), sample.id).not.toBeNull();
      expect(checkSummary(sample.expected, patientUtterances(sample)), sample.id).toEqual([]);
    }
  });

  it("正解の要約は、5観点すべてを items か not_covered に1回ずつ持つ", () => {
    for (const sample of KARTE_SAMPLES) {
      const covered = new Set(sample.expected.items.map((i) => i.aspect));
      for (const aspect of KARTE_ASPECTS) {
        expect(covered.has(aspect) !== sample.expected.not_covered.includes(aspect), `${sample.id}: ${aspect}`).toBe(true);
      }
    }
  });
});

describe("根拠のない項目を必ず拾う（10本すべて）", () => {
  it("会話にない項目（planted）を足すと、その項目が quote_not_found になる", () => {
    for (const sample of KARTE_SAMPLES) {
      const summary = plantedSummary(sample);
      const findings = checkSummary(summary, patientUtterances(sample));
      const plantedIndex = summary.items.length - 1;
      expect(
        findings.some((f) => f.kind === "quote_not_found" && f.itemIndex === plantedIndex),
        sample.id,
      ).toBe(true);
      // 正解の項目には根拠なしを付けない
      expect(findings.filter((f) => f.kind === "quote_not_found" && f.itemIndex !== plantedIndex), sample.id).toEqual([]);
    }
  });

  it("正解のどの項目でも、quote を1文字変えると quote_not_found になる", () => {
    for (const sample of KARTE_SAMPLES) {
      sample.expected.items.forEach((item, i) => {
        const quote = item.quote.slice(0, -1) + (item.quote.endsWith("す") ? "た" : "す");
        const items = sample.expected.items.map((it, j) => (j === i ? { ...it, quote } : it));
        const findings = checkSummary({ ...sample.expected, items }, patientUtterances(sample));
        expect(findings, `${sample.id} #${i}`).toContainEqual({ kind: "quote_not_found", itemIndex: i, aspect: item.aspect });
      });
    }
  });

  it("聞き手の質問から抜いた quote は根拠にしない", () => {
    const sample = findSample("karte-01")!;
    const summary: KarteSummary = {
      ...sample.expected,
      items: [...sample.expected.items, { aspect: "proxy", text: "代わりに伝えられる人", quote: "代わりに伝えられる人はいますか" }],
    };
    expect(kinds(summary, patientUtterances(sample))).toEqual(["quote_not_found"]);
  });

  it("2つの発言をまたいだ quote は根拠にしない", () => {
    expect(quoteFound("入れています。スマホ", ["お薬手帳は入れています。", "スマホの写真"])).toBe(false);
  });

  it("文字どおりでない quote（全角と半角の違い、空白の違い）は根拠にしない", () => {
    const utterances = ["架空の降圧薬Aを朝に1錠です。"];
    expect(quoteFound("架空の降圧薬Aを朝に1錠", utterances)).toBe(true);
    expect(quoteFound("架空の降圧薬Ａを朝に１錠", utterances)).toBe(false);
    expect(quoteFound("架空の降圧薬A を朝に1錠", utterances)).toBe(false);
    expect(quoteFound("   ", utterances)).toBe(false);
  });

  it("短すぎる quote は quote_too_short", () => {
    const sample = findSample("karte-01")!;
    const items = sample.expected.items.map((it, j) => (j === 0 ? { ...it, quote: "手帳" } : it));
    expect(kinds({ ...sample.expected, items }, patientUtterances(sample))).toEqual(["quote_too_short"]);
  });
});

describe("text の確かめ", () => {
  it("量や名前が quote から変わったら text_adds_terms", () => {
    expect(termsNotInQuote("架空の降圧薬Aを朝に2錠", "架空の降圧薬Aを朝に1錠です")).toEqual(["2"]);
    expect(termsNotInQuote("架空の降圧薬Bを朝に1錠", "架空の降圧薬Aを朝に1錠です")).toEqual(["B"]);
    expect(termsNotInQuote("ドラッグストアの胃薬", "薬局で買った胃薬")).toEqual(["ドラッグストア"]);
    expect(termsNotInQuote("架空の降圧薬Aを朝に1錠", "架空の降圧薬Aを朝に1錠です")).toEqual([]);
    const sample = findSample("karte-01")!;
    const items = sample.expected.items.map((it, j) => (j === 2 ? { ...it, text: "架空の降圧薬Aを朝に2錠" } : it));
    expect(kinds({ ...sample.expected, items }, patientUtterances(sample))).toEqual(["text_adds_terms"]);
  });

  it("助言・診断めいた text は forbidden になり、画面に出す前に伏せる", () => {
    const bad = [
      "降圧薬Aを飲んでください",
      "このまま飲み続けてよい",
      "量を減らすとよい",
      "1錠にしてください",
      "高血圧の可能性がある",
      "副作用の可能性",
      "それなら大丈夫",
      "受診をおすすめします",
      "薬局に確認してください",
      "やめた方がよい",
      "緊急ではない",
      "飲むべき",
      "詳しくは https://example.test",
    ];
    for (const text of bad) expect(textForbidden(text), text).toBe(true);
    const sample = findSample("karte-01")!;
    const items = sample.expected.items.map((it, j) => (j === 2 ? { ...it, text: "降圧薬Aを飲んでください" } : it));
    const summary = { ...sample.expected, items };
    const findings = checkSummary(summary, patientUtterances(sample));
    expect(findings.map((f) => f.kind)).toEqual(["forbidden"]);
    expect(maskForbidden(summary, findings).items[2].text).toBe(MASKED_TEXT);
    expect(maskForbidden(summary, findings).items[0].text).toBe(summary.items[0].text);
  });

  it("空白をはさんでも、全角でも forbidden を拾う", () => {
    expect(textForbidden("飲 んで くだ さい")).toBe(true);
    expect(textForbidden("ｈｔｔｐｓ://example.test")).toBe(true);
  });

  it("本人の言葉の抜き出し（薬の名前・量・飲んでいる、を含む）は止めない", () => {
    const ok = ["架空の降圧薬Aを朝に1錠", "胃薬をときどき飲んでいる", "量はよく分からない", "名前は出てこない", "先週から架空の吸入薬Dが増えた"];
    for (const text of ok) expect(textForbidden(text), text).toBe(false);
  });

  it("長すぎる text・空の text は length", () => {
    const sample = findSample("karte-09")!;
    const long = { ...sample.expected.items[0], text: "お".repeat(61) };
    const empty = { ...sample.expected.items[0], text: " " };
    expect(kinds({ ...sample.expected, items: [long, sample.expected.items[1]] }, patientUtterances(sample))).toEqual(["length"]);
    expect(kinds({ ...sample.expected, items: [empty, sample.expected.items[1]] }, patientUtterances(sample))).toEqual(["length"]);
  });
});

describe("観点のそろい方", () => {
  it("items と not_covered の両方にある観点は aspect_conflict、どちらにも無い観点は aspect_missing", () => {
    const sample = findSample("karte-09")!;
    const conflict = { ...sample.expected, not_covered: [...sample.expected.not_covered, "location" as const] };
    expect(kinds(conflict, patientUtterances(sample))).toEqual(["aspect_conflict"]);
    const missing = { ...sample.expected, not_covered: ["alternative" as const] };
    expect(kinds(missing, patientUtterances(sample))).toEqual(["aspect_missing", "aspect_missing"]);
  });
});

describe("デモ用に誤りを混ぜた例", () => {
  it("デモの見本は、混ぜた1項目だけが根拠なしになる", () => {
    const sample = findSample(PLANTED_DEMO_SAMPLE_ID)!;
    const summary = plantedSummary(sample);
    expect(checkSummary(summary, patientUtterances(sample))).toEqual([
      { kind: "quote_not_found", itemIndex: summary.items.length - 1, aspect: sample.planted.aspect },
    ]);
  });
});

describe("入力の形", () => {
  it("要約の形が違えば null", () => {
    expect(parseKarteSummary({ items: [], not_covered: [], extra: 1 })).toBeNull();
    expect(parseKarteSummary({ items: [{ aspect: "medicine", text: "a", quote: "b" }], not_covered: [] })).toBeNull();
    expect(parseKarteSummary({ items: [{ aspect: "location", text: "a" }], not_covered: [] })).toBeNull();
    expect(parseKarteSummary({ items: [], not_covered: ["x"] })).toBeNull();
    expect(parseKarteSummary({ items: Array(11).fill({ aspect: "location", text: "a", quote: "bbbb" }), not_covered: [] })).toBeNull();
    expect(parseKarteSummary({ items: [{ aspect: "location", text: "あ".repeat(121), quote: "bbbb" }], not_covered: [] })).toBeNull();
  });

  it("入口の入力は、見本の ID の形と、決まった鍵だけを受け取る", () => {
    expect(parseSummaryRequest({ sampleId: "karte-01" })).toEqual({ sampleId: "karte-01", planted: false });
    expect(parseSummaryRequest({ sampleId: "karte-01", planted: true })).toEqual({ sampleId: "karte-01", planted: true });
    expect(parseSummaryRequest({ sampleId: "../etc" })).toBeNull();
    expect(parseSummaryRequest({ sampleId: "karte-01", conversation: "x" })).toBeNull();
    expect(parseAuditRequest({ sampleId: "karte-01", planted: true })).toEqual({ sampleId: "karte-01", planted: true });
    expect(parseAuditRequest({ sampleId: "karte-01", summary: findSample("karte-01")!.expected })).not.toBeNull();
    expect(parseAuditRequest({ sampleId: "karte-01", summary: { items: "x" } })).toBeNull();
    expect(parseAuditRequest({ sampleId: "karte-01", planted: false })).toBeNull();
  });
});
