// /api/tts（読み上げの中継）の試験。ElevenLabs は呼ばず、偽物の応答を返す（docs/safety-test-plan.md P13・P14・P15）

import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, readLimitedText, type Env } from "./app";
import {
  MAX_TTS_BODY_BYTES,
  MAX_TTS_TEXT_LENGTH,
  TTS_MODEL,
  TTS_OUTPUT_FORMAT,
  createTtsApp,
  parseTtsText,
  ttsAllowed,
  type TtsFetch,
} from "./tts";

const TEXT = "普段の薬の情報は、どこに記録していますか？";
const KEY = "test-elevenlabs-key-not-real";
const VOICE = "TestVoice0123456789";
const env: Env = { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: VOICE };

function fakeUpstream(response: () => Response = () => audioResponse()) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: TtsFetch = async (url, init) => {
    calls.push({ url, init });
    return response();
  };
  return { calls, fetchImpl };
}

function audioResponse(): Response {
  return new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "history-item-id": "hist-123", "request-id": "req-1" },
  });
}

function post(app: { request: ReturnType<typeof createApp>["request"] }, body: string, e: Env = env, url = "http://localhost/api/tts") {
  return app.request(url, { method: "POST", body, headers: { "Content-Type": "application/json" } }, e);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/tts は手元からの呼び出しだけを通す（公開の切り替えは D-01）", () => {
  it("公開のドメインからは、PUBLIC_TURN=1 でも呼べない。ElevenLabs を呼ばない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const response = await post(app, JSON.stringify({ text: TEXT }), { ...env, PUBLIC_TURN: "1" } as Env, "https://sonaquest.example/api/tts");
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("Workers の入口（createApp）でも、公開のドメインからは 503", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await post(createApp(), JSON.stringify({ text: TEXT }), { ...env, PUBLIC_TURN: "1" }, "https://sonaquest.example/api/tts");
    expect(response.status).toBe(503);
  });

  it("宛先は localhost と 127.0.0.1 だけ", () => {
    expect(ttsAllowed("http://localhost:8787/api/tts")).toBe(true);
    expect(ttsAllowed("http://127.0.0.1:8787/api/tts")).toBe(true);
    expect(ttsAllowed("https://sonaquest.example/api/tts")).toBe(false);
    expect(ttsAllowed("https://localhost.example/api/tts")).toBe(false);
    expect(ttsAllowed("not a url")).toBe(false);
  });
});

