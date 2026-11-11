// /api/dev/tts：読み上げの聞き比べ（開発用）。モデル・速さ・抑揚・日本語の読みの補正・声を替えて、ElevenLabs の声を聞き比べる。
// 比較実験の切り替え（DEV_EXPERIMENT=1）が入っていて、宛先が手元のときだけ使える（devlog.ts の devOverrides。/api/dev/audit と同じ）。
// 公開する版では宛先の条件で必ず 404 になる。今の読み上げ（/api/tts）の設定は変えない。
// 音声も文も保存しない。ログには失敗の種類だけを出し、本文を出さない（ADR-0007）。

import { Hono } from "hono";
import { devOverrides } from "./devlog";
import { crossSiteRequest } from "./guard";
import {
  MAX_TTS_BODY_BYTES,
  MAX_TTS_TEXT_LENGTH,
  TTS_OUTPUT_FORMAT,
  TTS_UPSTREAM_TIMEOUT_MS,
  upstreamErrorCode,
  type TtsDeps,
  type TtsEnv,
  type TtsFetch,
} from "./tts";

export interface TtsLabEnv extends TtsEnv {
  DEV_EXPERIMENT?: string;
  /** 比べる声の ID（手元だけ。`--var DEV_TTS_VOICE_B:…` か .dev.vars で指定）。無ければ「比べる声」は選べない */
  DEV_TTS_VOICE_B?: string;
}

/** 聞き比べで選べるモデル（ElevenLabs の文書で日本語に対応と確かめたもの。2026-11-05） */
export const LAB_MODELS = [
  "eleven_flash_v2_5",
  "eleven_multilingual_v2",
  "eleven_v3",
  "eleven_v4",
  "eleven_v4_turbo",
] as const;
export type LabModel = (typeof LAB_MODELS)[number];

/** language_code を受け付けないモデル（文書：Multilingual v2 は拒む） */
const NO_LANGUAGE_CODE: ReadonlySet<LabModel> = new Set(["eleven_multilingual_v2"]);

/** 速さの範囲。文書に上下限が無いので、控えめな範囲に絞る */
export const SPEED_RANGE = { min: 0.7, max: 1.2 } as const;

export interface LabRequest {
  text: string;
  model: LabModel;
  speed: number;
  stability: number;
  style: number;
  /** 日本語の読みの補正（apply_language_text_normalization）。文書：待ち時間が大きく増えうる */
  normalize: boolean;
  /** main：今の声（ELEVENLABS_VOICE_ID）、b：比べる声（DEV_TTS_VOICE_B） */
  voice: "main" | "b";
}

const KEYS = ["text", "model", "speed", "stability", "style", "normalize", "voice"];
const VOICE_ID_PATTERN = /^[A-Za-z0-9]{8,64}$/;

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** 受け取る形をすべて確かめる。決まったキー以外があるもの、範囲外の値は拒む（null） */
export function parseLabRequest(json: unknown): LabRequest | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== KEYS.length || !keys.every((k) => KEYS.includes(k))) return null;
  if (typeof o.text !== "string") return null;
  const text = o.text.trim();
  if (text === "" || text.length > MAX_TTS_TEXT_LENGTH) return null;
  if (typeof o.model !== "string" || !(LAB_MODELS as readonly string[]).includes(o.model)) return null;
  if (!inRange(o.speed, SPEED_RANGE.min, SPEED_RANGE.max)) return null;
  if (!inRange(o.stability, 0, 1) || !inRange(o.style, 0, 1)) return null;
  if (typeof o.normalize !== "boolean") return null;
  if (o.voice !== "main" && o.voice !== "b") return null;
  return {
    text,
    model: o.model as LabModel,
    speed: o.speed,
    stability: o.stability,
    style: o.style,
    normalize: o.normalize,
    voice: o.voice,
  };
}

/** ElevenLabs に送る本文。similarity_boost と use_speaker_boost は文書の初期値のまま */
export function labRequestBody(request: LabRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    text: request.text,
    model_id: request.model,
    voice_settings: {
      stability: request.stability,
      similarity_boost: 0.75,
      style: request.style,
      use_speaker_boost: true,
      speed: request.speed,
    },
  };
  if (!NO_LANGUAGE_CODE.has(request.model)) body.language_code = "ja";
  if (request.normalize) body.apply_language_text_normalization = true;
  return body;
}

function fail(kind: string): void {
  console.warn(`tts_lab: ${kind}`);
}

export function createTtsLabApp(deps: TtsDeps) {
  const fetchImpl: TtsFetch = deps.fetchImpl ?? ((url, init) => fetch(url, init));
  const app = new Hono<{ Bindings: TtsLabEnv }>();

  /** どの声が選べるか（声の ID そのものは返さない） */
  app.get("/api/dev/tts", (c) => {
    if (devOverrides(c.env, c.req.url) === null) return c.json({ error: "not_found" }, 404);
    const b = c.env.DEV_TTS_VOICE_B;
    return c.json({ models: LAB_MODELS, speed: SPEED_RANGE, voiceB: b !== undefined && VOICE_ID_PATTERN.test(b) });
  });

  app.post("/api/dev/tts", async (c) => {
    if (devOverrides(c.env, c.req.url) === null) return c.json({ error: "not_found" }, 404);
    if (crossSiteRequest(c.req.raw)) return c.json({ error: "forbidden" }, 403);
    const raw = await deps.readBody(c.req.raw, MAX_TTS_BODY_BYTES);
    if (raw === null) return c.json({ error: "too_large" }, 413);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const request = parseLabRequest(json);
    if (request === null) return c.json({ error: "bad_request" }, 400);

    const apiKey = c.env.ELEVENLABS_API_KEY;
    const voiceId = request.voice === "b" ? c.env.DEV_TTS_VOICE_B : c.env.ELEVENLABS_VOICE_ID;
    if (apiKey === undefined || apiKey === "" || voiceId === undefined || !VOICE_ID_PATTERN.test(voiceId)) {
      fail("unavailable");
      return c.json({ error: "unavailable" }, 503);
    }

    const started = Date.now();
    let upstream: Response;
    try {
      upstream = await fetchImpl(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${TTS_OUTPUT_FORMAT}`,
        {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify(labRequestBody(request)),
          // 読みの補正は遅くなりうるので、待つ上限を倍にする
          signal: AbortSignal.timeout(TTS_UPSTREAM_TIMEOUT_MS * 2),
        },
      );
    } catch (error) {
      fail(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
      return c.json({ error: "unavailable" }, 502);
    }
    const type = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || upstream.body === null || !type.startsWith("audio/")) {
      const code = await upstreamErrorCode(upstream);
      fail(`upstream_${upstream.status}${code}`);
      // 開発用なので、事業者の符号（英小文字だけ）を画面に返して、どの設定が通らないかを分かるようにする
      return c.json({ error: "upstream", status: upstream.status, code: code.slice(1) }, 502);
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        // ElevenLabs が最初に応答を返すまでの時間（ミリ秒）
        "x-dev-upstream-ms": String(Date.now() - started),
      },
    });
  });

  return app;
}
