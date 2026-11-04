// /api/tts：読み上げの中継（ADR-0005、ADR-0033、Issue #53）。
// 画面から受け取った「読み上げる文」だけを ElevenLabs に送り、音声をそのまま返す。利用者の回答は受け取らない。
// キーと声の ID は Workers の secrets（手元では .dev.vars）にだけ置き、ブラウザに出さない。
// 公開する版では呼べない：手元（localhost・127.0.0.1）からの呼び出しだけを通す。公開用の切り替え・回数の制限・
// 支出の上限は D-01 の Issue で扱う。音声も文も保存しない。ログには失敗の種類だけを出し、本文を出さない（ADR-0007）。

import { Hono } from "hono";
import { contentLogEnabled } from "./devlog";

export interface TtsEnv {
  /** ElevenLabs の API キー（secrets）。ブラウザには出さない */
  ELEVENLABS_API_KEY?: string;
  /** 読み上げに使う声の ID（secrets）。リポジトリには書かない（ADR-0005） */
  ELEVENLABS_VOICE_ID?: string;
}

/** 低遅延で日本語を読めるモデル（ADR-0005 の表の Flash v2.5。2026-11-04 に現行と確かめた） */
export const TTS_MODEL = "eleven_flash_v2_5";
/** 声だけなので 64kbps で足りる（どのプランでも使える形式） */
export const TTS_OUTPUT_FORMAT = "mp3_44100_64";
/** 読み上げる文の長さの上限。聞き取り係の文（200字）に、受け止めと固定の確認の文を足しても収まる */
export const MAX_TTS_TEXT_LENGTH = 500;
/** 本文のバイト数の上限（日本語は1文字3バイト。形と、引用符などを逃がした分の余裕を足す） */
export const MAX_TTS_BODY_BYTES = MAX_TTS_TEXT_LENGTH * 3 + 512;
/** ElevenLabs を待つ上限。画面は5秒で始まらなければブラウザの読み上げに切り替える（speaker.ts） */
export const TTS_UPSTREAM_TIMEOUT_MS = 8_000;

const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/";
/** 声の ID の形。宛先の URL に入れるので、英数字だけを通す */
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{8,64}$/;

/** 手元からの呼び出しだけを通す。PUBLIC_TURN（/api/turn の公開の切り替え）では開かない */
export function ttsAllowed(requestUrl: string): boolean {
  return contentLogEnabled("1", requestUrl);
}

/** 受け取る形は { "text": "読み上げる文" } だけ。ほかの値は受け取らない */
export function parseTtsText(json: unknown): string | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const keys = Object.keys(json);
  if (keys.length !== 1 || keys[0] !== "text") return null;
  const text = (json as { text: unknown }).text;
  if (typeof text !== "string") return null;
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > MAX_TTS_TEXT_LENGTH) return null;
  return trimmed;
}

/** ElevenLabs に送る中身。読み上げる文と、モデル・言語だけ */
export function elevenLabsRequest(
  text: string,
  apiKey: string,
  voiceId: string,
): { url: string; init: RequestInit } {
  return {
    url: `${ELEVENLABS_TTS_URL}${voiceId}?output_format=${TTS_OUTPUT_FORMAT}`,
    init: {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: TTS_MODEL, language_code: "ja" }),
    },
  };
}

export type TtsFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface TtsDeps {
  /** 本文を上限のバイト数まで読む（app.ts の readLimitedText）。超えたら null */
  readBody: (request: Request, maxBytes: number) => Promise<string | null>;
  fetchImpl?: TtsFetch;
}

function fail(kind: string): void {
  console.warn(`tts: ${kind}`);
}

/** エラーの本文として読む上限（バイト）。ElevenLabs のエラーは小さな JSON */
const MAX_ERROR_BYTES = 2_048;
/** ログに出してよい符号の形。英小文字・数字・下線だけ（文や本文は出さない） */
const ERROR_CODE_PATTERN = /^[a-z0-9_]{1,64}$/;

/**
 * ElevenLabs のエラーの符号（`{"detail":{"status":"…"}}` の status）を `:<符号>` の形で返す。
 * 符号の形でないもの、JSON でないもの、大きすぎるものは使わず、空文字を返す。本文はほかに使わずに捨てる
 */
export async function upstreamErrorCode(upstream: Response): Promise<string> {
  const type = upstream.headers.get("content-type") ?? "";
  if (upstream.ok || upstream.body === null || !type.includes("json")) {
    await upstream.body?.cancel();
    return "";
  }
  try {
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > MAX_ERROR_BYTES) return "";
    const json = JSON.parse(new TextDecoder().decode(bytes)) as { detail?: { status?: unknown } };
    const status = json?.detail?.status;
    return typeof status === "string" && ERROR_CODE_PATTERN.test(status) ? `:${status}` : "";
  } catch {
    return "";
  }
}

export function createTtsApp(deps: TtsDeps) {
  const fetchImpl: TtsFetch = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const app = new Hono<{ Bindings: TtsEnv }>();

  app.post("/api/tts", async (c) => {
    if (!ttsAllowed(c.req.url)) {
      fail("public_disabled");
      return c.json({ error: "unavailable" }, 503);
    }
    const body = await deps.readBody(c.req.raw, MAX_TTS_BODY_BYTES);
    if (body === null) return c.json({ error: "too_large" }, 413);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const text = parseTtsText(json);
    if (text === null) return c.json({ error: "bad_request" }, 400);

    const apiKey = c.env.ELEVENLABS_API_KEY;
    const voiceId = c.env.ELEVENLABS_VOICE_ID;
    if (apiKey === undefined || apiKey === "") {
      fail("no_api_key");
      return c.json({ error: "unavailable" }, 503);
    }
    if (voiceId === undefined || !VOICE_ID_PATTERN.test(voiceId)) {
      fail("no_voice_id");
      return c.json({ error: "unavailable" }, 503);
    }

    const { url, init } = elevenLabsRequest(text, apiKey, voiceId);
    let upstream: Response;
    try {
      upstream = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TTS_UPSTREAM_TIMEOUT_MS) });
    } catch (error) {
      fail(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
      return c.json({ error: "unavailable" }, 502);
    }
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || upstream.body === null || !type.startsWith("audio/")) {
      // 事業者のエラーの種類（英小文字の符号）だけを出す。説明の文や本文は出さない
      fail(`upstream_${upstream.status}${await upstreamErrorCode(upstream)}`);
      return c.json({ error: "unavailable" }, 502);
    }
    // 音声はためずにそのまま流す。事業者の見出し（履歴の ID など）は渡さない。ブラウザにも残させない
    return new Response(upstream.body, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  });

  return app;
}