describe("ElevenLabs に送るのは読み上げる文だけ（ADR-0005）", () => {
  it("文とモデル・言語だけを送り、キーは見出しにだけ入れる。音声はそのまま返し、事業者の見出しは渡さない", async () => {
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const response = await post(app, JSON.stringify({ text: TEXT }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("history-item-id")).toBeNull();
    expect(response.headers.get("request-id")).toBeNull();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]));

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=${TTS_OUTPUT_FORMAT}`);
    expect(url).not.toContain(KEY);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ text: TEXT, model_id: TTS_MODEL, language_code: "ja" });
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("受け取る形は { text } だけ。回答などほかの値が付いていたら拒否する", () => {
    expect(parseTtsText({ text: TEXT })).toBe(TEXT);
    expect(parseTtsText({ text: `  ${TEXT}  ` })).toBe(TEXT);
    expect(parseTtsText({ text: TEXT, answer: "回答" })).toBeNull();
    expect(parseTtsText({ inputs: [] })).toBeNull();
    expect(parseTtsText({ text: "" })).toBeNull();
    expect(parseTtsText({ text: "   " })).toBeNull();
    expect(parseTtsText({ text: 1 })).toBeNull();
    expect(parseTtsText([TEXT])).toBeNull();
    expect(parseTtsText(null)).toBeNull();
    expect(parseTtsText({ text: "あ".repeat(MAX_TTS_TEXT_LENGTH) })).not.toBeNull();
    expect(parseTtsText({ text: "あ".repeat(MAX_TTS_TEXT_LENGTH + 1) })).toBeNull();
  });

  it("形の違う入力と大きすぎる入力は、ElevenLabs を呼ばずに拒否する", async () => {
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    expect((await post(app, "not json")).status).toBe(400);
    expect((await post(app, JSON.stringify({ text: TEXT, extra: 1 }))).status).toBe(400);
    expect((await post(app, JSON.stringify({ text: "あ".repeat(MAX_TTS_TEXT_LENGTH + 1) }))).status).toBe(400);
    expect((await post(app, "x".repeat(MAX_TTS_BODY_BYTES + 1))).status).toBe(413);
    expect(calls).toHaveLength(0);
  });
});

describe("失敗したときは 5xx を返し、画面はブラウザの読み上げに切り替える", () => {
  it("キーや声の ID が無い・形が違うときは、ElevenLabs を呼ばない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const body = JSON.stringify({ text: TEXT });
    expect((await post(app, body, { ELEVENLABS_VOICE_ID: VOICE })).status).toBe(503);
    expect((await post(app, body, { ELEVENLABS_API_KEY: KEY })).status).toBe(503);
    expect((await post(app, body, { ...env, ELEVENLABS_VOICE_ID: "../v1/user" })).status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("事業者の失敗・音声でない応答・時間切れ・つながらないときは 502", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = JSON.stringify({ text: TEXT });
    const status = createTtsApp({
      readBody: readLimitedText,
      fetchImpl: fakeUpstream(() => new Response('{"detail":"quota"}', { status: 401, headers: { "Content-Type": "application/json" } })).fetchImpl,
    });
    expect((await post(status, body)).status).toBe(502);
    const json = createTtsApp({
      readBody: readLimitedText,
      fetchImpl: fakeUpstream(() => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })).fetchImpl,
    });
    expect((await post(json, body)).status).toBe(502);
    const timeout = createTtsApp({
      readBody: readLimitedText,
      fetchImpl: async () => {
        throw new DOMException("timed out", "TimeoutError");
      },
    });
    expect((await post(timeout, body)).status).toBe(502);
    const network = createTtsApp({
      readBody: readLimitedText,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect((await post(network, body)).status).toBe(502);
  });
});

describe("本文・キーをログに出さない（ADR-0007）", () => {
  it("成功・失敗のどちらでも、出すのは種類だけ", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const body = JSON.stringify({ text: TEXT });
    await post(createTtsApp({ readBody: readLimitedText, fetchImpl: fakeUpstream().fetchImpl }), body);
    await post(
      createTtsApp({
        readBody: readLimitedText,
        fetchImpl: fakeUpstream(() => new Response(TEXT, { status: 500, headers: { "Content-Type": "text/plain" } })).fetchImpl,
      }),
      body,
    );
    await post(createTtsApp({ readBody: readLimitedText, fetchImpl: async () => Promise.reject(new Error(TEXT)) }), body);
    await post(createTtsApp({ readBody: readLimitedText }), body, {});
    await post(createTtsApp({ readBody: readLimitedText }), body, env, "https://sonaquest.example/api/tts");
    const warned = spies[2].mock.calls.map((c) => String(c[0]));
    expect(warned).toEqual(["tts: upstream_500", "tts: network", "tts: no_api_key", "tts: public_disabled"]);
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(TEXT);
        expect(JSON.stringify(call)).not.toContain(KEY);
      }
    }
  });

  it("事業者のエラーは、英小文字の符号だけを足し、説明の文や本文は出さない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorJson = (detail: unknown, status = 400) => () =>
      new Response(JSON.stringify({ detail }), { status, headers: { "Content-Type": "application/json" } });
    const body = JSON.stringify({ text: TEXT });
    const cases: [() => Response, string][] = [
      [errorJson({ status: "api_key_id_used_as_api_key", message: `説明の文 ${TEXT}` }), "tts: upstream_400:api_key_id_used_as_api_key"],
      [errorJson({ status: "invalid_api_key" }, 401), "tts: upstream_401:invalid_api_key"],
      // 符号の形でないもの（空白・大文字・日本語・長すぎる）は出さない
      [errorJson({ status: `bad ${TEXT}` }), "tts: upstream_400"],
      [errorJson({ status: "Invalid Key" }), "tts: upstream_400"],
      [errorJson({ status: "x".repeat(65) }), "tts: upstream_400"],
      [errorJson(TEXT), "tts: upstream_400"],
      [() => new Response("not json", { status: 422, headers: { "Content-Type": "application/json" } }), "tts: upstream_422"],
    ];
    for (const [response] of cases) {
      await post(createTtsApp({ readBody: readLimitedText, fetchImpl: fakeUpstream(response).fetchImpl }), body);
    }
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(cases.map(([, expected]) => expected));
    for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toContain(TEXT);
  });
});
