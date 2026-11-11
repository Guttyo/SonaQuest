// 読み上げる文の設計図（Issue #284 の指摘3、案A）の試験。
// 訓練を最初から振り返りまで進め、どの段階でも「設計図から作った文」が画面の読み上げの文と同じで、
// 固定文は ID、Claude の文は /api/turn の署名つきで表せていることを確かめる。

import { describe, expect, it } from "vitest";
import { ACK_TEXTS, ALL_QUESTIONS, CLARIFY_TEXTS, REDIRECT_TEXTS } from "../flow/content";
import { SYMPTOM_CHECK_TEXT } from "../flow/emergency";
import { buildTurnRequest, initialState, trainingReducer, type TrainingAction, type TrainingState } from "../flow/training";
import type { TurnResponse } from "../flow/turnContract";
import { listenerSpeech, listenerSpeechPlan, reviewSpeech, reviewSpeechPlan } from "./speech";
import { FIXED_SPEECH, claudeParts, composeSpeech, fixedId, parseSpeechSpec, type SpeechSpec } from "./speechPlan";

const judged = {
  location: "confirmed",
  alternative: "not_mentioned",
  current: "aware_unconfirmed",
  unrecorded: "not_mentioned",
  proxy: "confirmed",
} as const;

const token = (n: number) => `${1_900_000_000 + n}.${"A".repeat(42)}${n % 10}`;

/** 訓練を進める。Claude の返事は、固定の順番の次の質問を Claude の文と署名つきで返す */
function runTraining(ai: "on" | "off", withText: boolean): TrainingState[] {
  const seen: TrainingState[] = [];
  let state: TrainingState = { ...initialState, ai };
  const step = (action: TrainingAction) => {
    state = trainingReducer(state, action);
    seen.push(state);
  };
  step({ type: "start", mode: "3d" });
  let n = 0;
  for (let guard = 0; guard < 60 && state.stage.name !== "review"; guard++) {
    const { stage } = state;
    if (stage.name === "confirm") step({ type: "confirm", source: "smartphone" });
    else if (stage.name === "event") step({ type: "continue_after_event" });
    else if (state.waiting) {
      const request = buildTurnRequest(state)!;
      n++;
      const text = withText ? `ソナの文${n}です。` : null;
      const finish = request.next_question_id === null;
      const response: TurnResponse = {
        emergency: "none",
        viewpoints: judged,
        next: finish ? { type: "finish", question_id: null, text } : { type: "ask", question_id: request.next_question_id, text },
        recall: false,
        source_guess: null,
        remark: finish && withText && stage.name === "second" ? "一言です。" : null,
        speech: { text: text === null ? null : token(n), remark: finish && withText ? token(100 + n) : null },
      };
      step({ type: "turn_result", session: state.session, seq: state.answers.length, result: response });
    } else step({ type: "answer", text: "お薬手帳は台所の引き出しにあります" });
  }
  return seen;
}

function plans(states: TrainingState[]) {
  return states.flatMap((s) => {
    const p = s.stage.name === "review" ? reviewSpeechPlan(s) : listenerSpeechPlan(s);
    return p === null ? [] : [{ state: s, plan: p }];
  });
}

