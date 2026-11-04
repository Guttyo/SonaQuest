// 何を読み上げるか（speech.ts）と、認識した文の緊急の照合の試験（docs/safety-test-plan.md P15・V4）

import { describe, expect, it } from "vitest";
import { CONFIRM_PROMPT, EVENTS, RECALL_NOW } from "../flow/content";
import { modeFromSearch } from "../flow/mode";
import { firstHalfQuestions } from "../flow/rules";
import { initialState, trainingReducer, type TrainingAction, type TrainingState } from "../flow/training";
import { listenerSpeech, speechKey } from "./speech";
import { PushToTalk, appendRecognized, type RecognitionLike, type RecognitionResultEventLike } from "./talk";
import { listenerActivity } from "./view";

/** 回答の目印。読み上げる文に、これが入ってはいけない */
const ANSWER = "ゆうびんうけ回答もじれつ";

function run(actions: TrainingAction[], from: TrainingState = initialState): TrainingState {
  return actions.reduce(trainingReducer, from);
}

/** Claude を使わない固定の進行（回答の後、すぐ次の質問へ進む） */
const offline: TrainingState = { ...initialState, ai: "off" };

describe("読み上げるのは聞き取り係の文と固定文だけ（ADR-0005）", () => {
  it("最初の質問を読み、回答の後は次の質問を読む。回答は読み上げる文に入らない", () => {
    const started = run([{ type: "start" }], offline);
    expect(listenerSpeech(started)).toBe(firstHalfQuestions()[0].text);
    const answered = run([{ type: "answer", text: ANSWER }], started);
    const spoken = listenerSpeech(answered);
    expect(spoken).not.toBeNull();
    expect(spoken).not.toContain(ANSWER);
    expect(spoken).toContain(firstHalfQuestions()[1].text);
  });

  it("前半を最後まで答えても、どの段階の文にも回答が入らない", () => {
    let state = run([{ type: "start" }], offline);
    const seen: string[] = [];
    for (let i = 0; i < 10 && state.stage.name === "first"; i++) {
      state = trainingReducer(state, { type: "answer", text: `${ANSWER}${i}` });
      const spoken = listenerSpeech(state);
      if (spoken !== null) seen.push(spoken);
    }
    expect(state.stage.name).toBe("confirm");
    expect(listenerSpeech(state)).toContain(CONFIRM_PROMPT);
    state = trainingReducer(state, { type: "confirm", source: "notebook" });
    expect(state.stage.name).toBe("event");
    const event = listenerSpeech(state);
    expect(event).toContain(EVENTS[state.event!].text);
    seen.push(event!);
    for (const text of seen) expect(text).not.toContain(ANSWER);
  });

  it("返事を待つ間は読み上げない", () => {
    const waiting = run([{ type: "start" }, { type: "answer", text: ANSWER }]);
    expect(waiting.waiting).toBe(true);
    expect(listenerSpeech(waiting)).toBeNull();
  });

  it("思い出せないという回答の直後は、その場の固定文を先に読む", () => {
    const started = run([{ type: "start" }]);
    const waiting = trainingReducer(started, { type: "answer", text: ANSWER });
    const recalled: TrainingState = {
      ...waiting,
      waiting: false,
      answers: waiting.answers.map((a) => ({ ...a, recall: true })),
      stage: { name: "first", index: 1 },
      prompt: { questionId: firstHalfQuestions()[1].id, text: firstHalfQuestions()[1].text, type: "ask" },
    };
    expect(listenerSpeech(recalled)).toBe(RECALL_NOW + firstHalfQuestions()[1].text);
  });

  it("はじめに・振り返り・中断の画面では読み上げない", () => {
    expect(listenerSpeech(initialState)).toBeNull();
    expect(listenerSpeech({ ...initialState, stage: { name: "review" } })).toBeNull();
    expect(listenerSpeech({ ...initialState, stage: { name: "stopped", reason: "manual" } })).toBeNull();
  });

  it("同じ発言の目印は同じ。回答が増えれば変わる（StrictMode で読み直さない）", () => {
    const started = run([{ type: "start" }], offline);
    const text = listenerSpeech(started)!;
    expect(speechKey(started, text)).toBe(speechKey({ ...started }, text));
    const answered = run([{ type: "answer", text: ANSWER }], started);
    expect(speechKey(answered, text)).not.toBe(speechKey(started, text));
  });
});

describe("認識した文にも、送る前に緊急の照合がかかる（docs/phase2-decisions.md 項目10）", () => {
  function recognize(text: string): string[] {
    const results: string[] = [];
    const recognition: RecognitionLike = {
      lang: "",
      continuous: false,
      interimResults: false,
      maxAlternatives: 0,
      onstart: null,
      onresult: null,
      onerror: null,
      onend: null,
      start: () => {},
      stop: () => {},
      abort: () => {},
    };
    const talk = new PushToTalk({ create: () => recognition, onText: (t) => results.push(t), beforeListen: () => {} });
    talk.press();
    const event: RecognitionResultEventLike = {
      resultIndex: 0,
      results: [Object.assign([{ transcript: text }], { isFinal: true })],
    };
    recognition.onresult?.(event);
    talk.release();
    recognition.onend?.();
    return results;
  }

  it("体調の訴えらしい認識文は、送ると回答として受け取らずに中断する", () => {
    const [heard] = recognize("いま胸が苦しいです");
    const draft = appendRecognized("", heard);
    const started = run([{ type: "start" }]);
    const sent = trainingReducer(started, { type: "answer", text: draft });
    expect(sent.stage).toEqual({ name: "stopped", reason: "symptom" });
    expect(sent.answers).toHaveLength(0);
    expect(sent.waiting).toBe(false);
  });

  it("自傷のほのめかしの認識文は、自傷用の案内で中断する", () => {
    const [heard] = recognize("消えたい");
    const sent = trainingReducer(run([{ type: "start" }]), { type: "answer", text: appendRecognized("", heard) });
    expect(sent.stage).toEqual({ name: "stopped", reason: "self_harm" });
  });

  it("下書きに足した後でも照合する", () => {
    const [heard] = recognize("苦しい");
    const draft = appendRecognized("Aという薬", heard);
    const sent = trainingReducer(run([{ type: "start" }]), { type: "answer", text: draft });
    expect(sent.stage.name).toBe("stopped");
  });
});

describe("聞き取り係の様子", () => {
  it("待つ間は考え中、マイクが開いていれば聞いている、声が出ていれば話している", () => {
    expect(listenerActivity({ waiting: true, listening: false, speaking: false })).toBe("thinking");
    expect(listenerActivity({ waiting: false, listening: true, speaking: false })).toBe("listening");
    expect(listenerActivity({ waiting: false, listening: false, speaking: true })).toBe("speaking");
    expect(listenerActivity({ waiting: false, listening: false, speaking: false })).toBe("idle");
  });
});

describe("モード（仮の作り。#51 で置き換える）", () => {
  it("?mode=3d のときだけ 3D の対話モード", () => {
    expect(modeFromSearch("?mode=3d")).toBe("3d");
    expect(modeFromSearch("?x=1&mode=3d")).toBe("3d");
    expect(modeFromSearch("")).toBe("2d");
    expect(modeFromSearch("?mode=2d")).toBe("2d");
    expect(modeFromSearch("?mode=3D")).toBe("2d");
  });
});
