import { describe, expect, it } from "vitest";
import { EVENTS, PREP_ACTIONS } from "./content";
import {
  MAX_ANSWER_LENGTH,
  MAX_FIRST_HALF_ANSWERS,
  MAX_SECOND_HALF_ANSWERS,
  firstHalfQuestions,
  isAcceptableAnswer,
  orderPrepActions,
  secondHalfQuestions,
  selectEvent,
  undeterminedJudgments,
} from "./rules";
import type { EventId, Judgments, SourceId } from "./types";

describe("selectEvent", () => {
  it.each<[SourceId, EventId]>([
    ["smartphone", "battery"],
    ["online", "network"],
    ["notebook", "notebook_home"],
    ["family", "family_unreachable"],
    ["clinic", "clinic_unreachable"],
    ["none", "handover"],
  ])("%s を選んだら %s", (source, event) => {
    expect(selectEvent(source)).toBe(event);
  });

  it("選ばなかったときは係の交代", () => {
    expect(selectEvent(null)).toBe("handover");
  });
});

describe("出来事で使えなくなるもの", () => {
  it("電池切れと通信の途絶は別のものとして書かれている", () => {
    expect(EVENTS.battery.unavailable).not.toBe(EVENTS.network.unavailable);
    expect(EVENTS.battery.unavailable).toContain("端末内");
    expect(EVENTS.network.unavailable).not.toContain("端末内");
  });

  it("係の交代では使えなくなるものがない", () => {
    expect(EVENTS.handover.unavailable).toBeNull();
  });
});

describe("質問の数", () => {
  it("前半は上限を超えない", () => {
    expect(firstHalfQuestions().length).toBeLessThanOrEqual(
      MAX_FIRST_HALF_ANSWERS,
    );
  });

  it.each<EventId>([
    "battery",
    "network",
    "notebook_home",
    "family_unreachable",
    "clinic_unreachable",
    "handover",
  ])("後半（%s）は上限を超えない", (event) => {
    expect(secondHalfQuestions(event).length).toBeLessThanOrEqual(
      MAX_SECOND_HALF_ANSWERS,
    );
  });

  it("後半の最初は立て直しの問い", () => {
    expect(secondHalfQuestions("battery")[0].id).toBe("second_recovery");
  });

  it("係の交代のときは交代用の問い", () => {
    expect(secondHalfQuestions("handover")[0].id).toBe("second_handover");
  });
});

describe("isAcceptableAnswer", () => {
  it("空白だけの回答は受け付けない", () => {
    expect(isAcceptableAnswer("")).toBe(false);
    expect(isAcceptableAnswer("   \n")).toBe(false);
  });

  it("上限の長さまでは受け付け、超えたら受け付けない", () => {
    expect(isAcceptableAnswer("あ".repeat(MAX_ANSWER_LENGTH))).toBe(true);
    expect(isAcceptableAnswer("あ".repeat(MAX_ANSWER_LENGTH + 1))).toBe(false);
  });
});

describe("orderPrepActions", () => {
  const original = PREP_ACTIONS.map((a) => a.id);

  it("判定できなかったときは元の順のまま", () => {
    expect(orderPrepActions(undeterminedJudgments())).toEqual(original);
  });

  it("手薄な観点に関係する行動を上に並べ、ほかは元の順を保つ", () => {
    const judgments: Judgments = {
      ...undeterminedJudgments(),
      proxy: "not_mentioned",
    };
    const ordered = orderPrepActions(judgments);
    expect(ordered[0]).toBe("tell_family");
    expect(ordered.slice(1)).toEqual(original.filter((id) => id !== "tell_family"));
  });

  it("「未確認と気づいた」も手薄として扱う", () => {
    const judgments: Judgments = {
      ...undeterminedJudgments(),
      unrecorded: "aware_unconfirmed",
    };
    expect(orderPrepActions(judgments)[0]).toBe("wallet_memo");
  });

  it("「確認できた」は手薄として扱わない", () => {
    const judgments: Judgments = {
      location: "confirmed",
      alternative: "confirmed",
      current: "confirmed",
      unrecorded: "confirmed",
      proxy: "confirmed",
    };
    expect(orderPrepActions(judgments)).toEqual(original);
  });
});
