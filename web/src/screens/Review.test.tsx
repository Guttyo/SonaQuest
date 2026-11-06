import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AI_FAILED_NOTE,
  DETAILS_SUMMARY,
  EVENTS,
  FIRST_HALF_QUESTIONS,
  HANDOVER_QUESTION,
  INTERRUPTION_NOTE,
  JUDGMENT_LABELS,
  JUDGMENT_NOTE,
  NEXT_STEPS_HEADING,
  NEXT_STEP_FIRST_TAG,
  NEXT_STEP_LABEL,
  NEXT_STEP_PICK,
  NO_WEAK_POINTS_NOTE,
  PREP_ACTIONS,
  PREP_ACTION_EFFECTS,
  PUBLIC_SOURCES,
  RECALL_FEEDBACK,
  RECOVERY_QUESTION,
  REVIEW_EVENT_HEADING,
  REVIEW_RECOVERY_LABEL,
  REVIEW_SOURCES_HEADING,
  REVIEW_SOURCES_NOTE,
  STRONG_POINTS_LABEL,
  TIMINGS,
  VIEWPOINT_LABELS,
  VIEWPOINT_ORDER,
  VIEWPOINT_SHORT_LABELS,
  WEAK_POINT_LINES,
} from "../flow/content";
import { nextSteps, orderPrepActions, verifiedSourcesFor } from "../flow/rules";
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
  next: `<h2>${NEXT_STEPS_HEADING}</h2>`,
  recall: "<h2>今ここで確かめましょう</h2>",
  prep: '<h2 id="prep-cards">次の準備を1つ決める</h2>',
  details: `<summary>${DETAILS_SUMMARY}</summary>`,
  event: `<h2>${REVIEW_EVENT_HEADING}</h2>`,
  viewpoints: "<h2>5つの観点</h2>",
  raw: "<h2>あなたの回答（入力したまま）</h2>",
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

const label = (id: PrepActionId) => PREP_ACTIONS.find((a) => a.id === id)!.label;

describe("⑥振り返りの並び（A-05 の⑥、Issue #49、ADR-0054）", () => {
  it("判定が混在する回：受け止め → まだ弱いところと次の一手 → 今ここで → 次の準備 → くわしく見る（出来事 → 5つの観点 → 原文）", () => {
    const html = render(battery);
    expect(html.indexOf("試験の受け止め")).toBeLessThan(html.indexOf(H.next));
    expectOrder(html, [H.next, H.recall, H.prep, H.details, H.event, H.viewpoints, H.raw]);
  });

  it("先頭に見えるのは短いまとめだけ：次の一手の前に、回答の原文も出来事の文も出ない", () => {
    const html = render(battery);
    const top = html.slice(0, html.indexOf(H.details));
    expect(top).not.toContain("試験の回答・前半");
    expect(top).not.toContain("試験の回答・立て直し");
    expect(top).not.toContain(EVENTS.battery.text);
    // 判定の意味（医学的な正しさではない）は、判定の文字が最初に出る先頭のまとめのすぐ下に1回だけ
    expect(html.split(JUDGMENT_NOTE)).toHaveLength(2);
    expect(html.indexOf(JUDGMENT_NOTE)).toBeLessThan(html.indexOf(H.recall));
  });

  it("出来事と立て直し、5つの観点、回答の原文、記録の形は details の中に残す（消さない）", () => {
    const html = render(battery);
    const details = html.slice(html.indexOf(H.details));
    expect(details).toContain(EVENTS.battery.text);
    expect(details).toContain(EVENTS.battery.unavailable!);
    expect(details).toContain(`<h3>${REVIEW_RECOVERY_LABEL}</h3>`);
    expect(details).toContain("試験の回答・立て直し");
    for (const v of VIEWPOINT_ORDER) {
      expect(details).toContain(`<dt>${VIEWPOINT_LABELS[v]}</dt><dd>${JUDGMENT_LABELS[mixed[v]]}</dd>`);
    }
    const raw = details.slice(details.indexOf(H.raw));
    const before = raw.indexOf("<h3>出来事の前</h3>");
    const divider = raw.indexOf("<h3>出来事</h3>");
    const after = raw.indexOf("<h3>出来事の後</h3>");
    expect(before).toBeGreaterThan(-1);
    expect(before).toBeLessThan(divider);
    expect(divider).toBeLessThan(after);
    expect(raw.indexOf("試験の回答・前半")).toBeLessThan(divider);
    expect(raw.indexOf("試験の回答・立て直し")).toBeGreaterThan(after);
    expect(raw.slice(divider, after)).toContain("（使えない）");
    expect(details).toContain('class="record-card"');
  });
});

