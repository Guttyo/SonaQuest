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
const html = renderToStaticMarkup(<Intro onStart={() => {}} />);
const lead = AI_CONNECTED ? INTRO_LEAD : PROTOTYPE_LEAD;

describe("はじめにの画面（A-14、Issue #51）", () => {
  it("必須の説明の全文が、開く操作なしで画面にある（文は変えない。A-08、privacy.md）", () => {
    for (const text of [lead, ...INTRO_POINTS, PRIVACY_OWN, PRIVACY_EXTERNAL, PRIVACY_VOICE]) {
      expect(html).toContain(escapeHtml(text));
    }
    expect(html).not.toContain("<details");
  });

  it("2D と 3D を選べ、既定は 2D。選んだ結果を文字で添える", () => {
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(2);
    expect(radios[0]).toContain('value="2d"');
    expect(radios[0]).toContain('checked=""');
    expect(radios[1]).toContain('value="3d"');
    expect(radios[1]).not.toContain("checked");
    expect(radios[1]).not.toContain("disabled");
    expect(html).toContain("<legend>答え方を選ぶ</legend>");
    expect(html).toContain("選んでいる答え方：</span>文字で答える");
  });

  it("3D の選択肢は、声の送信先の説明（PRIVACY_VOICE）を参照する", () => {
    const radio3d = (html.match(/<input[^>]*type="radio"[^>]*>/g) ?? []).find((tag) =>
      tag.includes('value="3d"'),
    );
    expect(radio3d).toContain('aria-describedby="privacy-voice"');
    expect(html).toContain(`<p id="privacy-voice">${escapeHtml(PRIVACY_VOICE)}</p>`);
  });

  it("C-01 の Coming soon は押せない文字で、ボタンでもリンクでもない（PRD「Coming soon の表示の決まり」）", () => {
    const text = escapeHtml(COMING_SOON_C01);
    expect(html).toContain(text);
    expect(html).toContain(`<p class="coming-soon">${text}</p>`);
    expect(html).not.toMatch(new RegExp(`<(button|a|input)[^>]*>[^<]*${text.slice(0, 10)}`));
    // 押せるのは「訓練をはじめる」だけ
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain("<a ");
    expect(html).toContain(">訓練をはじめる</button>");
  });

  it("並び：問いかけ → 題 → 必須の説明 → 会話の扱い → モード選択 → 声の送信先 → Coming soon → 開始", () => {
    const order = [
      "もしもの時、自分の薬のことを伝えられますか？",
      "<h1",
      escapeHtml(lead),
      escapeHtml(INTRO_POINTS[0]),
      escapeHtml(PRIVACY_OWN),
      escapeHtml(PRIVACY_EXTERNAL),
      "<legend>",
      'value="3d"',
      escapeHtml(PRIVACY_VOICE),
      escapeHtml(COMING_SOON_C01),
      "訓練をはじめる",
    ].map((needle) => html.indexOf(needle));
    for (const index of order) expect(index).toBeGreaterThanOrEqual(0);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
});
