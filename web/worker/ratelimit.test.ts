// 回数制限の確認（ADR-0035、safety-test-plan P7）の単体試験。本物の binding は使わず、偽の binding を渡す。

import { describe, expect, it, vi } from "vitest";
import { requestTurn } from "../src/flow/api";
import { checkRateLimit, clientKey, type RateLimiter } from "./ratelimit";

const limiter = (success: boolean) => ({ limit: vi.fn(async (_options: { key: string }) => ({ success })) });
const req = (headers: Record<string, string> = {}) => new Request("https://sonaquest.example/api/turn", { method: "POST", headers });

describe("checkRateLimit", () => {
  it("数えない設定（手元の開発）では、binding を呼ばずに通す", async () => {
    const turn = limiter(false);
    expect(await checkRateLimit(req(), { enforce: false, limiter: turn, prefix: "turn" })).toBe("allowed");
    expect(await checkRateLimit(req(), { enforce: false, limiter: undefined, prefix: "turn" })).toBe("allowed");
    expect(turn.limit).not.toHaveBeenCalled();
  });

  it("数える設定で binding が無ければ no_limiter（呼び出し口を閉じる）", async () => {
    expect(await checkRateLimit(req(), { enforce: true, limiter: undefined, prefix: "turn" })).toBe("no_limiter");
  });

  it("上限の内は allowed、超えたら limited", async () => {
    expect(await checkRateLimit(req({ "cf-connecting-ip": "198.51.100.7" }), { enforce: true, limiter: limiter(true), prefix: "turn" })).toBe("allowed");
    expect(await checkRateLimit(req({ "cf-connecting-ip": "198.51.100.7" }), { enforce: true, limiter: limiter(false), prefix: "turn" })).toBe("limited");
  });

  it("binding が投げたら error", async () => {
    const broken: RateLimiter = { limit: async () => { throw new Error("failed"); } };
    expect(await checkRateLimit(req(), { enforce: true, limiter: broken, prefix: "turn" })).toBe("error");
  });

  it("キーは「接頭辞:接続元」。接頭辞が違えば、数えるものが分かれる", async () => {
    const turn = limiter(true);
    const headers = { "cf-connecting-ip": "198.51.100.7" };
    await checkRateLimit(req(headers), { enforce: true, limiter: turn, prefix: "turn" });
    await checkRateLimit(req(headers), { enforce: true, limiter: turn, prefix: "tts" });
    expect(turn.limit.mock.calls.map(([o]) => o.key)).toEqual(["turn:198.51.100.7", "tts:198.51.100.7"]);
  });

  it("IPv6 は /64 にまとめ、長すぎるヘッダーはキーの長さの上限で切る", async () => {
    const turn = limiter(true);
    await checkRateLimit(req({ "cf-connecting-ip": "2001:db8::1" }), { enforce: true, limiter: turn, prefix: "turn" });
    await checkRateLimit(req({ "cf-connecting-ip": "a".repeat(500) }), { enforce: true, limiter: turn, prefix: "turn" });
    const keys = turn.limit.mock.calls.map(([o]) => o.key);
    expect(keys[0]).toBe("turn:2001:db8:0:0::/64");
    expect(keys[1]).toBe(`turn:${"a".repeat(64)}`);
  });

  it("ヘッダーが無い・空のときは、全員で共有するキーに倒す（数えるのをやめない）", async () => {
    const turn = limiter(true);
    await checkRateLimit(req(), { enforce: true, limiter: turn, prefix: "turn" });
    await checkRateLimit(req({ "cf-connecting-ip": "   " }), { enforce: true, limiter: turn, prefix: "turn" });
    expect(turn.limit.mock.calls.map(([o]) => o.key)).toEqual(["turn:unknown", "turn:unknown"]);
  });
});

describe("clientKey（回数制限のキーの接続元。Issue #284、IPv6 は /64）", () => {
  const same64 = "2001:db8:abcd:12::/64";
  it.each([
    ["IPv4 はそのまま", "198.51.100.7", "198.51.100.7"],
    ["IPv4 の前後の空白は除く", "  198.51.100.7 ", "198.51.100.7"],
    ["IPv6 の完全な形", "2001:0db8:abcd:0012:0000:0000:0000:0001", same64],
    ["IPv6 の省略した形", "2001:db8:abcd:12::1", same64],
    ["IPv6 の大文字の形", "2001:DB8:ABCD:12::FFFF", same64],
    ["同じ /64 の別のアドレス（後ろの64ビットを替えた）", "2001:db8:abcd:12:1:2:3:4", same64],
    ["先頭が省略された形", "::1", "0:0:0:0::/64"],
    ["末尾が省略された形", "fe80::", "fe80:0:0:0::/64"],
    ["IPv4 を埋め込んだ IPv6（::ffff:）は IPv4 として扱う", "::ffff:198.51.100.7", "198.51.100.7"],
    ["IPv4 を埋め込んだ IPv6 の完全な形", "0:0:0:0:0:ffff:198.51.100.7", "198.51.100.7"],
    ["16進で書いた ::ffff: の形も IPv4 として扱う", "::ffff:c633:6407", "198.51.100.7"],
    ["::ffff: 以外の IPv4 の埋め込みは IPv6 として /64 にまとめる", "64:ff9b::198.51.100.7", "64:ff9b:0:0::/64"],
    ["読めない文字列はそのまま", "not-an-ip", "not-an-ip"],
    ["区切りが多すぎる IPv6 は読めない文字列として扱う", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7:8:9"],
    [":: が2つある形は読めない文字列として扱う", "2001::db8::1", "2001::db8::1"],
    ["5桁の区切りは読めない文字列として扱う", "2001:db8:12345::1", "2001:db8:12345::1"],
    ["範囲の外の IPv4 は読めない文字列として扱う", "256.1.1.1", "256.1.1.1"],
    ["空は全員で共有するキー", "", "unknown"],
    ["空白だけも全員で共有するキー", "   ", "unknown"],
    ["ヘッダーなし（null）も全員で共有するキー", null, "unknown"],
  ])("%s", (_name, raw, expected) => {
    expect(clientKey(raw)).toBe(expected);
  });

  it("別の /64 は別のキーになる", () => {
    expect(clientKey("2001:db8:abcd:12::1")).not.toBe(clientKey("2001:db8:abcd:13::1"));
  });

  it("読めない長い文字列は、キーの長さの上限で切る", () => {
    expect(clientKey("x".repeat(500))).toBe("x".repeat(64));
  });
});

describe("画面は 429 を失敗として受け、固定の進行に切り替える（ADR-0012、ADR-0028 項目6）", () => {
  it("429 のとき requestTurn は null を返す", async () => {
    const tooMany = async () => new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { "Retry-After": "60" } });
    const request = { inputs: [], event: null, source: null, next_question_id: null, allow_clarify: false, allow_redirect: false };
    expect(await requestTurn(request, tooMany as unknown as typeof fetch)).toBeNull();
  });
});
