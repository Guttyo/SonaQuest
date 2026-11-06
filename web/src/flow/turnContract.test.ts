// /api/turn のやり取りの形の検査と、ブラウザからの呼び出し（ADR-0012、ADR-0015）

import { describe, expect, it } from "vitest";
import { requestTurn } from "./api";
import {
  MAX_TURN_INPUTS,
  parseTurnRequest,
  parseTurnResponse,
  type TurnRequest,
  type TurnResponse,
} from "./turnContract";

const request: TurnRequest = {
  inputs: [
    { question_id: "first_medicines", half: "first", asked: "普段飲んでいる薬はありますか？", text: "A薬を朝に1錠" },
  ],
  event: null,
  source: null,
  next_question_id: "first_location",
  allow_clarify: true,
  allow_redirect: true,
};

const response: TurnResponse = {
  emergency: "none",
  viewpoints: {
    location: "confirmed",
    alternative: "not_mentioned",
    current: "aware_unconfirmed",
    unrecorded: "not_mentioned",
    proxy: "not_mentioned",
  },
  next: { type: "ask", question_id: "first_location", text: null },
  recall: false,
  source_guess: "notebook",
  remark: null,
};

describe("入力の検査（Workers）", () => {
  it("決めた形の入力は通す", () => {
    expect(parseTurnRequest(request)).toEqual(request);
  });

  it("回答は最大10件まで通す（ADR-0019、Issue #41）", () => {
    expect(MAX_TURN_INPUTS).toBe(10);
    const ten = { ...request, inputs: Array(10).fill(request.inputs[0]) };
    expect(parseTurnRequest(ten)).toEqual(ten);
  });

  it.each<[string, unknown]>([
    ["空の入力", { ...request, inputs: [] }],
    ["空白だけの回答", { ...request, inputs: [{ ...request.inputs[0], text: "  " }] }],
    ["知らない質問ID", { ...request, inputs: [{ ...request.inputs[0], question_id: "x" }] }],
    ["知らない出来事", { ...request, event: "earthquake" }],
    ["画面に出した文が空", { ...request, inputs: [{ ...request.inputs[0], asked: "" }] }],
    ["画面に出した文が長すぎる", { ...request, inputs: [{ ...request.inputs[0], asked: "あ".repeat(201) }] }],
    ["回答が11件", { ...request, inputs: Array(MAX_TURN_INPUTS + 1).fill(request.inputs[0]) }],
    ["真偽値でない", { ...request, allow_clarify: "yes" }],
    ["余分なキー", { ...request, answers: [] }],
  ])("%s は拒否する", (_label, value) => {
    expect(parseTurnRequest(value)).toBeNull();
  });
});

describe("応答の検査（ブラウザ）", () => {
  it("決めた形の応答は通す", () => {
    expect(parseTurnResponse(response)).toEqual(response);
  });

  it.each<[string, unknown]>([
    ["finish なのに質問IDがある", { ...response, next: { type: "finish", question_id: "first_location", text: null } }],
    ["ask なのに質問IDが無い", { ...response, next: { type: "ask", question_id: null, text: null } }],
    ["長すぎる文", { ...response, next: { ...response.next, text: "あ".repeat(201) } }],
    ["係の交代を候補にする", { ...response, source_guess: "none" }],
    ["許可外の判定", { ...response, viewpoints: { ...response.viewpoints, proxy: "maybe" } }],
    ["余分なキー", { ...response, advice: "x" }],
    ["緊急が真偽値", { ...response, emergency: true }],
  ])("%s は拒否する", (_label, value) => {
    expect(parseTurnResponse(value)).toBeNull();
  });
});

describe("ブラウザからの呼び出し", () => {
  const fetchReturning = (status: number, body: unknown): typeof fetch =>
    async () => new Response(JSON.stringify(body), { status });

  it("検査を通った応答を返す", async () => {
    expect(await requestTurn(request, fetchReturning(200, response))).toEqual(response);
  });

  it("失敗の応答・形の違う応答・通信の失敗は null（固定の進行へ）", async () => {
    expect(await requestTurn(request, fetchReturning(502, { error: "unavailable" }))).toBeNull();
    expect(await requestTurn(request, fetchReturning(200, { ...response, extra: 1 }))).toBeNull();
    expect(
      await requestTurn(request, async () => {
        throw new TypeError("network");
      }),
    ).toBeNull();
  });
});
