import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AI_FAILED_NOTE,
  EVENTS,
  FIRST_HALF_QUESTIONS,
  HANDOVER_QUESTION,
  JUDGMENT_LABELS,
  JUDGMENT_NOTE,
  PREP_ACTIONS,
  RECOVERY_QUESTION,
  REVIEW_EVENT_HEADING,
  REVIEW_RECOVERY_LABEL,
  TIMINGS,
  VIEWPOINT_LABELS,
  VIEWPOINT_ORDER,
} from "../flow/content";
import { initialState, type TrainingState } from "../flow/training";
import type { Answer, Judgments } from "../flow/types";
import { Review } from "./Review";

/** 試験は DOM の無い環境で動くので、文字列に描いて確かめる。回答はすべて架空の試験用の文 */
const answer = (questionId: string, half: Answer["half"], text: string): Answer => ({
  questionId,
  half,
  text,
  prompt: `${questionId} の質問`,
  kind: "answer",
  recall: false,
});

const firstAnswers = [answer(FIRST_HALF_QUESTIONS[0].id, "first", "試験の回答・前半")];

const mixed: Judgments = {
  location: "confirmed",
  alternative: "aware_unconfirmed",
  current: "not_mentioned",
  unrecorded: "confirmed",
  proxy: "confirmed",
};
const allConfirmed: Judgments = {
  location: "confirmed",
  alternative: "confirmed",
  current: "confirmed",
  unrecorded: "confirmed",
  proxy: "confirmed",
};

const state = (patch: Partial<TrainingState>): TrainingState => ({
  ...initialState,
  stage: { name: "review" },
  ai: "on",
  closingAck: "試験の受け止め",
  ...patch,
});

const battery = state({
  source: "smartphone",
  event: "battery",
  judgments: mixed,
  answers: [...firstAnswers, answer(RECOVERY_QUESTION.id, "second", "試験の回答・立て直し")],
});
const confirmedAll = state({
  source: "notebook",
  event: "notebook_home",
  judgments: allConfirmed,
  answers: [...firstAnswers, answer(RECOVERY_QUESTION.id, "second", "試験の回答・立て直し")],
});
const failed = state({
  source: "family",
  event: "family_unreachable",
  ai: "failed",
  judgments: mixed,
  answers: [...firstAnswers, answer(RECOVERY_QUESTION.id, "second", "試験の回答・立て直し")],
});
const handover = state({
  source: null,
  event: "handover",
  judgments: mixed,
  answers: [...firstAnswers, answer(HANDOVER_QUESTION.id, "second", "試験の回答・説明し直し")],
});

const render = (s: TrainingState) => renderToStaticMarkup(<Review state={s} onChoose={() => {}} />);

const H = {
  weak: "<h2>手薄なところ</h2>",
  event: `<h2>${REVIEW_EVENT_HEADING}</h2>`,
  viewpoints: "<h2>5つの観点</h2>",
  raw: "<h2>あなたの回答（入力したまま）</h2>",
  recall: "<h2>今ここで確かめましょう</h2>",
  prep: "<h2>次の準備を1つ決める</h2>",
};

/** 見出しが、この順に1回ずつ出ていること */
function expectOrder(html: string, headings: string[]) {
  const positions = headings.map((h) => {
    expect(html.split(h)).toHaveLength(2);
    return html.indexOf(h);
  });
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
}

/** from の見出しから to の見出しまでの部分 */
const between = (html: string, from: string, to: string) =>
  html.slice(html.indexOf(from), html.indexOf(to));