describe("設計図から作った文は、画面の読み上げの文と同じ", () => {
  for (const [name, ai, withText] of [
    ["Claude の文を使う進行", "on", true],
    ["Claude が文を返さない進行（固定文）", "on", false],
    ["Claude を使わない進行", "off", false],
  ] as const) {
    it(name, () => {
      const found = plans(runTraining(ai, withText));
      expect(found.some((f) => f.plan.spec.kind === "review")).toBe(true);
      expect(found.some((f) => f.plan.spec.kind === "event")).toBe(true);
      expect(found.some((f) => f.plan.spec.kind === "confirm")).toBe(true);
      for (const { state, plan } of found) {
        const screen = state.stage.name === "review" ? reviewSpeech(state) : listenerSpeech(state);
        expect(plan.text).toBe(screen);
        // /api/tts に送る形（JSON）を通しても、同じ文になる
        expect(composeSpeech(JSON.parse(JSON.stringify(plan.spec)) as SpeechSpec)).toBe(plan.text);
        // Worker の検査（parseSpeechSpec）も、画面が作った設計図をそのまま通す
        expect(parseSpeechSpec(JSON.parse(JSON.stringify(plan.spec)))).toEqual(plan.spec);
        // Claude の文は必ず署名つき。Claude を使わない進行では Claude の文の部品が無い
        for (const part of claudeParts(plan.spec)) expect(part.token).not.toBeNull();
        if (!withText) expect(claudeParts(plan.spec)).toEqual([]);
      }
    });
  }

  it("Claude の文を使う進行では、質問・受け止め・一言に Claude の文の部品がある", () => {
    const kinds = new Set(
      plans(runTraining("on", true)).flatMap(({ plan }) => (claudeParts(plan.spec).length > 0 ? [plan.spec.kind] : [])),
    );
    expect([...kinds].sort()).toEqual(["ask", "confirm", "review"]);
  });

  it("利用者の回答は設計図に入らない", () => {
    for (const { plan } of plans(runTraining("on", true))) {
      expect(JSON.stringify(plan.spec)).not.toContain("台所の引き出し");
    }
  });
});

describe("FIXED_SPEECH と composeSpeech", () => {
  it("質問・受け止め・聞き返し・質問し直し・体調の確かめの固定文を ID で引ける", () => {
    for (const q of ALL_QUESTIONS) expect(FIXED_SPEECH.get(fixedId.question(q.id))).toBe(q.text);
    ACK_TEXTS.forEach((t, i) => expect(FIXED_SPEECH.get(fixedId.ack(i))).toBe(t));
    for (const [id, t] of Object.entries(CLARIFY_TEXTS)) expect(FIXED_SPEECH.get(fixedId.clarify(id))).toBe(t);
    for (const [id, t] of Object.entries(REDIRECT_TEXTS)) expect(FIXED_SPEECH.get(fixedId.redirect(id))).toBe(t);
    expect(FIXED_SPEECH.get(fixedId.symptomCheck)).toBe(SYMPTOM_CHECK_TEXT);
  });

  it("知らない固定文の ID・空の質問は null（読み上げない）", () => {
    expect(composeSpeech({ kind: "ask", opening: false, recall: false, prompt: [{ fixed: "unknown" }] })).toBeNull();
    expect(composeSpeech({ kind: "ask", opening: false, recall: false, prompt: [] })).toBeNull();
    expect(composeSpeech({ kind: "confirm", recall: false, ack: [{ fixed: "q:none" }] })).toBeNull();
  });

  it("体調の確かめの問いは、固定文の ID だけで表す", () => {
    let state: TrainingState = trainingReducer({ ...initialState, ai: "on" }, { type: "start", mode: "3d" });
    state = trainingReducer(state, { type: "answer", text: "頭が痛いです" });
    const plan = listenerSpeechPlan(state);
    if (state.prompt?.type === "symptom_check") {
      expect(plan?.spec).toEqual({ kind: "ask", opening: false, recall: false, prompt: [{ fixed: fixedId.symptomCheck }] });
      expect(plan?.text).toBe(SYMPTOM_CHECK_TEXT);
    }
  });

  it("組み立ての記録が無い・文と合わない発言は、署名の無い Claude の文として扱う（/api/tts は読まない）", () => {
    const started = trainingReducer({ ...initialState, ai: "on" }, { type: "start", mode: "3d" });
    const state: TrainingState = { ...started, prompt: { ...started.prompt!, parts: [{ fixed: fixedId.symptomCheck }] } };
    const plan = listenerSpeechPlan(state)!;
    expect(plan.text).toBe(listenerSpeech(started));
    expect(claudeParts(plan.spec)).toEqual([{ claude: started.prompt!.text, token: null }]);
  });
});
