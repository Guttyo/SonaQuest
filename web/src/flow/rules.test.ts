import { describe, expect, it } from "vitest";
import { EVENTS, PREP_ACTIONS } from "./content";
import {
  MAX_ANSWER_LENGTH,
  MAX_FIRST_HALF_ANSWERS,
  MAX_SECOND_HALF_ANSWERS,
  firstHalfQuestions,
  isAcceptableAnswer,
  nextSteps,
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

  it("回答の上限は前半5回・後半5回で、固定の質問は半分ごとに4問（残りの1回は聞き返しの余裕。Issue #41）", () => {
    expect(MAX_FIRST_HALF_ANSWERS).toBe(5);
    expect(MAX_SECOND_HALF_ANSWERS).toBe(5);
    expect(firstHalfQuestions().map((q) => q.id)).toEqual([
      "first_medicines",
      "first_location",
      "first_other",
      "first_unrecorded",
    ]);
    for (const event of ["battery", "family_unreachable", "handover"] as const) {
      expect(secondHalfQuestions(event)).toHaveLength(4);
      expect(secondHalfQuestions(event)[3].id).toBe("second_recheck");
    }
  });

  it("後半の最初は立て直しの問い", () => {
    expect(secondHalfQuestions("battery")[0].id).toBe("second_recovery");
  });

  it("係の交代のときは交代用の問い", () => {
    expect(secondHalfQuestions("handover")[0].id).toBe("second_handover");
  });

  it("家族と連絡がつかない出来事の後は、家族のほかの人を聞く", () => {
    expect(secondHalfQuestions("family_unreachable").map((q) => q.id)).toContain(
      "second_proxy_other",
    );
    expect(secondHalfQuestions("battery").map((q) => q.id)).toContain("second_proxy");
  });

  it.each<EventId>(["battery", "family_unreachable", "handover"])(
    "固定の6問（%s）で5観点すべてに触れる",
    (event) => {
      const covered = new Set(
        [...firstHalfQuestions(), ...secondHalfQuestions(event)].map((q) => q.viewpoint),
      );
      expect([...covered].sort()).toEqual(
        ["alternative", "current", "location", "proxy", "unrecorded"],
      );
    },
  );

  it.each<EventId>(["battery", "handover"])(
    "1回の訓練（%s）の中で質問のIDは重ならない",
    (event) => {
      const ids = [...firstHalfQuestions(), ...secondHalfQuestions(event)].map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );
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

describe("nextSteps（まだ弱いところ → 次の一手。ADR-0054）", () => {
  const allConfirmed: Judgments = {
    location: "confirmed",
    alternative: "confirmed",
    current: "confirmed",
    unrecorded: "confirmed",
    proxy: "confirmed",
  };

  it("判定できなかった回と、全部「確認できた」の回は空", () => {
    expect(nextSteps(undeterminedJudgments())).toEqual([]);
    expect(nextSteps(allConfirmed)).toEqual([]);
  });

  it("「確認していない」を先に、次に「未確認と気づいた」。同じ判定の中は観点の順", () => {
    const steps = nextSteps({
      location: "aware_unconfirmed",
      alternative: "confirmed",
      current: "not_mentioned",
      unrecorded: "aware_unconfirmed",
      proxy: "not_mentioned",
    });
    expect(steps.map((s) => s.viewpoint)).toEqual(["current", "proxy", "location", "unrecorded"]);
    expect(steps.map((s) => s.judgment)).toEqual([
      "not_mentioned",
      "not_mentioned",
      "aware_unconfirmed",
      "aware_unconfirmed",
    ]);
  });

  it("次の一手は、その観点に関係する準備行動（PREP_ACTIONS の順で最初のもの）", () => {
    const steps = nextSteps({ ...allConfirmed, proxy: "not_mentioned" });
    expect(steps).toEqual([{ viewpoint: "proxy", judgment: "not_mentioned", action: "tell_family" }]);
    for (const s of nextSteps({ ...allConfirmed, alternative: "not_mentioned", current: "not_mentioned" })) {
      expect(PREP_ACTIONS.find((a) => a.id === s.action)!.viewpoints).toContain(s.viewpoint);
    }
  });

  it("別の観点で選んだ行動はなるべく避け、避けられないときは重なってよい", () => {
    const steps = nextSteps({ ...allConfirmed, location: "not_mentioned", alternative: "not_mentioned" });
    // location → notebook_bag。alternative は notebook_bag を避けて photo_and_paper
    expect(steps.map((s) => s.action)).toEqual(["notebook_bag", "photo_and_paper"]);
    const all = nextSteps({
      location: "not_mentioned",
      alternative: "not_mentioned",
      current: "not_mentioned",
      unrecorded: "not_mentioned",
      proxy: "not_mentioned",
    });
    expect(all).toHaveLength(5);
    expect(new Set(all.map((s) => s.action)).size).toBeGreaterThanOrEqual(4);
  });
});
