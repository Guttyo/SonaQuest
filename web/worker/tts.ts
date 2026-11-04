// /api/tts：読み上げの中継（ADR-0005、ADR-0033、Issue #53）。
// 画面から受け取った「読み上げる文」だけを ElevenLabs に送り、音声をそのまま返す。利用者の回答は受け取らない。
// キーと声の ID は Workers の secrets（手元では .dev.vars）にだけ置き、ブラウザに出さない。
// 通すのは /api/turn と同じ条件：手元（localhost・127.0.0.1）からの呼び出しか、公開の切り替え（PUBLIC_TURN=1）のとき
// （2026-11-04 オーナー決定、ADR-0033）。公開の切り替えのときは、ElevenLabs を呼ぶ直前に回数制限（ADR-0035）を1回数える。
// 別のサイトのページからの呼び出しは拒む（JSON の形の宣言と Sec-Fetch-Site）。
// 音声も文も保存しない。ログには失敗の種類だけを出し、本文を出さない（ADR-0007）。

import { Hono } from "hono";
import { contentLogEnabled } from "./devlog";
import { checkRateLimit, type RateLimiter } from "./ratelimit";

export interface TtsEnv {
  /** ElevenLabs の API キー（secrets）。ブラウザには出さない */
  ELEVENLABS_API_KEY?: string;
  /** 読み上げに使う声の ID（secrets）。リポジトリには書かない（ADR-0005） */
  ELEVENLABS_VOICE_ID?: string;
  /** 公開の切り替え。/api/turn と同じ1つで、Claude と読み上げをまとめて開く（ADR-0028 の12、ADR-0033） */
  PUBLIC_TURN?: string;
  /** 回数制限の binding（ADR-0035）。読み上げは接頭辞 "tts" で数える */
  TURN_LIMITER?: RateLimiter;
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

/** /api/turn（app.ts の turnAllowed）と同じ条件：手元からの呼び出しか、公開の切り替えが入っているとき */
export function ttsAllowed(env: Pick<TtsEnv, "PUBLIC_TURN">, requestUrl: string): boolean {
  return env.PUBLIC_TURN === "1" || contentLogEnabled("1", requestUrl);
}

/**
 * 別のサイトのページからの呼び出しか。画面は同じサイトから `Content-Type: application/json` で送る。
 * JSON の形を宣言しない呼び出し（別のサイトから事前の確認なしで送れる形）と、ブラウザが `Sec-Fetch-Site: cross-site`
 * を付けた呼び出しを拒む。手元の `wrangler dev` を開いている間に、ほかのページから課金の呼び出しをされないため
 */
export function crossSiteRequest(request: Request): boolean {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) return true;
  return request.headers.get("sec-fetch-site") === "cross-site";
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
    if (!ttsAllowed(c.env, c.req.url)) {
      fail("public_disabled");
      return c.json({ error: "unavailable" }, 503);
    }
    if (crossSiteRequest(c.req.raw)) {
      fail("cross_site");
      return c.json({ error: "forbidden" }, 403);
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

    // 公開の切り替えのときだけ、ElevenLabs を呼ぶ直前に1回数える（ADR-0035。/api/turn と同じ binding、接頭辞は "tts"）
    const rate = await checkRateLimit(c.req.raw, {
      enforce: c.env.PUBLIC_TURN === "1",
      limiter: c.env.TURN_LIMITER,
      prefix: "tts",
    });
    if (rate === "limited") {
      fail("rate_limited");
      c.header("retry-after", "60");
      return c.json({ error: "rate_limited" }, 429);
    }
    if (rate !== "allowed") {
      fail(`rate_limiter_${rate}`);
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
