// 押して話す（talk.ts）の試験。ブラウザの音声認識の代わりに偽物を差し込む（docs/safety-test-plan.md V1・V2・F5・F7）

import { describe, expect, it } from "vitest";
import { MAX_ANSWER_LENGTH } from "../flow/rules";
import {
  PushToTalk,
  TALK_LANG,
  appendRecognized,
  browserRecognitionFactory,
  classifyRecognitionError,
  type RecognitionLike,
  type RecognitionResultEventLike,
  type TalkStyle,
} from "./talk";

class FakeRecognition implements RecognitionLike {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: RecognitionResultEventLike) => void) | null = null;
  onerror: ((event: { readonly error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor(private readonly log: string[]) {}
  start() {
    this.log.push("mic:start");
  }
  stop() {
    this.log.push("mic:stop");
  }
  abort() {
    this.log.push("mic:abort");
  }
  result(parts: { text: string; final: boolean }[], resultIndex = 0) {
    const results = parts.map((p) => Object.assign([{ transcript: p.text }], { isFinal: p.final }));
    this.onresult?.({ resultIndex, results });
  }
}

function setup(style: TalkStyle = "hold") {
  const log: string[] = [];
  const recognitions: FakeRecognition[] = [];
  const texts: string[] = [];
  const talk = new PushToTalk({
    create: () => {
      const r = new FakeRecognition(log);
      recognitions.push(r);
      return r;
    },
    style,
    onText: (text) => texts.push(text),
    beforeListen: () => log.push("speech:stop"),
  });
  return { talk, log, recognitions, texts };
}

describe("押して話す（hold）", () => {
  it("押すと、読み上げを止めてからマイクを開き、ja-JP で聞く", () => {
    const { talk, log, recognitions } = setup();
    talk.press();
    expect(log).toEqual(["speech:stop", "mic:start"]);
    expect(recognitions[0].lang).toBe(TALK_LANG);
    expect(recognitions[0].lang).toBe("ja-JP");
    expect(recognitions[0].continuous).toBe(true);
    expect(recognitions[0].interimResults).toBe(true);
    expect(talk.snapshot.listening).toBe(true);
  });

  it("途中の文は画面の中だけで見せ、離すと止まり、確定した文を1回だけ渡す", () => {
    const { talk, log, recognitions, texts } = setup();
    talk.press();
    recognitions[0].result([{ text: "Aという薬", final: false }]);
    expect(talk.snapshot.interim).toBe("Aという薬");
    expect(texts).toEqual([]);
    talk.release();
    expect(log).toContain("mic:stop");
    recognitions[0].result([{ text: " Aという薬を朝に1錠 ", final: true }]);
    recognitions[0].onend?.();
    expect(texts).toEqual(["Aという薬を朝に1錠"]);
    expect(talk.snapshot.listening).toBe(false);
    expect(talk.snapshot.interim).toBe("");
  });

  it("聞いている間にもう一度押しても、マイクを2つ開かない", () => {
    const { talk, recognitions } = setup();
    talk.press();
    talk.press();
    expect(recognitions).toHaveLength(1);
  });

  it("何も聞き取れなかったときは、文を渡さない", () => {
    const { talk, recognitions, texts } = setup();
    talk.press();
    talk.release();
    recognitions[0].onend?.();
    expect(texts).toEqual([]);
  });

  it("abort すると、届いていた文を捨ててすぐ閉じる", () => {
    const { talk, log, recognitions, texts } = setup();
    talk.press();
    recognitions[0].result([{ text: "途中まで", final: true }]);
    talk.abort();
    recognitions[0].onend?.();
    expect(log).toContain("mic:abort");
    expect(texts).toEqual([]);
    expect(talk.snapshot.listening).toBe(false);
  });

  it("マイクを拒否されたら、その後は押しても開かず、文字で答えるよう示す", () => {
    const { talk, recognitions } = setup();
    talk.press();
    recognitions[0].onerror?.({ error: "not-allowed" });
    recognitions[0].onend?.();
    expect(talk.snapshot.mic).toBe("denied");
    expect(talk.snapshot.notice).toBe("denied");
    talk.press();
    expect(recognitions).toHaveLength(1);
  });

  it("その回のうちに拒否されていたら、次の質問でも拒否の状態から始め、マイクを開こうとしない", () => {
    const log: string[] = [];
    const talk = new PushToTalk({
      create: () => new FakeRecognition(log),
      mic: "denied",
      onText: () => {},
      beforeListen: () => log.push("speech:stop"),
    });
    expect(talk.snapshot.mic).toBe("denied");
    talk.press();
    expect(log).toEqual([]);
  });

  it("声が無かったときは知らせるが、もう一度押せる", () => {
    const { talk, recognitions } = setup();
    talk.press();
    recognitions[0].onerror?.({ error: "no-speech" });
    recognitions[0].onend?.();
    expect(talk.snapshot.notice).toBe("no_speech");
    expect(talk.snapshot.mic).toBe("ready");
    talk.press();
    expect(recognitions).toHaveLength(2);
    expect(talk.snapshot.notice).toBeNull();
  });

  it("dispose の後は、届いた知らせを使わない", () => {
    const { talk, recognitions, texts } = setup();
    talk.press();
    talk.dispose();
    recognitions[0].result([{ text: "あと", final: true }]);
    recognitions[0].onend?.();
    talk.press();
    expect(texts).toEqual([]);
    expect(recognitions).toHaveLength(1);
  });
});

describe("押して話す（tap。オーナーが選んだら TALK_STYLE を替える）", () => {
  it("話し終わると自動で止まる設定で開き、もう一度押すと止める。離しても止めない", () => {
    const { talk, log, recognitions, texts } = setup("tap");
    talk.press();
    expect(recognitions[0].continuous).toBe(false);
    talk.release();
    expect(log).not.toContain("mic:stop");
    talk.press();
    expect(log).toContain("mic:stop");
    recognitions[0].result([{ text: "家族が知っています", final: true }]);
    recognitions[0].onend?.();
    expect(texts).toEqual(["家族が知っています"]);
  });
});

describe("音声認識が使えないブラウザ", () => {
  it("SpeechRecognition が無ければ、押しても何もせず、文字で答える", () => {
    const log: string[] = [];
    const talk = new PushToTalk({ create: null, onText: () => {}, beforeListen: () => log.push("speech:stop") });
    talk.press();
    expect(talk.snapshot.mic).toBe("unsupported");
    expect(log).toEqual([]);
  });

  it("webkit の接頭辞つきも探し、どちらも無ければ null", () => {
    class Recognition {}
    expect(browserRecognitionFactory({})).toBeNull();
    expect(browserRecognitionFactory({ webkitSpeechRecognition: Recognition })).not.toBeNull();
    expect(browserRecognitionFactory({ SpeechRecognition: Recognition })).not.toBeNull();
  });

  it("エラーの種類ごとに、示すこととマイクの扱いを決める", () => {
    expect(classifyRecognitionError("aborted")).toEqual({ notice: null, mic: null });
    expect(classifyRecognitionError("audio-capture")).toEqual({ notice: "no_mic", mic: "unavailable" });
    expect(classifyRecognitionError("service-not-allowed").mic).toBe("denied");
    expect(classifyRecognitionError("network")).toEqual({ notice: "network", mic: null });
    expect(classifyRecognitionError("language-not-supported").mic).toBe("unsupported");
    expect(classifyRecognitionError("something-new").notice).toBe("failed");
  });
});

describe("聞き取った文を入力欄に足す", () => {
  it("空なら入れ、あれば空白をはさんで後ろに足す。句読点は足さない", () => {
    expect(appendRecognized("", "Aという薬")).toBe("Aという薬");
    expect(appendRecognized("Aという薬", "朝に1錠")).toBe("Aという薬 朝に1錠");
    expect(appendRecognized("Aという薬 ", "朝に1錠")).toBe("Aという薬 朝に1錠");
  });

  it("入力の上限で切る", () => {
    expect(appendRecognized("あ".repeat(MAX_ANSWER_LENGTH - 1), "いう")).toHaveLength(MAX_ANSWER_LENGTH);
  });
});
