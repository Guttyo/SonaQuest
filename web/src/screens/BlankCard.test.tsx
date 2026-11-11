import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BLANK_CARD_BOX_HEADING,
  BLANK_CARD_BOX_TEXT,
  BLANK_CARD_FIELDS,
  BLANK_CARD_PRINT_BUTTON,
  BLANK_CARD_PRINT_CLASS,
  BLANK_CARD_TITLE,
} from "../flow/blankCard";
import { FIRST_HALF_QUESTIONS, PREP_ACTIONS, RECOVERY_QUESTION } from "../flow/content";
import { initialState, type TrainingState } from "../flow/training";
import type { Answer } from "../flow/types";
import { BlankCardSheet, printBlankCard } from "./BlankCard";
import { Review } from "./Review";

/** 試験の回答はすべて架空。カードに出てはいけない目印の文 */
const MARK1 = "試験の目印・前半の回答";
const MARK2 = "試験の目印・立て直しの回答";
const answer = (questionId: string, half: Answer["half"], text: string): Answer => ({
  questionId,
  half,
  text,
  prompt: `${questionId} の質問`,
  kind: "answer",
  recall: false,
});
const reviewState: TrainingState = {
  ...initialState,
  stage: { name: "review" },
  ai: "on",
  source: "smartphone",
  event: "battery",
  judgments: {
    location: "confirmed",
    alternative: "aware_unconfirmed",
    current: "not_mentioned",
    unrecorded: "confirmed",
    proxy: "confirmed",
  },
  answers: [
    answer(FIRST_HALF_QUESTIONS[0].id, "first", MARK1),
    answer(RECOVERY_QUESTION.id, "second", MARK2),
  ],
};

describe("記入用のカード（Issue #278、ADR-0067）", () => {
  it("箱の文は、準備行動「財布に入れる」の名前をそのまま引いている", () => {
    const wallet = PREP_ACTIONS.find((a) => a.label.includes("財布"))!;
    expect(BLANK_CARD_BOX_TEXT).toContain(`「${wallet.label}」`);
  });

  it("用紙の部品は何も受け取らない（回答を渡す口が無い）", () => {
    expect(BlankCardSheet.length).toBe(0);
  });

  it("用紙には題とすべての欄があり、入力欄は無い（紙に手で書く）", () => {
    const html = renderToStaticMarkup(<BlankCardSheet />);
    expect(html).toContain(BLANK_CARD_TITLE);
    for (const f of BLANK_CARD_FIELDS) expect(html, f.id).toContain(f.label);
    const lines = BLANK_CARD_FIELDS.reduce((n, f) => n + f.lines, 0);
    expect(html.split('class="blank-card-line"')).toHaveLength(lines + 1);
    expect(html).not.toMatch(/<input|<textarea|<form/);
  });

  it("振り返りの「これに決める」の後に印刷の箱があり、回答はどこにも写らない", () => {
    const html = renderToStaticMarkup(<Review state={reviewState} onChoose={() => {}} />);
    const box = html.slice(html.indexOf('class="blank-card-box"'));
    expect(html.indexOf("これに決める")).toBeLessThan(html.indexOf('class="blank-card-box"'));
    expect(box).toContain(BLANK_CARD_BOX_HEADING);
    expect(box).toContain(BLANK_CARD_PRINT_BUTTON);
    // サーバー側の描画では用紙は出さない（印刷の直前に body の直下へ描く）
    expect(html).not.toContain('class="blank-card-sheet"');
    // 回答の原文は「くわしく見る」の中には出るが、印刷の箱には出ない
    const boxOnly = box.slice(0, box.indexOf("</section>"));
    expect(boxOnly).not.toContain(MARK1);
    expect(boxOnly).not.toContain(MARK2);
  });

  it("印刷のあいだだけ <html> にクラスを付け、印刷の後に外す", () => {
    const classes = new Set<string>();
    const seen: boolean[] = [];
    const doc = {
      documentElement: {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
        },
      },
    } as unknown as Document;
    const win = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      print: vi.fn(() => seen.push(classes.has(BLANK_CARD_PRINT_CLASS))),
    } as unknown as Window;
    printBlankCard(doc, win);
    expect(win.print).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([true]);
    expect(classes.has(BLANK_CARD_PRINT_CLASS)).toBe(false);
    expect(win.removeEventListener).toHaveBeenCalledWith("afterprint", expect.any(Function));
  });
});
