// 読み上げ（speaker.ts）の試験。ElevenLabs・音声の再生・ブラウザの読み上げの代わりに偽物を差し込む
// （docs/safety-test-plan.md F6・V2・V6・P13）

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Speaker,
  TTS_START_TIMEOUT_MS,
  fetchTtsAudio,
  type AudioLike,
  type SpeakerDeps,
  type SynthLike,
  type UtteranceLike,
} from "./speaker";
import { PushToTalk, type RecognitionLike } from "./talk";

const TEXT = "普段の薬の情報は、どこに記録していますか？";

class FakeAudio implements AudioLike {
  src = "";
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  plays = 0;
  pauses = 0;
  playResult: () => Promise<void> = () => Promise.resolve();
  constructor(private readonly log: string[]) {}
  play() {
    this.plays++;
    this.log.push("audio:play");
    return this.playResult();
  }
  pause() {
    this.pauses++;
    this.log.push("audio:pause");
  }
}

interface FakeUtterance extends UtteranceLike {
  text: string;
}

class FakeSynth implements SynthLike {
  spoken: FakeUtterance[] = [];
  cancels = 0;
  constructor(private readonly log: string[]) {}
  speak(utterance: UtteranceLike) {
    this.spoken.push(utterance as FakeUtterance);
    this.log.push("synth:speak");
  }
  cancel() {
    this.cancels++;
    this.log.push("synth:cancel");
  }
  getVoices() {
    return [{ lang: "en-US" }, { lang: "ja-JP" }];
  }
}

function setup(overrides: Partial<SpeakerDeps> = {}) {
  const log: string[] = [];
  const audio = new FakeAudio(log);
  const synth = new FakeSynth(log);
  const warnings: string[] = [];
  const fetched: string[] = [];
  const signals: AbortSignal[] = [];
  const deps: SpeakerDeps = {
    fetchAudio: (text, signal) => {
      fetched.push(text);
      signals.push(signal);
      return Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }));
    },
    createAudio: () => audio,
    createObjectUrl: () => "blob:test",
    revokeObjectUrl: () => {},
    synth,
    createUtterance: (text) => ({ text, lang: "", voice: null, onstart: null, onend: null, onerror: null }) as FakeUtterance,
    hasUserActivation: () => true,
    warn: (kind) => warnings.push(kind),
    ...overrides,
  };
  const speaker = new Speaker(deps);
  return { speaker, audio, synth, warnings, fetched, signals, log };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ElevenLabs で読み上げる", () => {
  it("読み上げる文だけを取りに行き、再生が始まったら話している、終わったら止まる", async () => {
    const { speaker, audio, fetched } = setup();
    speaker.speak(TEXT);
    expect(speaker.snapshot.loading).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toEqual([TEXT]);
    expect(audio.src).toBe("blob:test");
    expect(audio.plays).toBe(1);
    audio.onplaying?.();
    expect(speaker.snapshot).toMatchObject({ engine: "elevenlabs", loading: false, speaking: true });
    audio.onended?.();
    expect(speaker.snapshot.speaking).toBe(false);
  });

  it("同じ文は取りに行き直さない（メモリの中だけ）", async () => {
    const { speaker, audio, fetched } = setup();
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(0);
    audio.onplaying?.();
    audio.onended?.();
    speaker.replay();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toHaveLength(1);
    expect(audio.plays).toBe(2);
  });

  it("始まった後は、時間切れで切り替えない", async () => {
    const { speaker, audio, synth } = setup();
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(0);
    audio.onplaying?.();
    await vi.advanceTimersByTimeAsync(TTS_START_TIMEOUT_MS * 2);
    expect(synth.spoken).toHaveLength(0);
    expect(speaker.snapshot.engine).toBe("elevenlabs");
  });
});

describe("ElevenLabs が使えないときは、ブラウザの読み上げに切り替える（ADR-0005、ADR-0033）", () => {
  it("失敗したら、同じ文をブラウザで日本語の声で読み、その回の残りでは ElevenLabs を呼ばない", async () => {
    const fetched: string[] = [];
    const { speaker, synth, warnings } = setup({
      fetchAudio: (text) => {
        fetched.push(text);
        return Promise.reject(new Error("tts_status_502"));
      },
    });
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(0);
    expect(speaker.snapshot.engine).toBe("browser");
    expect(synth.spoken.map((u) => u.text)).toEqual([TEXT]);
    expect(synth.spoken[0].lang).toBe("ja-JP");
    expect(synth.spoken[0].voice?.lang).toBe("ja-JP");
    synth.spoken[0].onstart?.();
    expect(speaker.snapshot.speaking).toBe(true);
    synth.spoken[0].onend?.();
    speaker.speak("次の質問です。");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toEqual([TEXT]);
    expect(synth.spoken.map((u) => u.text)).toEqual([TEXT, "次の質問です。"]);
    expect(warnings).toEqual(["tts: fallback_failed"]);
  });

  it("始まるまでが長いときは、待つのをやめて切り替え、取りに行く処理を止める", async () => {
    const signals: AbortSignal[] = [];
    const { speaker, synth, warnings } = setup({
      fetchAudio: (_text, signal) => {
        signals.push(signal);
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
      },
    });
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(TTS_START_TIMEOUT_MS - 1);
    expect(synth.spoken).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals[0].aborted).toBe(true);
    expect(synth.spoken.map((u) => u.text)).toEqual([TEXT]);
    // 止めた処理の失敗（AbortError）で、もう一度切り替えない
    await vi.advanceTimersByTimeAsync(0);
    expect(synth.spoken).toHaveLength(1);
    expect(warnings).toEqual(["tts: fallback_timeout"]);
  });

  it("音声が再生できなかったときも切り替える", async () => {
    const { speaker, audio, synth, warnings } = setup();
    audio.playResult = () => new Promise(() => {});
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(0);
    audio.onerror?.();
    expect(synth.spoken.map((u) => u.text)).toEqual([TEXT]);
    expect(warnings).toEqual(["tts: fallback_media_error"]);
  });

  it("ブラウザの読み上げも無ければ、文の表示だけで進む", async () => {
    const { speaker } = setup({ synth: null, fetchAudio: () => Promise.reject(new Error("x")) });
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(0);
    expect(speaker.snapshot).toMatchObject({ engine: "none", speaking: false, loading: false });
  });
});