describe("まだ弱いところと、次の一手（ADR-0054）", () => {
  it("手薄な観点だけを、絵・短い名前・判定の文字・一言・準備行動1つ・「これを準備する」で示す", () => {
    const html = render(battery);
    const section = between(html, H.next, H.recall);
    expect(section.match(/<li class="next-step">/g) ?? []).toHaveLength(1);
    expect(section.match(/<li class="next-step next-step-compact">/g) ?? []).toHaveLength(1);
    // 「確認していない」（current）が「未確認と気づいた」（alternative）より先。最初の1枚に「まず、ここから」
    expect(section.indexOf(VIEWPOINT_SHORT_LABELS.current)).toBeLessThan(
      section.indexOf(VIEWPOINT_SHORT_LABELS.alternative),
    );
    expect(section.split(NEXT_STEP_FIRST_TAG)).toHaveLength(2);
    expect(section).toContain(JUDGMENT_LABELS.not_mentioned);
    expect(section).toContain(JUDGMENT_LABELS.aware_unconfirmed);
    // 一言は最初の1枚だけ。2枚目は名前・判定・次の一手だけの短い行
    expect(section).toContain(WEAK_POINT_LINES.current.not_mentioned);
    expect(section).not.toContain(WEAK_POINT_LINES.alternative.aware_unconfirmed);
    expect(section).not.toContain(WEAK_POINT_LINES.current.aware_unconfirmed);
    // ボタンには、読み上げ用に準備行動の名前を含む名前を付ける（同じ文字のボタンが並ぶため）
    for (const s of nextSteps(mixed)) {
      expect(section).toContain(`aria-label="${NEXT_STEP_PICK}：${label(s.action)}"`);
    }
    // 次の一手は nextSteps と同じ準備行動
    for (const s of nextSteps(mixed)) {
      expect(section).toContain(`<span class="label">${NEXT_STEP_LABEL}：</span>${label(s.action)}`);
    }
    expect(section.match(new RegExp(`>${NEXT_STEP_PICK}</button>`, "g"))).toHaveLength(2);
    expect(section.match(/aria-pressed="false"/g)).toHaveLength(2);
    // 確認できた観点は、ここでは「伝えられたこと」の1行にだけ出る
    const strong = section.slice(section.indexOf(STRONG_POINTS_LABEL));
    expect(strong).toContain(VIEWPOINT_SHORT_LABELS.location);
    expect(strong).toContain(VIEWPOINT_SHORT_LABELS.unrecorded);
    expect(strong).toContain(VIEWPOINT_SHORT_LABELS.proxy);
    expect(section.slice(0, section.indexOf(STRONG_POINTS_LABEL))).not.toContain(
      VIEWPOINT_SHORT_LABELS.location,
    );
    const svgs = section.slice(0, section.indexOf(STRONG_POINTS_LABEL)).match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(2);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
  });

  it("弱い観点が1つだけのとき：「まず、ここから」は付けず、1枚を一言付きで出す", () => {
    const html = render(state({ ...battery, judgments: { ...allConfirmed, proxy: "not_mentioned" } }));
    const section = between(html, H.next, H.recall);
    expect(section).not.toContain(NEXT_STEP_FIRST_TAG);
    expect(section).not.toContain("next-step-compact");
    expect(section).toContain(WEAK_POINT_LINES.proxy.not_mentioned);
  });

  it("3D のときだけ、読み上げの操作を受け止めの直後に出す（読み上げる文は reviewSpeech。回答は含めない）", () => {
    expect(render(battery)).not.toContain('class="speaker-controls"');
    const html = render({ ...battery, mode: "3d" });
    const controls = html.indexOf('class="speaker-controls"');
    expect(controls).toBeGreaterThan(html.indexOf("試験の受け止め"));
    expect(controls).toBeLessThan(html.indexOf(H.next));
  });

  it("まとめの文は固定文だけ：利用者の回答の文を引かず、1文が短い", () => {
    const section = between(render(battery), H.next, H.recall);
    expect(section).not.toContain("試験の回答");
    for (const v of VIEWPOINT_ORDER) {
      for (const line of Object.values(WEAK_POINT_LINES[v])) {
        expect(line.length).toBeLessThanOrEqual(40);
        expect(line).not.toMatch(/mg|錠|カプセル/);
      }
      expect(VIEWPOINT_SHORT_LABELS[v].length).toBeLessThanOrEqual(12);
    }
    for (const a of PREP_ACTIONS) expect(PREP_ACTION_EFFECTS[a.id].length).toBeLessThanOrEqual(40);
  });

  it("全部「確認できた」の回：弱いところの一覧を出さず、固定の一言と判定の意味を出し、準備は選ばせる", () => {
    const html = render(confirmedAll);
    expect(html).not.toContain(H.next);
    expect(html).not.toContain('class="next-step"');
    expect(html).toContain(NO_WEAK_POINTS_NOTE);
    expect(html).toContain(JUDGMENT_NOTE);
    // 確認できた5つの観点は「伝えられたこと」の1行に出す（PR #138 のレビュー）
    const strong = html.slice(html.indexOf(STRONG_POINTS_LABEL), html.indexOf(H.recall));
    for (const v of VIEWPOINT_ORDER) expect(strong).toContain(VIEWPOINT_SHORT_LABELS[v]);
    expectOrder(html, [H.recall, H.prep, H.details, H.event, H.viewpoints, H.raw]);
    expect(html).toContain("お薬手帳<span class=\"source-chip-state\">（使えない）</span>");
  });

  it("全部「判定できませんでした」の回（ai: failed）：弱いところを出さず、判定できなかった知らせだけ。推測の一手も出さない", () => {
    const html = render(failed);
    expect(html).not.toContain(H.next);
    expect(html).not.toContain('class="next-step"');
    expect(html).not.toContain(NO_WEAK_POINTS_NOTE);
    expect(html).not.toContain(STRONG_POINTS_LABEL);
    expect(html).not.toContain('class="mode-card-badge"');
    expect(html).toContain(AI_FAILED_NOTE);
    expectOrder(html, [H.recall, H.prep, H.details, H.event, H.viewpoints, H.raw]);
    expect(html.split(`<dd>${JUDGMENT_LABELS.undetermined}</dd>`)).toHaveLength(VIEWPOINT_ORDER.length + 1);
  });
});

