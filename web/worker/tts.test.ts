// /api/tts（読み上げの中継）の試験。ElevenLabs は呼ばず、偽物の応答を返す（docs/safety-test-plan.md P13・P14・P15）

import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, readLimitedText, type Env } from "./app";
import {
  MAX_TTS_SPEC_BODY_BYTES,
  MAX_TTS_TEXT_LENGTH,
  TTS_MODEL,
  TTS_VOICE_SETTINGS,
  TTS_OUTPUT_FORMAT,
  createTtsApp,
  parseTtsRequest,
  ttsAllowed,
  type TtsFetch,
} from "./tts";
import { ALL_QUESTIONS } from "../src/flow/content";
import { composeSpeech, fixedId, type SpeechSpec } from "../src/voice/speechPlan";
import { MIN_SIGNING_KEY_LENGTH, SPEECH_TOKEN_TTL_MS, signSpeechText } from "./speechSign";
import { crossSiteRequest } from "./guard";
import type { RateLimiter } from "./ratelimit";

/** 読み上げる文の設計図（固定の質問1つ）。/api/tts は文そのものではなく、これを受け取る（Issue #284） */
const QUESTION = ALL_QUESTIONS[0];
const SPEC: SpeechSpec = { kind: "ask", opening: false, recall: false, prompt: [{ fixed: fixedId.question(QUESTION.id) }] };
const TEXT = QUESTION.text;
const BODY = JSON.stringify({ speech: SPEC });
const KEY = "test-elevenlabs-key-not-real";
const VOICE = "TestVoice0123456789";
const SIGNING_KEY = "test-signing-key-not-real-".padEnd(MIN_SIGNING_KEY_LENGTH, "x");
const env: Env = { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: VOICE, TTS_SIGNING_KEY: SIGNING_KEY };

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

const PUBLIC_URL = "https://sonaquest.example/api/tts";

/** 偽の回数制限の binding。数えたキーを残す */
function fakeLimiter(success = true): RateLimiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    limit: async ({ key }) => {
      keys.push(key);
      return { success };
    },
  };
}

describe("/api/tts は /api/turn と同じ条件で通す（2026-11-04 オーナー決定、ADR-0033）", () => {
  it("公開のドメインからは、公開の切り替えが無ければ呼べない。ElevenLabs を呼ばない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const response = await post(app, BODY, env, PUBLIC_URL);
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("Workers の入口（createApp）でも、公開の切り替えが無ければ公開のドメインからは 503", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await post(createApp(), BODY, env, PUBLIC_URL);
    expect(response.status).toBe(503);
  });

  it("公開の切り替え（PUBLIC_TURN=1）のときは、接頭辞 tts で接続元ごとに1回数えてから ElevenLabs を呼ぶ", async () => {
    const { calls, fetchImpl } = fakeUpstream();
    const limiter = fakeLimiter();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const response = await app.request(
      PUBLIC_URL,
      {
        method: "POST",
        body: BODY,
        headers: { "Content-Type": "application/json", "cf-connecting-ip": "203.0.113.7" },
      },
      { ...env, PUBLIC_TURN: "1", TURN_LIMITER: limiter },
    );
    expect(response.status).toBe(200);
    expect(limiter.keys).toEqual(["tts:203.0.113.7"]);
    expect(calls).toHaveLength(1);
  });

  it("上限を超えたら 429（Retry-After: 60）、binding が無い・失敗したら 503 で閉じ、ElevenLabs を呼ばない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const body = BODY;
    const limited = await post(app, body, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: fakeLimiter(false) }, PUBLIC_URL);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await post(app, body, { ...env, PUBLIC_TURN: "1" }, PUBLIC_URL)).status).toBe(503);
    const broken: RateLimiter = { limit: async () => Promise.reject(new Error("binding")) };
    expect((await post(app, body, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: broken }, PUBLIC_URL)).status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("手元の開発では数えない（/api/turn と同じ）", async () => {
    const limiter = fakeLimiter(false);
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl: fakeUpstream().fetchImpl });
    expect((await post(app, BODY, { ...env, TURN_LIMITER: limiter })).status).toBe(200);
    expect(limiter.keys).toEqual([]);
  });

  it("通す条件は、宛先が localhost・127.0.0.1 か、PUBLIC_TURN が \"1\" のとき", () => {
    expect(ttsAllowed({}, "http://localhost:8787/api/tts")).toBe(true);
    expect(ttsAllowed({}, "http://127.0.0.1:8787/api/tts")).toBe(true);
    expect(ttsAllowed({}, PUBLIC_URL)).toBe(false);
    expect(ttsAllowed({}, "https://localhost.example/api/tts")).toBe(false);
    expect(ttsAllowed({}, "not a url")).toBe(false);
    expect(ttsAllowed({ PUBLIC_TURN: "1" }, PUBLIC_URL)).toBe(true);
    expect(ttsAllowed({ PUBLIC_TURN: "true" }, PUBLIC_URL)).toBe(false);
  });
});