describe("最初のタップまで再生しない", () => {
  it("利用者がまだ操作していなければ、取りに行かずに待ち、押されたら読む", async () => {
    let active = false;
    const { speaker, fetched } = setup({ hasUserActivation: () => active });
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toEqual([]);
    expect(speaker.snapshot.blocked).toBe(true);
    active = true;
    speaker.replay();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toEqual([TEXT]);
  });

  it("自動再生の制限で止められたら、ElevenLabs のまま、押されるのを待つ", async () => {
    const { speaker, audio, synth } = setup();
    audio.playResult = () => Promise.reject(new DOMException("blocked", "NotAllowedError"));
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(TTS_START_TIMEOUT_MS * 2);
    expect(speaker.snapshot).toMatchObject({ engine: "elevenlabs", blocked: true, loading: false });
    expect(synth.spoken).toHaveLength(0);
  });
});

describe("止める", () => {
  it("取りに行っている間に止めたら、届いても再生しない", async () => {
    let resolve: (blob: Blob) => void = () => {};
    const { speaker, audio } = setup({
      fetchAudio: () => new Promise<Blob>((r) => (resolve = r)),
    });
    speaker.speak(TEXT);
    speaker.stop();
    resolve(new Blob([new Uint8Array([1])]));
    await vi.advanceTimersByTimeAsync(TTS_START_TIMEOUT_MS * 2);
    expect(audio.plays).toBe(0);
    expect(speaker.snapshot).toMatchObject({ loading: false, speaking: false });
  });

  it("dispose の後は読み上げない", async () => {
    const { speaker, fetched } = setup();
    speaker.dispose();
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toEqual([]);
  });
});

describe("読み上げの間はマイクを閉じる（ADR-0033）", () => {
  it("読み上げ中に「話す」を押すと、先に読み上げを止めてからマイクを開く", async () => {
    const { speaker, audio, log } = setup();
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(0);
    audio.onplaying?.();
    expect(speaker.snapshot.speaking).toBe(true);
    const recognition: RecognitionLike = {
      lang: "",
      continuous: false,
      interimResults: false,
      maxAlternatives: 0,
      onstart: null,
      onresult: null,
      onerror: null,
      onend: null,
      start: () => {
        // マイクを開く時点で、声は止まっている
        expect(speaker.snapshot.speaking).toBe(false);
        log.push("mic:start");
      },
      stop: () => {},
      abort: () => {},
    };
    const talk = new PushToTalk({ create: () => recognition, onText: () => {}, beforeListen: () => speaker.stop() });
    log.length = 0;
    talk.press();
    expect(log.indexOf("audio:pause")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("audio:pause")).toBeLessThan(log.indexOf("mic:start"));
    expect(log.indexOf("synth:cancel")).toBeLessThan(log.indexOf("mic:start"));
  });
});

describe("本文をログに出さない（ADR-0007）", () => {
  it("切り替えたときに出すのは種類だけ", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const { speaker, warnings } = setup({ fetchAudio: () => Promise.reject(new Error(TEXT)) });
    speaker.speak(TEXT);
    await vi.advanceTimersByTimeAsync(TTS_START_TIMEOUT_MS * 2);
    for (const w of warnings) expect(w).not.toContain(TEXT);
    for (const spy of spies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(TEXT);
    }
  });
});

describe("読み上げの中継を呼ぶ（fetchTtsAudio）", () => {
  it("POST で { text } だけを送る。URL に文を入れない", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(new Uint8Array([1, 2]), { headers: { "Content-Type": "audio/mpeg" } });
    }) as unknown as typeof fetch;
    const blob = await fetchTtsAudio(TEXT, new AbortController().signal, fake);
    expect(blob.size).toBe(2);
    expect(calls[0].url).toBe("/api/tts");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: TEXT });
  });

  it("失敗の応答と空の音声は例外にする（ブラウザの読み上げに切り替えるため）", async () => {
    const status = (async () => new Response("x", { status: 503 })) as unknown as typeof fetch;
    await expect(fetchTtsAudio(TEXT, new AbortController().signal, status)).rejects.toThrow("tts_status_503");
    const empty = (async () => new Response(new Uint8Array([]))) as unknown as typeof fetch;
    await expect(fetchTtsAudio(TEXT, new AbortController().signal, empty)).rejects.toThrow("tts_empty");
  });
});
