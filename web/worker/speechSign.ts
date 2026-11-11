// 読み上げの中継（/api/tts）が読む Claude の文の署名（Issue #284 の指摘3、案A。ADR-0033 の追記）。
// /api/turn が返す Claude の文（次の質問・受け止めの文、振り返りの一言）に、Worker の秘密の値（TTS_SIGNING_KEY）で作った
// HMAC-SHA-256 と期限を付ける。/api/tts は、署名が合い期限の内の文だけを読み上げる文に入れる。
// Workers に組み込みの Web Crypto（crypto.subtle）だけを使い、依存は足さない。
// 秘密の値はブラウザに出さない。署名する文も、署名も、ログに出さない（ADR-0007）。

/** 署名の形（`期限の秒.署名`）。署名は 32 バイトを base64url（詰め物なし）にした 43 文字 */
export const SPEECH_TOKEN_PATTERN = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

/**
 * 署名の期限（ミリ秒）。Claude Code の下書き：60 分。
 * 訓練の最初から振り返りまで（目安 5〜10 分、時間で打ち切らない）と、振り返りの「もう一度聞く」に足りる長さにした。
 * 期限が切れると、その回の残りはブラウザの読み上げになる（speaker.ts。切り替えは回の終わりまで続く）ので、短すぎないようにした
 */
export const SPEECH_TOKEN_TTL_MS = 60 * 60 * 1000;

/** 秘密の値の短さの下限（文字数）。Claude Code の下書き。これより短い値は無いものとして扱う（推測されやすいため） */
export const MIN_SIGNING_KEY_LENGTH = 32;

/** 署名する中身の先頭に付ける目印。ほかの用途の HMAC と取り違えないため */
const SIGN_CONTEXT = "sonaquest-tts-v1";

export type SpeechTokenCheck = "ok" | "bad" | "expired";

/** 使える秘密の値か（無い・短いときは使わない） */
export function usableSigningKey(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SIGNING_KEY_LENGTH;
}

function message(expSeconds: number, text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${SIGN_CONTEXT}\n${expSeconds}\n${text}`);
}

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** 文に署名する。返すのは `期限の秒.署名`（期限は nowMs から SPEECH_TOKEN_TTL_MS 後） */
export async function signSpeechText(secret: string, text: string, nowMs: number = Date.now()): Promise<string> {
  const exp = Math.floor((nowMs + SPEECH_TOKEN_TTL_MS) / 1000);
  const key = await hmacKey(secret, "sign");
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, message(exp, text)));
  return `${exp}.${toBase64Url(sig)}`;
}

/**
 * 署名を確かめる。形が違う・合わないときは bad、期限を過ぎたときは expired。
 * 比べるのは crypto.subtle.verify（文字列の比較にしない）。期限は Worker の時計だけで判断する
 */
export async function verifySpeechToken(
  secret: string,
  text: string,
  token: string,
  nowMs: number = Date.now(),
): Promise<SpeechTokenCheck> {
  const m = SPEECH_TOKEN_PATTERN.exec(token);
  if (m === null) return "bad";
  const exp = Number(m[1]);
  const sig = fromBase64Url(m[2]);
  if (sig === null || sig.byteLength !== 32) return "bad";
  const key = await hmacKey(secret, "verify");
  const valid = await crypto.subtle.verify("HMAC", key, sig, message(exp, text));
  if (!valid) return "bad";
  // 署名が合ってから期限を見る（期限の値も署名の中身なので、書き換えられない）
  return exp * 1000 < nowMs ? "expired" : "ok";
}