describe("⑥振り返りの準備行動と、今ここで確かめましょう", () => {
  it("準備行動とそのときは大きなカード。次の一手の行動に印、どの行動にも一言。「これに決める」は fieldset の直後", () => {
    const html = render(battery);
    const prep = between(html, H.prep, H.details);
    expect(prep.match(/<label class="mode-card">/g)).toHaveLength(PREP_ACTIONS.length + TIMINGS.length);
    for (const a of PREP_ACTIONS) {
      expect(prep).toContain(`<span class="mode-card-label">${a.label}</span>`);
      expect(prep).toContain(`<span class="mode-card-description">${PREP_ACTION_EFFECTS[a.id]}</span>`);
    }
    for (const t of TIMINGS) expect(prep).toContain(`<span class="mode-card-label">${t.label}</span>`);
    const recommended = new Set(nextSteps(mixed).map((s) => s.action));
    expect(prep.match(/<span class="mode-card-badge">/g)).toHaveLength(recommended.size);
    // 印の付いた行動は上に並ぶ（orderPrepActions）
    const order = orderPrepActions(mixed);
    for (const id of recommended) expect(order.indexOf(id)).toBeLessThan(recommended.size + 1);
    const actionSet = prep.slice(0, prep.indexOf("<legend>いつやるか</legend>"));
    const svgs = actionSet.match(/<svg[^>]*>/g) ?? [];
    expect(svgs).toHaveLength(PREP_ACTIONS.length);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
    expect(prep).toContain('</fieldset><button type="button" class="primary" disabled="">これに決める</button>');
    // 何も選ばないうちは、どのラジオも選ばれていない
    expect(prep).not.toContain('checked=""');
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

  it("source が null（係の交代）：出来事の文と説明し直しの回答は details に出し、使えなくなったものの絵・斜線・「（使えない）」は出さない", () => {
    const html = render(handover);
    expectOrder(html, [H.next, H.recall, H.prep, H.details, H.event, H.viewpoints, H.raw]);
    const details = html.slice(html.indexOf(H.details));
    expect(details).toContain(EVENTS.handover.text);
    expect(details).toContain("試験の回答・説明し直し");
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

  it("確認済みの資料を、「これに決める」の後・くわしく見るの前に、準備行動の名前の下に出す", () => {
    const html = renderWith(battery);
    expectOrder(html, [H.prep, "これに決める</button>", heading, H.details]);
    const section = between(html, heading, H.details);
    expect(section).toContain(REVIEW_SOURCES_NOTE);
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
    const section = between(renderWith(battery), heading, H.details);
    expect(section).toContain(
      '<a href="https://example.test/verified" target="_blank" rel="noopener noreferrer">試験の発行元「試験の題」</a>',
    );
    expect(section).toContain("試験の見出し。確認日 2026-11-05");
    expect(section).not.toContain("未確認の題");
    expect(section).not.toContain("https://example.test/pending");
  });

  it("リンクは準備行動のカード（label）の中に入れない", () => {
    const html = renderWith(battery);
    const cards = between(html, H.prep, heading);
    expect(cards).not.toContain("<a ");
  });
});
