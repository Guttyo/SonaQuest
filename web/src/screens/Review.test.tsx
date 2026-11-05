import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AI_FAILED_NOTE,
  EVENTS,
  FIRST_HALF_QUESTIONS,
  HANDOVER_QUESTION,
  INTERRUPTION_NOTE,
  JUDGMENT_LABELS,
  JUDGMENT_NOTE,
  PREP_ACTIONS,
  PUBLIC_SOURCES,
  RECALL_FEEDBACK,
  RECOVERY_QUESTION,
  REVIEW_EVENT_HEADING,
  REVIEW_RECOVERY_LABEL,
  REVIEW_SOURCES_HEADING,
  REVIEW_SOURCES_NOTE,
  TIMINGS,
  VIEWPOINT_LABELS,
  VIEWPOINT_ORDER,
} from "../flow/content";
import { orderPrepActions, verifiedSourcesFor } from "../flow/rules";
import { initialState, type TrainingState } from "../flow/training";
import type { Answer, Judgments, PrepActionId } from "../flow/types";
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

  it("「今ここで確かめましょう」に、中断すると体調を崩しやすい薬の固定文が、思い出せないときの案内の後に、どの回でも1回出る（Issue #94）", () => {
    for (const s of [battery, confirmedAll, failed, handover]) {
      const html = render(s);
      const recall = between(html, H.recall, H.prep);
      expect(recall.split(INTERRUPTION_NOTE)).toHaveLength(2);
      expect(recall.indexOf(INTERRUPTION_NOTE)).toBeGreaterThan(
        recall.indexOf(RECALL_FEEDBACK[RECALL_FEEDBACK.length - 1]),
      );
      // 振り返りの固定文は、ほかの場所には出ない
      expect(html.split(INTERRUPTION_NOTE)).toHaveLength(2);
    }
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

describe("⑥振り返りの公的資料（A-06）", () => {
  const verified = {
    publisher: "試験の発行元",
    title: "試験の題",
    section: "試験の見出し",
    url: "https://example.test/verified",
    checkedOn: "2026-11-05",
    verified: true,
  };
  const pending = { ...verified, title: "未確認の題", url: "https://example.test/pending", verified: false };
  const sources = { verified, pending };
  const links = {
    notebook_bag: ["verified", "pending"],
    photo_and_paper: ["pending"],
    wallet_memo: [],
    tell_family: [],
    pharmacy_contact: [],
    check_portal: ["verified"],
  } as const;
  const sourcesFor = (a: PrepActionId) => verifiedSourcesFor(a, sources, links);
  const renderWith = (s: TrainingState) =>
    renderToStaticMarkup(<Review state={s} onChoose={() => {}} sourcesFor={sourcesFor} />);
  const heading = `<h2>${REVIEW_SOURCES_HEADING}</h2>`;

  it("verifiedSourcesFor は確認済みのものだけを返す", () => {
    expect(sourcesFor("notebook_bag")).toEqual([verified]);
    expect(sourcesFor("photo_and_paper")).toEqual([]);
    expect(sourcesFor("tell_family")).toEqual([]);
  });

  it("今の資料の一覧では、オーナーが確認済みにした3件だけを、対応する準備行動に出す", () => {
    const urls = (id: PrepActionId) => verifiedSourcesFor(id).map((s) => s.url);
    expect(urls("notebook_bag")).toEqual([PUBLIC_SOURCES.gov_online_prep.url]);
    expect(urls("photo_and_paper")).toEqual([PUBLIC_SOURCES.fdma_ecollege_pack.url]);
    expect(urls("check_portal")).toEqual([PUBLIC_SOURCES.myna_faq_medicine.url]);
    for (const id of ["wallet_memo", "tell_family", "pharmacy_contact"] as const) expect(urls(id)).toEqual([]);
    const html = render(battery);
    expect(html).toContain(REVIEW_SOURCES_HEADING);
    // オーナーが選ばなかった資料（厚生労働省の報告書、マイナポータルのお知らせ）は出さない
    expect(html).not.toContain(PUBLIC_SOURCES.mhlw_after_service_10_disaster.url);
    expect(html).not.toContain(PUBLIC_SOURCES.myna_news_medicine.url);
  });

  it("確認済みの資料を、今ここで確かめましょうと次の準備の間に、準備行動の名前の下に出す", () => {
    const html = renderWith(battery);
    expectOrder(html, [H.recall, heading, H.prep]);
    const section = between(html, heading, H.prep);
    expect(section).toContain(REVIEW_SOURCES_NOTE);
    const label = (id: PrepActionId) => PREP_ACTIONS.find((a) => a.id === id)!.label;
    expect(section).toContain(`<h3>${label("notebook_bag")}</h3>`);
    expect(section).toContain(`<h3>${label("check_portal")}</h3>`);
    // 確認済みの資料が無い準備行動は、ここには出さない（カードではリンクなしで出る）
    expect(section).not.toContain(label("photo_and_paper"));
    expect(section).not.toContain(label("tell_family"));
    // 並びは準備行動のカードと同じ（orderPrepActions）
    const order = orderPrepActions(mixed).filter((id) => id === "notebook_bag" || id === "check_portal");
    expect(section.indexOf(label(order[0]))).toBeLessThan(section.indexOf(label(order[1])));
  });

  it("リンクは別のタブで開き、発行元・題・見出し・確認日を出す。未確認の資料は出さない", () => {
    const section = between(renderWith(battery), heading, H.prep);
    expect(section).toContain(
      '<a href="https://example.test/verified" target="_blank" rel="noopener noreferrer">試験の発行元「試験の題」</a>',
    );
    expect(section).toContain("試験の見出し。確認日 2026-11-05");
    expect(section).not.toContain("未確認の題");
    expect(section).not.toContain("https://example.test/pending");
  });

  it("リンクは準備行動のカード（label）の中に入れない", () => {
    const html = renderWith(battery);
    const cards = html.slice(html.indexOf(H.prep));
    expect(cards).not.toContain("<a ");
  });
});