describe("別のサイトのページからの呼び出しを拒む（PR #63 のレビュー）", () => {
  it("JSON の形を宣言しない呼び出しと、Sec-Fetch-Site: cross-site の呼び出しは 403 で、ElevenLabs を呼ばない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const body = BODY;
    const send = (headers: Record<string, string>) =>
      app.request("http://localhost/api/tts", { method: "POST", body, headers }, env);
    expect((await send({ "Content-Type": "text/plain" })).status).toBe(403);
    expect((await send({})).status).toBe(403);
    expect((await send({ "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect(calls).toHaveLength(0);
    expect((await send({ "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" })).status).toBe(200);
    expect((await send({ "Content-Type": "application/json; charset=utf-8" })).status).toBe(200);
  });

  it("判定だけを確かめる", () => {
    const req = (headers: Record<string, string>) => new Request("http://localhost/api/tts", { method: "POST", headers });
    expect(crossSiteRequest(req({ "Content-Type": "application/json" }))).toBe(false);
    expect(crossSiteRequest(req({ "Content-Type": "application/json", "Sec-Fetch-Site": "same-site" }))).toBe(false);
    expect(crossSiteRequest(req({ "Content-Type": "application/x-www-form-urlencoded" }))).toBe(true);
    expect(crossSiteRequest(req({ "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" }))).toBe(true);
  });
});

describe("ElevenLabs に送るのは読み上げる文だけ（ADR-0005）", () => {
  it("文とモデル・言語だけを送り、キーは見出しにだけ入れる。音声はそのまま返し、事業者の見出しは渡さない", async () => {
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const response = await post(app, BODY);
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
    expect(JSON.parse(String(init.body))).toEqual({
      text: TEXT,
      model_id: TTS_MODEL,
      language_code: "ja",
      voice_settings: TTS_VOICE_SETTINGS,
    });
    expect(TTS_MODEL).toBe("eleven_v4_turbo");
    expect(TTS_VOICE_SETTINGS.stability).toBe(0.65);
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("受け取る形は { speech: 設計図 } だけ。文そのもの・回答などほかの値が付いていたら拒否する", () => {
    expect(parseTtsRequest({ speech: SPEC })).toEqual(SPEC);
    expect(parseTtsRequest({ text: TEXT })).toBeNull();
    expect(parseTtsRequest({ speech: SPEC, text: TEXT })).toBeNull();
    expect(parseTtsRequest({ speech: SPEC, answer: "回答" })).toBeNull();
    expect(parseTtsRequest({ speech: { ...SPEC, answer: "回答" } })).toBeNull();
    expect(parseTtsRequest({ speech: { ...SPEC, prompt: [{ fixed: "q:unknown" }] } })).toBeNull();
    expect(parseTtsRequest({ speech: { ...SPEC, prompt: [] } })).toBeNull();
    expect(parseTtsRequest({ speech: { ...SPEC, prompt: [{ claude: "", token: null }] } })).toBeNull();
    expect(parseTtsRequest({ speech: { ...SPEC, prompt: [{ claude: "あ".repeat(201), token: null }] } })).toBeNull();
    expect(parseTtsRequest({ speech: { ...SPEC, prompt: Array(5).fill({ fixed: fixedId.question(QUESTION.id) }) } })).toBeNull();
    expect(parseTtsRequest({ speech: { kind: "event", event: "earthquake" } })).toBeNull();
    expect(parseTtsRequest({ speech: { kind: "review", event: null, ai: "on", judgments: { location: "confirmed" }, ack: [], remark: [] } })).toBeNull();
    expect(parseTtsRequest({ speech: { kind: "other" } })).toBeNull();
    expect(parseTtsRequest([SPEC])).toBeNull();
    expect(parseTtsRequest(null)).toBeNull();
  });

  it("形の違う入力と大きすぎる入力は、ElevenLabs を呼ばずに拒否する", async () => {
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    expect((await post(app, "not json")).status).toBe(400);
    expect((await post(app, JSON.stringify({ speech: SPEC, extra: 1 }))).status).toBe(400);
    // 任意の文は受け取らない（Issue #284）
    expect((await post(app, JSON.stringify({ text: TEXT }))).status).toBe(400);
    expect((await post(app, "x".repeat(MAX_TTS_SPEC_BODY_BYTES + 1))).status).toBe(413);
    expect(calls).toHaveLength(0);
  });
});

describe("失敗したときは 5xx を返し、画面はブラウザの読み上げに切り替える", () => {
  it("キーや声の ID が無い・形が違うときは、ElevenLabs を呼ばない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    const body = BODY;
    expect((await post(app, body, { ELEVENLABS_VOICE_ID: VOICE })).status).toBe(503);
    expect((await post(app, body, { ELEVENLABS_API_KEY: KEY })).status).toBe(503);
    expect((await post(app, body, { ...env, ELEVENLABS_VOICE_ID: "../v1/user" })).status).toBe(503);
    expect(calls).toHaveLength(0);
  });

  it("事業者の失敗・音声でない応答・時間切れ・つながらないときは 502", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = BODY;
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
    const body = BODY;
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
    const body = BODY;
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

describe("読むのは固定文と、/api/turn が署名した Claude の文だけ（Issue #284 の指摘3、案A）", () => {
  const claudeText = "お薬手帳は、いまどこにありますか？";
  const claudeSpec = (token: string | null): SpeechSpec => ({
    kind: "ask",
    opening: false,
    recall: false,
    prompt: [{ claude: claudeText, token }],
  });
  const send = (spec: SpeechSpec, e: Env = env) => {
    const { calls, fetchImpl } = fakeUpstream();
    const app = createTtsApp({ readBody: readLimitedText, fetchImpl });
    return Promise.resolve(post(app, JSON.stringify({ speech: spec }), e)).then((response) => ({ response, calls }));
  };

  it("署名の合う Claude の文は、画面と同じ関数で組み立てた文を ElevenLabs に送る", async () => {
    const { response, calls } = await send(claudeSpec(await signSpeechText(SIGNING_KEY, claudeText)));
    expect(response.status).toBe(200);
    expect(JSON.parse(String(calls[0].init.body)).text).toBe(composeSpeech(claudeSpec(null)));
  });

  it("署名の無い・合わない・期限切れ・別の文の署名は 400 で、ElevenLabs を呼ばない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const valid = await signSpeechText(SIGNING_KEY, claudeText);
    const other = await signSpeechText(SIGNING_KEY, "別の文です。");
    const expired = await signSpeechText(SIGNING_KEY, claudeText, Date.now() - SPEECH_TOKEN_TTL_MS - 60_000);
    const otherKey = await signSpeechText("y".repeat(MIN_SIGNING_KEY_LENGTH), claudeText);
    // 署名の先頭の1文字を替える（末尾の1文字は詰めのビットだけのことがあるので使わない）
    const dot = valid.indexOf(".") + 1;
    const tampered = `${valid.slice(0, dot)}${valid[dot] === "A" ? "B" : "A"}${valid.slice(dot + 1)}`;
    for (const token of [null, other, expired, otherKey, tampered, "123.bad"]) {
      const { response, calls } = await send(claudeSpec(token));
      expect(response.status).toBe(400);
      expect(calls).toHaveLength(0);
    }
    const kinds = warn.mock.calls.map((c) => String(c[0]));
    expect(kinds).toEqual(["tts: unsigned", "tts: bad_signature", "tts: expired", "tts: bad_signature", "tts: bad_signature", "tts: bad_signature"]);
    // ログには種類だけ。文も署名も出さない
    for (const call of warn.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(claudeText);
      expect(JSON.stringify(call)).not.toContain(valid.split(".")[1]);
    }
  });

  it("署名の秘密の値（TTS_SIGNING_KEY）が無い・短いときは、固定文だけの回も 503 で、ElevenLabs を呼ばない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const e of [{ ...env, TTS_SIGNING_KEY: undefined }, { ...env, TTS_SIGNING_KEY: "short" }]) {
      const { response, calls } = await send(SPEC, e);
      expect(response.status).toBe(503);
      expect(calls).toHaveLength(0);
    }
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual(["tts: no_signing_key", "tts: no_signing_key"]);
  });

  it("組み立てた文が上限（500字）を超えるときは 400 で、ElevenLabs を呼ばない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const long = "あ".repeat(200);
    const token = await signSpeechText(SIGNING_KEY, long);
    const spec: SpeechSpec = {
      kind: "ask",
      opening: true,
      recall: true,
      prompt: [{ claude: long, token }, { claude: long, token }, { claude: long, token }],
    };
    expect(composeSpeech(spec)!.length).toBeGreaterThan(MAX_TTS_TEXT_LENGTH);
    const { response, calls } = await send(spec);
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("振り返りの設計図（Claude の受け止めと一言が上限の長さ）も本文の上限に収まり、読む文は上限に収める", async () => {
    const reviewSpec = async (ack: string, remark: string): Promise<SpeechSpec> => ({
      kind: "review",
      event: "family_unreachable",
      ai: "on",
      judgments: { location: "not_mentioned", alternative: "aware_unconfirmed", current: "not_mentioned", unrecorded: "aware_unconfirmed", proxy: "not_mentioned" },
      ack: [{ claude: ack, token: await signSpeechText(SIGNING_KEY, ack) }, { fixed: fixedId.recheckClosing }],
      remark: [{ claude: remark, token: await signSpeechText(SIGNING_KEY, remark) }],
    });
    const largest = await reviewSpec("受".repeat(200), "言".repeat(200));
    expect(new TextEncoder().encode(JSON.stringify({ speech: largest })).byteLength).toBeLessThan(MAX_TTS_SPEC_BODY_BYTES);
    // 一言が長いときは、画面と同じく一言を省いて上限に収める
    const ack = "受".repeat(60);
    const remark = "言".repeat(200);
    const spec = await reviewSpec(ack, remark);
    const { response, calls } = await send(spec);
    expect(response.status).toBe(200);
    const sent = JSON.parse(String(calls[0].init.body)).text as string;
    expect(sent).toBe(composeSpeech(spec));
    expect(sent.length).toBeLessThanOrEqual(MAX_TTS_TEXT_LENGTH);
  });
});
