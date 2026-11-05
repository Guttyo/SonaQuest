// /api/dev/tts（読み上げの聞き比べ、開発用）の試験。ElevenLabs は呼ばず、偽物の応答を返す

import { describe, expect, it } from "vitest";
import { createApp, readLimitedText, type Env } from "./app";
import { createTtsLabApp, labRequestBody, parseLabRequest, type TtsLabEnv } from "./ttsLab";
import type { TtsFetch } from "./tts";

const KEY = "test-elevenlabs-key-not-real";
const VOICE = "TestVoice0123456789";
const VOICE_B = "TestVoiceB012345678";
const env: TtsLabEnv = { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: VOICE, DEV_EXPERIMENT: "1" };

const GOOD = {
  text: "普段の薬の情報は、どこに記録していますか？",
  model: "eleven_v4_turbo",
  speed: 0.9,
  stability: 0.4,
  style: 0,
  normalize: true,
  voice: "main",
};

function fake() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl: TtsFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
  };
  return { calls, fetchImpl };
}

function post(app: ReturnType<typeof createTtsLabApp>, body: unknown, e: TtsLabEnv = env, url = "http://localhost/api/dev/tts") {
  return app.request(
    url,
    { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
    e,
  );
}

describe("parseLabRequest", () => {
  it("決まった形だけを受け取る", () => {
    expect(parseLabRequest(GOOD)).not.toBeNull();
    expect(parseLabRequest({ ...GOOD, extra: 1 })).toBeNull();
    expect(parseLabRequest({ ...GOOD, model: "eleven_flash_v2" })).toBeNull();
    expect(parseLabRequest({ ...GOOD, speed: 2 })).toBeNull();
    expect(parseLabRequest({ ...GOOD, speed: 0.5 })).toBeNull();
    expect(parseLabRequest({ ...GOOD, stability: 1.5 })).toBeNull();
    expect(parseLabRequest({ ...GOOD, style: -0.1 })).toBeNull();
    expect(parseLabRequest({ ...GOOD, normalize: "yes" })).toBeNull();
    expect(parseLabRequest({ ...GOOD, voice: "c" })).toBeNull();
    expect(parseLabRequest({ ...GOOD, text: " " })).toBeNull();
    expect(parseLabRequest({ ...GOOD, text: "あ".repeat(501) })).toBeNull();
  });
});

describe("labRequestBody", () => {
  it("速さ・抑揚・読みの補正を送り、Multilingual v2 には language_code を付けない", () => {
    const body = labRequestBody(parseLabRequest(GOOD)!);
    expect(body).toMatchObject({
      model_id: "eleven_v4_turbo",
      language_code: "ja",
      apply_language_text_normalization: true,
      voice_settings: { speed: 0.9, stability: 0.4, style: 0 },
    });
    const v2 = labRequestBody(parseLabRequest({ ...GOOD, model: "eleven_multilingual_v2", normalize: false })!);
    expect(v2).not.toHaveProperty("language_code");
    expect(v2).not.toHaveProperty("apply_language_text_normalization");
  });
});

describe("/api/dev/tts", () => {
  it("比較実験の切り替えが無いときは 404 で、ElevenLabs を呼ばない", async () => {
    const { calls, fetchImpl } = fake();
    const app = createTtsLabApp({ readBody: readLimitedText, fetchImpl });
    const res = await post(app, GOOD, { ...env, DEV_EXPERIMENT: undefined });
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("公開の宛先では、切り替えがあっても 404", async () => {
    const { calls, fetchImpl } = fake();
    const app = createTtsLabApp({ readBody: readLimitedText, fetchImpl });
    const res = await post(app, GOOD, { ...env, PUBLIC_TURN: "1" }, "https://sonaquest.example.workers.dev/api/dev/tts");
    expect(res.status).toBe(404);
    const info = await app.request("https://sonaquest.example.workers.dev/api/dev/tts", {}, env);
    expect(info.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("手元で切り替えがあるときは、選んだ設定で ElevenLabs を呼び、音声を保存させずに返す", async () => {
    const { calls, fetchImpl } = fake();
    const app = createTtsLabApp({ readBody: readLimitedText, fetchImpl });
    const res = await post(app, GOOD);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(`/v1/text-to-speech/${VOICE}?`);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({ model_id: "eleven_v4_turbo" });
  });

  it("比べる声は、手元で指定したときだけ使え、声の ID を画面に返さない", async () => {
    const { calls, fetchImpl } = fake();
    const app = createTtsLabApp({ readBody: readLimitedText, fetchImpl });
    expect((await post(app, { ...GOOD, voice: "b" })).status).toBe(503);
    const withB = { ...env, DEV_TTS_VOICE_B: VOICE_B };
    expect((await post(app, { ...GOOD, voice: "b" }, withB)).status).toBe(200);
    expect(calls[0].url).toContain(`/v1/text-to-speech/${VOICE_B}?`);
    const info = await app.request("http://localhost/api/dev/tts", {}, withB);
    const text = await info.text();
    expect(JSON.parse(text)).toMatchObject({ voiceB: true });
    expect(text).not.toContain(VOICE_B);
    expect(text).not.toContain(VOICE);
  });

  it("別のサイトからの呼び出しと、形の違う入力は拒む", async () => {
    const { calls, fetchImpl } = fake();
    const app = createTtsLabApp({ readBody: readLimitedText, fetchImpl });
    const cross = await app.request(
      "http://localhost/api/dev/tts",
      { method: "POST", body: JSON.stringify(GOOD), headers: { "Content-Type": "text/plain" } },
      env,
    );
    expect(cross.status).toBe(403);
    expect((await post(app, { ...GOOD, speed: 3 })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("app.ts からもつながっていて、切り替えが無ければ 404", async () => {
    const app = createApp();
    const res = await app.request(
      "http://localhost/api/dev/tts",
      { method: "POST", body: JSON.stringify(GOOD), headers: { "Content-Type": "application/json" } },
      { ELEVENLABS_API_KEY: KEY, ELEVENLABS_VOICE_ID: VOICE } as Env,
    );
    expect(res.status).toBe(404);
  });
});
