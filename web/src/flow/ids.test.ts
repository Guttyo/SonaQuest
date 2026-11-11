// 質問ID・出来事ID・情報源の ID の一覧と、固定文の表・準備行動の引き方が食い違わないこと（Issue #299）
import { describe, expect, it } from "vitest";
import { GOAL_DESCRIPTIONS } from "../../worker/prompt";
import { ALL_QUESTIONS, CLARIFY_TEXTS, PREP_ACTIONS, REDIRECT_TEXTS, VIEWPOINT_ORDER, prepActionOf } from "./content";
import { RECORD_ITEMS } from "./record";
import { isWeak, nextSteps } from "./rules";
import { EVENT_IDS, QUESTION_IDS, SOURCE_GUESS_IDS, SOURCE_IDS, isQuestionId } from "./turnContract";
import {
  EVENT_ID_LIST,
  QUESTION_ID_LIST,
  SOURCE_ID_LIST,
  type Judgment,
  type Judgments,
  type PrepActionId,
  type ViewpointId,
} from "./types";

const PREP_ACTION_IDS: readonly PrepActionId[] = [
  "notebook_bag",
  "photo_and_paper",
  "wallet_memo",
  "tell_family",
  "pharmacy_contact",
  "check_portal",
];

describe("質問ID の一覧（Issue #299）", () => {
  it("QUESTION_ID_LIST は ALL_QUESTIONS の ID と同じものを同じ順に持つ", () => {
    expect(ALL_QUESTIONS.map((q) => q.id)).toEqual([...QUESTION_ID_LIST]);
    expect([...QUESTION_IDS]).toEqual([...QUESTION_ID_LIST]);
  });

  it("聞き返し・質問し直しの固定文とゴールの説明は、すべての質問ID の分だけある", () => {
    const ids = [...QUESTION_ID_LIST].sort();
    expect(Object.keys(CLARIFY_TEXTS).sort()).toEqual(ids);
    expect(Object.keys(REDIRECT_TEXTS).sort()).toEqual(ids);
    expect(Object.keys(GOAL_DESCRIPTIONS).sort()).toEqual(ids);
  });

  it("記録の項目が指す質問ID は、すべて受け付ける質問ID", () => {
    for (const item of RECORD_ITEMS) for (const id of item.questionIds) expect(QUESTION_IDS.has(id)).toBe(true);
  });

  it("isQuestionId は受け付ける質問ID だけを通す", () => {
    for (const id of QUESTION_ID_LIST) expect(isQuestionId(id)).toBe(true);
    for (const id of ["", "first", "constructor", "toString", "FIRST_MEDICINES"]) expect(isQuestionId(id)).toBe(false);
  });
});

describe("出来事・情報源の ID の集合（Issue #299）", () => {
  it("受け付ける出来事・情報源は、types.ts の一覧と同じ", () => {
    expect([...EVENT_IDS]).toEqual([...EVENT_ID_LIST]);
    expect([...SOURCE_IDS]).toEqual([...SOURCE_ID_LIST]);
  });

  it("Claude が返してよい情報源の候補は、none を除いたもの（順は今までと同じ）", () => {
    expect([...SOURCE_GUESS_IDS]).toEqual(["smartphone", "online", "notebook", "family", "clinic"]);
  });
});

describe("準備行動の引き方（Issue #299）", () => {
  it("すべての PrepActionId が PREP_ACTIONS にあり、prepActionOf で引ける", () => {
    expect(PREP_ACTIONS.map((a) => a.id).sort()).toEqual([...PREP_ACTION_IDS].sort());
    for (const id of PREP_ACTION_IDS) expect(prepActionOf(id).id).toBe(id);
  });

  it("見つからない ID は、分かる名前の例外にする", () => {
    expect(() => prepActionOf("unknown" as PrepActionId)).toThrow("PREP_ACTIONS");
  });

  it("すべての観点に、対応する準備行動が1つ以上ある（nextSteps が必ず1つ選べる）", () => {
    for (const v of VIEWPOINT_ORDER) expect(PREP_ACTIONS.some((a) => a.viewpoints.includes(v))).toBe(true);
  });
});

describe("次の一手の判定の型（Issue #299）", () => {
  const all = (j: Judgment): Judgments =>
    Object.fromEntries(VIEWPOINT_ORDER.map((v) => [v, j])) as Record<ViewpointId, Judgment>;

  it("isWeak は「確認していない」「未確認と気づいた」だけ", () => {
    expect(isWeak("not_mentioned")).toBe(true);
    expect(isWeak("aware_unconfirmed")).toBe(true);
    expect(isWeak("confirmed")).toBe(false);
    expect(isWeak("undetermined")).toBe(false);
  });

  it("nextSteps が返す判定は手薄なものだけで、確認していないものが先", () => {
    const mixed: Judgments = {
      location: "aware_unconfirmed",
      alternative: "confirmed",
      current: "not_mentioned",
      unrecorded: "undetermined",
      proxy: "not_mentioned",
    };
    expect(nextSteps(mixed).map((s) => [s.viewpoint, s.judgment])).toEqual([
      ["current", "not_mentioned"],
      ["proxy", "not_mentioned"],
      ["location", "aware_unconfirmed"],
    ]);
    expect(nextSteps(all("confirmed"))).toEqual([]);
    expect(nextSteps(all("undetermined"))).toEqual([]);
    expect(nextSteps(all("not_mentioned"))).toHaveLength(VIEWPOINT_ORDER.length);
  });
});
