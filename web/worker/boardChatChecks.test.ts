// ボードの掲示板チャット（B-07、ADR-0047）の文の検査の試験（docs/safety-test-plan.md H8）。
// 薬剤以外の連絡は通し、薬・病名・量・助言・診断・個人の情報・許していない言葉・長すぎる文は捨てる。

import { describe, expect, it } from "vitest";
import { MAX_CHAT_TEXT_LENGTH } from "../src/board/chat/contract";
import { chatTextProblem, chatUnknownTerms, stripRolePrefix } from "./boardChatChecks";

describe("掲示板チャットの文の検査：薬剤以外の連絡は通す", () => {
  it.each([
    "夕方の搬送便で処方箋の用紙を50枚届けます。受け取ったら全体連絡で知らせてください。",
    "救護所Bです。毛布と飲み水が足りません。明日の朝までに20人分お願いします。",
    "薬剤師1名を午後から救護所Cへ回します。交代は18時の予定です。",
    "皆さん、次の報告は15時です。紙の記録は連絡員に渡してください。",
    "トイレの数が足りません。ブルーシートとテントも追加をお願いします。",
    "HQです。救護所Dの連絡員が戻り次第、紙の記録を受け取ります。",
    "衛星回線は夜もつながっています。スタッフの食事は30人分届きました。",
    "洗剤とタオルを次の便に積みます。",
    "ガソリンが残り少ないので、トラックのルートを短くします。",
    "近くの総合病院へ向かう道が通れるようになりました。",
    "患者さんの待合のいすが足りません。毛布も追加をお願いします。",
    "本部と救護所Aだけの欄で、次の便の時刻を知らせます。",
    "毛布を2ヶ所に分けて届けます。",
    "トイレ タオル、ブルーシートを積みました。",
    "救護所A と B に、すごーく助かったと伝えてください。",
  ])("%s", (text) => {
    expect(chatTextProblem(text)).toBeNull();
  });
});

describe("掲示板チャットの文の検査：薬・医療に触れる文は捨てる", () => {
  it.each([
    ["薬の名前", "降圧薬が足りません。"],
    ["剤の言葉", "解熱剤を届けてください。"],
    ["錠", "残りは30錠です。"],
    ["量の単位", "5mgのものを回してください。"],
    ["日分", "3日分の備えを送ります。"],
    ["病名（〜病）", "糖尿病の人が多いです。"],
    ["病名（〜症）", "熱中症の人が出ています。"],
    ["症状", "発熱の人が3人います。"],
    ["体調", "スタッフの体調に気をつけてください。"],
    ["服用", "服用の確認をお願いします。"],
    ["飲み方", "朝晩に飲んでもらってください。"],
    ["効き目", "よく効くものを選びます。"],
    ["診断", "医師の診断を待ちます。"],
    ["緊急度", "重症の人を先に運びます。"],
    ["制度", "支援の制度を使えます。"],
    ["インスリン", "インスリンの冷蔵が必要です。"],
    ["空白をはさむ", "解 熱 剤を届けます。"],
  ])("%s：%s", (_label, text) => {
    expect(chatTextProblem(text)).toBe("forbidden");
  });
});

describe("掲示板チャットの文の検査：個人の情報・外への誘導は捨てる", () => {
  it.each([
    ["人の名前", "田中さんが受け取ります。"],
    ["先生", "山田先生に伝えました。"],
    ["電話番号の形", "連絡は090-1234-5678へ。"],
    ["URL", "https://example.com を見てください。"],
    ["メールの宛先", "board@example へ送ります。"],
    ["住所", "住所を書いてください。"],
  ])("%s：%s", (_label, text) => {
    expect(chatTextProblem(text)).toBe("forbidden");
  });
});

describe("掲示板チャットの文の検査：許していないカタカナ・英字の言葉は捨てる", () => {
  it("一覧に無いカタカナの言葉（薬の名前の多くがカタカナ）", () => {
    expect(chatTextProblem("アムロジンを届けます。")).toBe("unknown_term");
    expect(chatUnknownTerms("アムロジンとトイレ")).toEqual(["アムロジン"]);
  });

  it("空白・改行・中黒で分けたカタカナの言葉も捨てる（すり抜け）", () => {
    expect(chatTextProblem("ア ム ロ ジ ンを届けます。")).toBe("unknown_term");
    expect(chatTextProblem("ア\nム\nロを届けます。")).toBe("unknown_term");
    expect(chatTextProblem("ア・ム・ロを届けます。")).toBe("unknown_term");
  });

  it("1文字のカタカナも、数える言葉（ヶ・ヵ）と長音のほかは捨てる", () => {
    expect(chatTextProblem("カを届けます。")).toBe("unknown_term");
    expect(chatUnknownTerms("1ヶ所と2ヵ所")).toEqual([]);
  });

  it("許可の言葉をつなげた並びは通し、一覧に無い言葉が混じれば捨てる", () => {
    expect(chatUnknownTerms("トイレタオル")).toEqual([]);
    expect(chatUnknownTerms("トイレアムロ")).toEqual(["トイレアムロ"]);
  });

  it("英字の言葉は HQ と救護所の記号（大文字の A〜D の1文字）だけを許す", () => {
    expect(chatTextProblem("Please send water.")).toBe("unknown_term");
    expect(chatTextProblem("DMで知らせます。")).toBe("unknown_term");
    expect(chatTextProblem("救護所Xへ届けます。")).toBe("unknown_term");
    expect(chatTextProblem("救護所aへ届けます。")).toBe("unknown_term");
    expect(chatUnknownTerms("HQ から救護所A・B・C・D へ")).toEqual([]);
    expect(chatUnknownTerms("HQ と救護所A")).toEqual([]);
  });

  it("長音で終わる語は、長音を外して一覧と照らす", () => {
    expect(chatUnknownTerms("バッテリーの充電")).toEqual([]);
  });
});

describe("掲示板チャットの文の検査：長さ", () => {
  it("空の文と上限を超える文は捨てる", () => {
    expect(chatTextProblem("")).toBe("length");
    expect(chatTextProblem("  ")).toBe("length");
    expect(chatTextProblem("あ".repeat(MAX_CHAT_TEXT_LENGTH + 1))).toBe("length");
    expect(chatTextProblem("あ".repeat(MAX_CHAT_TEXT_LENGTH))).toBeNull();
  });
});

describe("先頭の役の名前を外す", () => {
  it.each([
    ["救護所B：毛布が届きました。", "毛布が届きました。"],
    ["本部（HQ）: 次の報告は15時です。", "次の報告は15時です。"],
    ["HQ：了解です。", "了解です。"],
    ["毛布が届きました。", "毛布が届きました。"],
  ])("%s", (input, expected) => {
    expect(stripRolePrefix(input)).toBe(expected);
  });
});
