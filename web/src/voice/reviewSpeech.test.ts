import { describe, expect, it } from "vitest";
import {
  AI_FAILED_NOTE,
  JUDGMENT_LABELS,
  NEXT_STEPS_HEADING,
  NO_WEAK_POINTS_NOTE,
  PREP_ACTIONS,
  UNDETERMINED_NOTE,
  VIEWPOINT_SHORT_LABELS,
  WEAK_POINT_LINES,
} from "../flow/content";
import { initialState, type TrainingState } from "../flow/training";
import type { Judgments } from "../flow/types";
import { reviewSpeech } from "./speech";

const J = (patch: Partial<Judgments>): Judgments => ({
  location: "confirmed",
  alternative: "confirmed",
  current: "confirmed",
  unrecorded: "confirmed",
  proxy: "confirmed",
  ...patch,
});

const review = (patch: Partial<TrainingState>): TrainingState => ({
  ...initialState,
  mode: "3d",
  stage: { name: "review" },
  ai: "on",
  closingAck: "試験の受け止め。",
  answers: [
    { questionId: "q1", half: "first", text: "試験の回答", prompt: "q", kind: "answer", recall: false },
  ],
  ...patch,
});

describe("振り返りの読み上げ（3D。ADR-0051）：固定文だけで、回答は読まない", () => {
  it("弱い観点があるとき：受け止め → 見出し → 名前と判定（全部）→ 最初の一言と次の一手", () => {
    const text = reviewSpeech(
      review({ judgments: J({ alternative: "aware_unconfirmed", proxy: "not_mentioned" }) }),
    )!;
    expect(text.startsWith("試験の受け止め。" + NEXT_STEPS_HEADING)).toBe(true);
    // 「確認していない」（proxy）が先
    expect(text.indexOf(VIEWPOINT_SHORT_LABELS.proxy)).toBeLessThan(text.indexOf(VIEWPOINT_SHORT_LABELS.alternative));
    expect(text).toContain(`${VIEWPOINT_SHORT_LABELS.proxy}は${JUDGMENT_LABELS.not_mentioned}。`);
    expect(text).toContain(`${VIEWPOINT_SHORT_LABELS.alternative}は${JUDGMENT_LABELS.aware_unconfirmed}。`);
    expect(text).toContain(WEAK_POINT_LINES.proxy.not_mentioned);
    expect(text).not.toContain(WEAK_POINT_LINES.alternative.aware_unconfirmed);
    expect(text).toContain(PREP_ACTIONS.find((a) => a.id === "tell_family")!.label);
    expect(text).not.toContain("試験の回答");
    expect(text.length).toBeLessThan(200);
  });

  it("全部「確認できた」はその一言、判定が無い回は知らせだけ、振り返り以外は null", () => {
    expect(reviewSpeech(review({ judgments: J({}) }))).toBe("試験の受け止め。" + NO_WEAK_POINTS_NOTE);
    expect(reviewSpeech(review({ ai: "off", judgments: null }))).toBe("試験の受け止め。" + UNDETERMINED_NOTE);
    expect(reviewSpeech(review({ ai: "failed", judgments: J({ proxy: "not_mentioned" }) }))).toBe(
      "試験の受け止め。" + AI_FAILED_NOTE,
    );
    expect(reviewSpeech(review({ stage: { name: "intro" } }))).toBeNull();
  });
});
