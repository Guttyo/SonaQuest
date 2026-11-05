import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AI_CONNECTED,
  COMING_SOON_C01,
  INTRO_LEAD,
  INTRO_POINTS,
  PRIVACY_EXTERNAL,
  PRIVACY_OWN,
  PRIVACY_VOICE,
  PROTOTYPE_LEAD,
} from "../flow/content";
import { Intro } from "./Intro";

/** React が文字列に描くときの変換に合わせる（& < > " '） */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** 試験は DOM の無い環境で動くので、文字列に描いて確かめる。window が無いので初期選択は 2D */
const choose = renderToStaticMarkup(<Intro onStart={() => {}} />);
const choose3d = renderToStaticMarkup(<Intro onStart={() => {}} initialMode="3d" />);
const notes2d = renderToStaticMarkup(<Intro onStart={() => {}} initialView="notes" initialMode="2d" />);
const notes3d = renderToStaticMarkup(<Intro onStart={() => {}} initialView="notes" initialMode="3d" />);
const lead = AI_CONNECTED ? INTRO_LEAD : PROTOTYPE_LEAD;
const REQUIRED = [lead, ...INTRO_POINTS, PRIVACY_OWN, PRIVACY_EXTERNAL, PRIVACY_VOICE];
const radios = choose.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];

describe("はじめにの1画面目：答え方をカードで選ぶ（A-14、Issue #51）", () => {
  it("2D と 3D のカードを選べ、既定は 2D", () => {
    expect(radios).toHaveLength(2);
    expect(radios[0]).toContain('value="2d"');
    expect(radios[0]).toContain('checked=""');
    expect(radios[1]).toContain('value="3d"');
    expect(radios[1]).not.toContain("checked");
    expect(radios[1]).not.toContain("disabled");
    expect(choose.match(/<label class="mode-card">/g)).toHaveLength(2);
    expect(choose).toContain("<legend>答え方を選ぶ</legend>");
  });

  it("カードの絵は飾りで、意味は文字で示す（aria-hidden）", () => {
    const svgs = choose.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(3);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });

  it("C-01 の Coming soon は鍵付きの押せないカードで、ボタン・リンク・ラジオでない（PRD「Coming soon の表示の決まり」）", () => {
    const text = escapeHtml(COMING_SOON_C01);
    expect(choose).toContain(text);
    expect(choose).toMatch(/<p class="mode-card locked" aria-disabled="true">/);
    expect(choose).not.toMatch(new RegExp(`<(button|a|input|label)[^>]*>[^<]*${text.slice(0, 10)}`));
    expect(choose).not.toContain("<a ");
  });

  it("1画面目から訓練は始められず、長い文も置かない（2026-11-05 オーナー決定「2画面目に全文」）", () => {
    expect(choose).not.toContain("訓練をはじめる");
    expect(choose.match(/<button/g)).toHaveLength(1);
    expect(choose).toContain(">次へ</button>");
    for (const text of REQUIRED) expect(choose).not.toContain(escapeHtml(text));
  });

  it("並び：問いかけ → 題 → カード → Coming soon → 次へ", () => {
    const order = [
      "もしもの時、自分の薬のことを伝えられますか？",
      "<h1",
      "<legend>",
      'value="3d"',
      escapeHtml(COMING_SOON_C01),
      ">次へ</button>",
    ].map((needle) => choose.indexOf(needle));
    for (const index of order) expect(index).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
});

describe("はじめにの2画面目「はじめる前に」：必ず見せる説明の全文と開始", () => {
  it("必須の説明の全文が、開く操作なしで画面にある（文は変えない。A-08、privacy.md）", () => {
    for (const html of [notes2d, notes3d]) {
      for (const text of REQUIRED) expect(html).toContain(escapeHtml(text));
      expect(html).not.toContain("<details");
      expect(html).toContain('<div class="intro-notes">');
      expect(html).toContain("<h1");
      expect(html).toContain(">はじめる前に</h1>");
    }
  });

  it("選んだ答え方を文字で示し、訓練をはじめると選び直すがある", () => {
    expect(notes2d).toContain("選んでいる答え方：</span>文字で答える");
    expect(notes3d).toContain("選んでいる答え方：</span>声で答えて読み上げを聞く");
    for (const html of [notes2d, notes3d]) {
      expect(html.match(/<button/g)).toHaveLength(2);
      expect(html).toContain(">訓練をはじめる</button>");
      expect(html).toContain(">答え方を選び直す</button>");
      expect(html).not.toContain('type="radio"');
    }
  });

  it("3D を選んだときは声の送信先（PRIVACY_VOICE）を先頭の目立つ位置に、2D のときは会話の扱いの中に出す（ADR-0033）", () => {
    const voice = escapeHtml(PRIVACY_VOICE);
    expect(notes3d).toContain(`<p class="notice" id="privacy-voice">${voice}</p>`);
    expect(notes3d.indexOf(voice)).toBeLessThan(notes3d.indexOf(escapeHtml(lead)));
    expect(notes3d.match(new RegExp(voice.slice(0, 20), "g"))).toHaveLength(1);
    expect(notes2d).toContain(`<li id="privacy-voice">${voice}</li>`);
    expect(notes2d.indexOf(voice)).toBeGreaterThan(notes2d.indexOf(escapeHtml(PRIVACY_EXTERNAL)));
    expect(notes2d.match(new RegExp(voice.slice(0, 20), "g"))).toHaveLength(1);
  });

  it("並び：題 → 選んだ答え方 → 必須の説明 → 会話の扱い → 訓練をはじめる → 選び直す", () => {
    const order = [
      ">はじめる前に</h1>",
      "選んでいる答え方：",
      escapeHtml(lead),
      escapeHtml(INTRO_POINTS[0]),
      escapeHtml(PRIVACY_OWN),
      escapeHtml(PRIVACY_EXTERNAL),
      escapeHtml(PRIVACY_VOICE),
      ">訓練をはじめる</button>",
      ">答え方を選び直す</button>",
    ].map((needle) => notes2d.indexOf(needle));
    for (const index of order) expect(index).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
});

describe("はじめにの初期選択の受け渡し（Issue #83）", () => {
  // App は currentIntroMode(session) を initialMode に渡す（最初の表示だけ ?mode=3d を読む。mode.test.ts）。
  // 「答え方を選び直す」は画面だけを戻し、選んだ値は Intro の中に残る（画面での確認は docs/STATUS.md）
  it("initialMode に 3D を渡すと、1画面目で 3D のカードが選ばれている", () => {
    const radios3d = choose3d.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios3d).toHaveLength(2);
    expect(radios3d[0]).not.toContain("checked");
    expect(radios3d[1]).toContain('value="3d"');
    expect(radios3d[1]).toContain('checked=""');
  });

  it("initialMode を省くと、URL を読まずに既定の 2D", () => {
    expect(radios[0]).toContain('checked=""');
    expect(radios[1]).not.toContain("checked");
  });
});
