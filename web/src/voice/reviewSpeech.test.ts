import { describe, expect, it } from "vitest";
import {
  AI_FAILED_NOTE,
  JUDGMENT_LABELS,
  NEXT_STEPS_HEADING,
  NO_WEAK_POINTS_NOTE,
  EVENT_PREP_INTRO,
  PREP_SPEECH,
  CLOSING_SPEECH,
  PREP_ACTIONS,
  UNDETERMINED_NOTE,
  VIEWPOINT_SHORT_LABELS,
  WEAK_POINT_LINES,
} from "../flow/content";
import { initialState, type TrainingState } from "../flow/training";
import type { Judgments } from "../flow/types";
import { REVIEW_SPEECH_MAX, eventPrepSpeech, reviewSpeech } from "./speech";

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

describe("振り返りの読み上げ（3D。ADR-0054）：固定文だけで、回答は読まない", () => {
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
    expect(reviewSpeech(review({ judgments: J({}) }))).toBe("試験の受け止め。" + NO_WEAK_POINTS_NOTE + PREP_SPEECH + CLOSING_SPEECH);
    expect(reviewSpeech(review({ ai: "off", judgments: null }))).toBe("試験の受け止め。" + UNDETERMINED_NOTE + PREP_SPEECH + CLOSING_SPEECH);
    expect(reviewSpeech(review({ ai: "failed", judgments: J({ proxy: "not_mentioned" }) }))).toBe(
      "試験の受け止め。" + AI_FAILED_NOTE + PREP_SPEECH + CLOSING_SPEECH,
    );
    expect(reviewSpeech(review({ stage: { name: "intro" } }))).toBeNull();
  });
});

describe("出来事に合わせた準備行動の読み上げ（2026-11-07）", () => {
  it("お薬手帳が自宅のときは、財布のメモ・スマホで撮る・家族に伝えるの3つを、受け止めの後・最後の促しの前に読む", () => {
    const state = review({ event: "notebook_home", judgments: J({}) });
    const spoken = reviewSpeech(state)!;
    const prep = eventPrepSpeech(state);
    expect(prep.startsWith(EVENT_PREP_INTRO)).toBe(true);
    expect(prep).toContain("1つ目、飲んでいる薬のメモを財布に入れる。");
    expect(prep).toContain("2つ目、お薬手帳のページや薬の説明書をスマホで撮り、紙にも控える。");
    expect(prep).toContain("3つ目、家族に、自分の薬の情報がどこにあるかを伝えておく。");
    expect(spoken.endsWith(prep + PREP_SPEECH + CLOSING_SPEECH)).toBe(true);
  });

  it("出来事の無い回は、準備行動を読まない", () => {
    expect(eventPrepSpeech(review({ event: null }))).toBe("");
  });
});

describe("振り返りの読み上げの長さ", () => {
  it("長い一言と、手薄な観点が5つある回でも、読み上げの中継の上限（500字）を超えない", () => {
    for (const event of ["battery", "network", "notebook_home", "family_unreachable", "clinic_unreachable", "handover"] as const) {
      const state = review({
        event,
        closingRemark: "あ".repeat(200),
        judgments: J({ location: "not_mentioned", alternative: "not_mentioned", current: "aware_unconfirmed", unrecorded: "aware_unconfirmed", proxy: "not_mentioned" }),
      });
      expect(reviewSpeech(state)!.length, event).toBeLessThanOrEqual(REVIEW_SPEECH_MAX);
    }
  });
});
