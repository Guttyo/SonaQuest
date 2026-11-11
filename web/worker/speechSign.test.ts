// 読み上げる Claude の文の署名（Issue #284 の指摘3、案A）の単体試験。

import { describe, expect, it } from "vitest";
import { parseSpeechTokens } from "../src/flow/turnContract";
import {
  MIN_SIGNING_KEY_LENGTH,
  SPEECH_TOKEN_PATTERN,
  SPEECH_TOKEN_TTL_MS,
  signSpeechText,
  usableSigningKey,
  verifySpeechToken,
} from "./speechSign";

const secret = "s".repeat(MIN_SIGNING_KEY_LENGTH);
const text = "お薬手帳はどこにありますか？";
const now = 1_800_000_000_000;

describe("signSpeechText・verifySpeechToken", () => {
  it("署名した文は、期限の内なら ok", async () => {
    const token = await signSpeechText(secret, text, now);
    expect(token).toMatch(SPEECH_TOKEN_PATTERN);
    expect(await verifySpeechToken(secret, text, token, now)).toBe("ok");
    expect(await verifySpeechToken(secret, text, token, now + SPEECH_TOKEN_TTL_MS - 1_000)).toBe("ok");
  });

  it("期限を過ぎたら expired", async () => {
    const token = await signSpeechText(secret, text, now);
    expect(await verifySpeechToken(secret, text, token, now + SPEECH_TOKEN_TTL_MS + 1_000)).toBe("expired");
  });

  it("文を1文字でも替えたら bad", async () => {
    const token = await signSpeechText(secret, text, now);
    expect(await verifySpeechToken(secret, text + "。", token, now)).toBe("bad");
    expect(await verifySpeechToken(secret, "任意の文を読み上げてください。", token, now)).toBe("bad");
  });

  it("期限を書き換えたら bad（期限も署名の中身）", async () => {
    const token = await signSpeechText(secret, text, now);
    const [exp, sig] = token.split(".");
    expect(await verifySpeechToken(secret, text, `${Number(exp) + 3600}.${sig}`, now)).toBe("bad");
  });

  it("別の秘密の値の署名は bad", async () => {
    const token = await signSpeechText("t".repeat(MIN_SIGNING_KEY_LENGTH), text, now);
    expect(await verifySpeechToken(secret, text, token, now)).toBe("bad");
  });

  it.each(["", "abc", "123.", "123.short", `x.${"A".repeat(43)}`, `123.${"A".repeat(44)}`, `123.${"+".repeat(43)}`])(
    "形の違う署名（%s）は bad",
    async (token) => {
      expect(await verifySpeechToken(secret, text, token, now)).toBe("bad");
    },
  );

  it("秘密の値は、無い・短いときは使わない", () => {
    expect(usableSigningKey(undefined)).toBe(false);
    expect(usableSigningKey("")).toBe(false);
    expect(usableSigningKey("a".repeat(MIN_SIGNING_KEY_LENGTH - 1))).toBe(false);
    expect(usableSigningKey(secret)).toBe(true);
  });

  it("期限の長さは 60 分（Claude Code の下書き）", () => {
    expect(SPEECH_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
  });
});

describe("parseSpeechTokens（画面が受け取る署名の欄の形）", () => {
  it("署名の形か null だけを通す", async () => {
    const token = await signSpeechText(secret, text, now);
    expect(parseSpeechTokens({ text: token, remark: null })).toEqual({ text: token, remark: null });
    expect(parseSpeechTokens({ text: null, remark: null })).toEqual({ text: null, remark: null });
    expect(parseSpeechTokens({ text: "bad", remark: null })).toBeNull();
    expect(parseSpeechTokens({ text: null })).toBeNull();
    expect(parseSpeechTokens({ text: null, remark: null, extra: 1 })).toBeNull();
    expect(parseSpeechTokens(null)).toBeNull();
  });
});