describe("⑥振り返りの並びと絵（A-05 の⑥、Issue #49）", () => {
  it("判定が混在する回：受け止め → 手薄 → 出来事と立て直し → 判定 → 原文 → 今ここで → 次の準備", () => {
    const html = render(battery);
    expect(html.indexOf("試験の受け止め")).toBeLessThan(html.indexOf(H.weak));
    expectOrder(html, [H.weak, H.event, H.viewpoints, H.raw, H.recall, H.prep]);
  });

  it("手薄なところは、確認していない・未確認と気づいた観点だけを、絵と観点の名前・判定の文字で示す", () => {
    const html = render(battery);
    const weak = between(html, H.weak, H.event);
    expect(weak).toContain(VIEWPOINT_LABELS.alternative);
    expect(weak).toContain(VIEWPOINT_LABELS.current);
    expect(weak).not.toContain(VIEWPOINT_LABELS.location);
    expect(weak).toContain(JUDGMENT_LABELS.aware_unconfirmed);
    expect(weak).toContain(JUDGMENT_LABELS.not_mentioned);
    const svgs = weak.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });

  it("5つの観点の判定の文字がすべて出て、JUDGMENT_NOTE が判定の一覧の直後にある", () => {
    const html = render(battery);
    const section = between(html, H.viewpoints, H.raw);
    for (const v of VIEWPOINT_ORDER) {
      expect(section).toContain(`<dt>${VIEWPOINT_LABELS[v]}</dt><dd>${JUDGMENT_LABELS[mixed[v]]}</dd>`);
    }
    expect(html).toContain(`</dl><p class="small">${JUDGMENT_NOTE}</p>`);
  });

  it("出来事と立て直し：電池切れで使えなくなった2つを、絵・斜線・「（使えない）」で示し、立て直しの回答を原文で出す", () => {
    const html = render(battery);
    const section = between(html, H.event, H.viewpoints);
    expect(section).toContain(EVENTS.battery.text);
    expect(section).toContain(EVENTS.battery.unavailable!);
    expect(section).toContain("スマートフォン<span class=\"source-chip-state\">（使えない）</span>");
    expect(section).toContain("アプリ・マイナポータル<span class=\"source-chip-state\">（使えない）</span>");
    expect(section.match(/class="source-chip-slash" aria-hidden="true"/g)).toHaveLength(2);
    expect(section).toContain(`<h3>${REVIEW_RECOVERY_LABEL}</h3>`);
    expect(section).toContain("試験の回答・立て直し");
    expect(section).not.toContain("試験の回答・前半");
  });

  it("回答の原文は出来事の前後に分けたまま、その間に出来事と使えなくなったものを示す", () => {
    const html = render(battery);
    const raw = between(html, H.raw, H.recall);
    const before = raw.indexOf("<h3>出来事の前</h3>");
    const divider = raw.indexOf("<h3>出来事</h3>");
    const after = raw.indexOf("<h3>出来事の後</h3>");
    expect(before).toBeGreaterThan(-1);
    expect(before).toBeLessThan(divider);
    expect(divider).toBeLessThan(after);
    expect(raw.indexOf("試験の回答・前半")).toBeLessThan(divider);
    expect(raw.indexOf("試験の回答・立て直し")).toBeGreaterThan(after);
    expect(raw.slice(divider, after)).toContain("（使えない）");
  });

  it("準備行動とそのときは大きなカード。準備行動には絵（aria-hidden）が付き、「これに決める」は fieldset の直後", () => {
    const html = render(battery);
    const prep = html.slice(html.indexOf(H.prep));
    expect(prep.match(/<label class="mode-card">/g)).toHaveLength(PREP_ACTIONS.length + TIMINGS.length);
    for (const a of PREP_ACTIONS) expect(prep).toContain(`<span class="mode-card-label">${a.label}</span>`);
    for (const t of TIMINGS) expect(prep).toContain(`<span class="mode-card-label">${t.label}</span>`);
    const actionSet = prep.slice(0, prep.indexOf("<legend>いつやるか</legend>"));
    const svgs = actionSet.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(PREP_ACTIONS.length);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
    expect(prep).toContain('</fieldset><button type="button" class="primary" disabled="">これに決める</button>');
    // 何も選ばないうちは、どのラジオも選ばれていない
    expect(prep).not.toContain('checked=""');
  });

  it("全部「確認できた」の回：手薄なところを出さず、ほかの順は崩れない", () => {
    const html = render(confirmedAll);
    expect(html).not.toContain(H.weak);
    expect(html).not.toContain('class="weak-item"');
    expectOrder(html, [H.event, H.viewpoints, H.raw, H.recall, H.prep]);
    expect(html).toContain("お薬手帳<span class=\"source-chip-state\">（使えない）</span>");
  });

  it("全部「判定できませんでした」の回（ai: failed）：手薄なところを出さず、判定できなかった知らせと判定の文字を出す", () => {
    const html = render(failed);
    expect(html).not.toContain(H.weak);
    expect(html).not.toContain('class="weak-item"');
    expectOrder(html, [H.event, H.viewpoints, H.raw, H.recall, H.prep]);
    expect(html).toContain(AI_FAILED_NOTE);
    expect(html.split(`<dd>${JUDGMENT_LABELS.undetermined}</dd>`)).toHaveLength(VIEWPOINT_ORDER.length + 1);
  });

  it("source が null（係の交代）：出来事の文と説明し直しの回答は出し、使えなくなったものの絵・斜線・「（使えない）」は出さない", () => {
    const html = render(handover);
    expectOrder(html, [H.weak, H.event, H.viewpoints, H.raw, H.recall, H.prep]);
    const section = between(html, H.event, H.viewpoints);
    expect(section).toContain(EVENTS.handover.text);
    expect(section).toContain("試験の回答・説明し直し");
    expect(html).not.toContain("（使えない）");
    expect(html).not.toContain("source-chip-slash");
    expect(html).not.toContain("使えなくなったもの：");
  });
});
