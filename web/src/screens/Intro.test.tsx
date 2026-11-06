import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AI_CONNECTED,
  COMING_SOON_C01,
  INTRO_ANSWER_GROUPS,
  INTRO_FLOW_STEPS,
  INTRO_LEAD,
  INTRO_POINT_TAGS,
  INTRO_POINTS,
  PRIVACY_EXTERNAL,
  PRIVACY_HEADS,
  PRIVACY_OWN,
  PRIVACY_VOICE,
  PROTOTYPE_LEAD,
  SEND_MAP_KEEP,
  SEND_MAP_TEXT_ONLY,
  SEND_ROUTES,
} from "../flow/content";
import { BOARD_ENTRY_LABEL, COMING_SOON_INTAKE } from "../board/text";
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
    // 上の帯の絵（Issue #183）・2D・3D・C-01 の鍵・ボードへの入口（Issue #162）。問診モードは文だけで、絵は無い（Issue #101）
    expect(svgs).toHaveLength(5);
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
    // ボタンは「次へ」と、訓練の外の画面（地域本部のボード）へ入るものの2つ（Issue #97）
    expect(choose.match(/<button/g)).toHaveLength(2);
    expect(choose).toContain(">次へ</button>");
    expect(choose).toContain(`<span>${escapeHtml(BOARD_ENTRY_LABEL)}</span></button>`);
    for (const text of REQUIRED) expect(choose).not.toContain(escapeHtml(text));
  });

  it("「次へ」が主ボタンで、その直下にボードへのボタン、その下に問診モード（将来構想）の説明の文（Issue #101）", () => {
    const text = escapeHtml(COMING_SOON_INTAKE);
    expect(choose).toContain('<button type="button" class="primary">次へ</button>');
    // Issue #162：絵（読み上げない）と文字の入口。塗りつぶしの primary にはしない
    expect(choose).toMatch(
      new RegExp(
        `<button type="button" class="secondary board-entry"><svg class="board-entry-icon"[^>]*aria-hidden="true"[\\s\\S]*?</svg><span>${escapeHtml(BOARD_ENTRY_LABEL)}</span></button>`,
      ),
    );
    expect(choose).toContain(`<p class="intro-aside">${text}</p>`);
    // 問診モードはボタン・リンク・カードにしない（押せるものに見せない）
    expect(choose).not.toMatch(new RegExp(`<(button|a|input|label)[^>]*>[^<]*${text.slice(0, 10)}`));
    expect(choose.match(/<p class="mode-card locked"/g)).toHaveLength(1);
    const next = choose.indexOf(">次へ</button>");
    const board = choose.indexOf(escapeHtml(BOARD_ENTRY_LABEL));
    expect(next).toBeLessThan(board);
    expect(board).toBeLessThan(choose.indexOf(text));
    // 「次へ」とボードのボタンの間に、ほかの部品を置かない
    expect(choose.slice(next, board)).toMatch(/^>次へ<\/button><button type="button" class="secondary board-entry"><svg[\s\S]*<\/svg><span>$/);
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
    expect(notes3d).toContain("選んでいる答え方：</span>自分の声で答える");
    for (const html of [notes2d, notes3d]) {
      expect(html.match(/<button/g)).toHaveLength(2);
      expect(html).toContain(">訓練をはじめる</button>");
      expect(html).toContain(">答え方を選び直す</button>");
      expect(html).not.toContain('type="radio"');
    }
  });

  it("声の送信先（PRIVACY_VOICE）の全文は、2D・3D とも会話の扱いの中に1回だけ出す（ADR-0033。Issue #212 の2つめ）", () => {
    const voice = escapeHtml(PRIVACY_VOICE);
    for (const html of [notes2d, notes3d]) {
      expect(html).toContain(`<li class="privacy-item" id="privacy-voice"><p class="privacy-head">`);
      expect(html).toContain(`</span></p><p>${voice}</p></li>`);
      expect(html.indexOf(voice)).toBeGreaterThan(html.indexOf(escapeHtml(PRIVACY_EXTERNAL)));
      expect(html.match(new RegExp(voice.slice(0, 20), "g"))).toHaveLength(1);
    }
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

describe("「はじめる前に」の図と札（Issue #212。畳まず図で整理）", () => {
  it("訓練の流れの図を、順番のあるリスト（ol）で、5つの段階を並びどおりに出す", () => {
    for (const html of [notes2d, notes3d]) {
      expect(html).toContain('<ol class="intro-flow">');
      const indexes = INTRO_FLOW_STEPS.map((step) =>
        html.indexOf(`<span class="intro-flow-label">${escapeHtml(step.label)}</span>`),
      );
      for (const index of indexes) expect(index).toBeGreaterThanOrEqual(0);
      for (let i = 1; i < indexes.length; i++) expect(indexes[i]).toBeGreaterThan(indexes[i - 1]);
      for (const step of INTRO_FLOW_STEPS) expect(html).toContain(escapeHtml(step.note));
    }
  });

  it("入れないもの／架空で答えるもの／自分のこととして答えるもの の3つの札を、見出しと項目の文字で出す", () => {
    expect(INTRO_ANSWER_GROUPS.map((group) => group.id)).toEqual(["never", "fictional", "own"]);
    for (const html of [notes2d, notes3d]) {
      for (const group of INTRO_ANSWER_GROUPS) {
        expect(html).toContain(`<span>${escapeHtml(group.label)}</span></h3>`);
        for (const item of group.items) expect(html).toContain(`<li>${escapeHtml(item)}</li>`);
      }
    }
  });

  it("注意の各項目に短い札を1つずつ、会話の扱いの各項目に要点の1行を添える（全文はそのまま続ける）", () => {
    expect(INTRO_POINT_TAGS).toHaveLength(INTRO_POINTS.length);
    for (const html of [notes2d, notes3d]) {
      INTRO_POINTS.forEach((point, index) => {
        expect(html).toContain(
          `<li><span class="point-tag">${escapeHtml(INTRO_POINT_TAGS[index])}</span><span>${escapeHtml(point)}</span></li>`,
        );
      });
      expect(html).toContain(`<span>${escapeHtml(PRIVACY_HEADS.own)}</span></p><p>${escapeHtml(PRIVACY_OWN)}</p>`);
      expect(html).toContain(`<span>${escapeHtml(PRIVACY_HEADS.external)}</span></p><p>${escapeHtml(PRIVACY_EXTERNAL)}</p>`);
      expect(html).toContain(`<span>${escapeHtml(PRIVACY_HEADS.voice)}</span></p><p>${escapeHtml(PRIVACY_VOICE)}</p>`);
    }
  });

  it("3D は「どこへ送るか」の図を先頭の目立つ枠に、声と読み上げの送り先を足して出す（ADR-0033）", () => {
    const map3d = notes3d.indexOf('<section class="intro-visual send-map send-map-voice"');
    expect(map3d).toBeGreaterThanOrEqual(0);
    expect(map3d).toBeLessThan(notes3d.indexOf('<ol class="intro-flow">'));
    expect(map3d).toBeLessThan(notes3d.indexOf(escapeHtml(lead)));
    for (const route of SEND_ROUTES) {
      expect(notes3d).toContain(`<span>${escapeHtml(route.from)}</span>`);
      expect(notes3d).toContain(`<span>${escapeHtml(route.to)}</span>`);
      expect(notes3d).toContain(escapeHtml(route.why));
    }
    expect(notes3d).toContain(escapeHtml(SEND_MAP_KEEP));
    expect(notes3d).not.toContain(escapeHtml(SEND_MAP_TEXT_ONLY));
  });

  it("2D の「どこへ送るか」は回答の送り先だけで、声を使わないことを添える。図と札の後に置く", () => {
    const map2d = notes2d.indexOf('<section class="intro-visual send-map"');
    expect(map2d).toBeGreaterThan(notes2d.indexOf('<ol class="intro-flow">'));
    expect(map2d).toBeLessThan(notes2d.indexOf(escapeHtml(lead)));
    expect(notes2d).not.toContain("send-map-voice");
    for (const route of SEND_ROUTES) {
      const shown = notes2d.includes(`<span>${escapeHtml(route.from)}</span>`);
      expect(shown).toBe(!route.voiceOnly);
    }
    expect(notes2d).toContain(escapeHtml(SEND_MAP_KEEP));
    expect(notes2d).toContain(escapeHtml(SEND_MAP_TEXT_ONLY));
  });

  it("送り先の矢印は読み上げず、「から」「へ」の文字で伝える", () => {
    for (const html of [notes2d, notes3d]) {
      expect(html).toContain('<span class="send-arrow" aria-hidden="true"></span>');
      expect(html).toContain('<span class="visually-hidden">から</span>');
      expect(html).toContain('<span class="visually-hidden">へ</span>');
    }
  });

  it("2画面目の絵はすべて飾りで、読み上げない（意味は隣の文字で示す）", () => {
    for (const html of [notes2d, notes3d]) {
      const svgs = html.match(/<svg[^>]*>/g) ?? [];
      expect(svgs.length).toBeGreaterThan(0);
      for (const svg of svgs) {
        expect(svg).toContain('aria-hidden="true"');
        expect(svg).toContain('focusable="false"');
      }
    }
  });

  it("図と札の短い文は、1画面目には出さない", () => {
    for (const step of INTRO_FLOW_STEPS) expect(choose).not.toContain(escapeHtml(step.note));
    expect(choose).not.toContain(escapeHtml(PRIVACY_HEADS.external));
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
