// Claude API の呼び出し（docs/phase2-decisions.md 項目1・2・9）。
// 構造化出力で形を決め、Workers で値を検査してから使う（ADR-0015）。待つのは8秒まで、自動の再試行はしない。
// 断られた（refusal）ときも別のモデルで答え直さず、固定の進行に切り替える（項目9。fallbacks は使わない）。

import Anthropic from "@anthropic-ai/sdk";
import { VIEWPOINT_IDS } from "../src/flow/turnContract";

export const MODEL = "claude-opus-5-5";
export const CLAUDE_TIMEOUT_MS = 8000;

const JUDGMENT = { type: "string", enum: ["confirmed", "aware_unconfirmed", "not_mentioned"] };

/** Claude に返させる形。question_id は Claude に選ばせず、Workers が固定の順番から決める（ADR-0025 の A） */
export const CLAUDE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    emergency: { type: "boolean" },
    viewpoints: {
      type: "object",
      properties: Object.fromEntries(VIEWPOINT_IDS.map((v) => [v, JUDGMENT])),
      required: [...VIEWPOINT_IDS],
      additionalProperties: false,
    },
    next_type: { type: "string", enum: ["ask", "clarify", "redirect"] },
    text: { anyOf: [{ type: "string" }, { type: "null" }] },
    recall: { type: "boolean" },
    source_guess: {
      anyOf: [
        { type: "string", enum: ["smartphone", "online", "notebook", "family", "clinic"] },
        { type: "null" },
      ],
    },
  },
  required: ["emergency", "viewpoints", "next_type", "text", "recall", "source_guess"],
  additionalProperties: false,
} as const;

/** 失敗の種類。本文を含まないので、ログに出してよい（ADR-0007） */
export type ClaudeFailure =
  | "timeout"
  | "rate_limited"
  | "api_error"
  | "connection"
  | "refusal"
  | "incomplete"
  | "not_json"
  | "unknown";

export type ClaudeResult = { ok: true; value: unknown; raw: string } | { ok: false; failure: ClaudeFailure };

export type CallClaude = (system: string, user: string) => Promise<ClaudeResult>;

export function makeCallClaude(apiKey: string): CallClaude {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: CLAUDE_TIMEOUT_MS });
  return async (system, user) => {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        // 毎回同じシステムプロンプトなので、キャッシュに置く
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: CLAUDE_OUTPUT_SCHEMA },
        },
        messages: [{ role: "user", content: user }],
      });
      // 内容を読む前に、止まった理由を確かめる
      if (response.stop_reason === "refusal") return { ok: false, failure: "refusal" };
      if (response.stop_reason !== "end_turn") return { ok: false, failure: "incomplete" };
      const raw = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      try {
        return { ok: true, value: JSON.parse(raw), raw };
      } catch {
        return { ok: false, failure: "not_json" };
      }
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, failure: "timeout" };
      if (error instanceof Anthropic.APIConnectionError) return { ok: false, failure: "connection" };
      if (error instanceof Anthropic.RateLimitError) return { ok: false, failure: "rate_limited" };
      if (error instanceof Anthropic.APIError) return { ok: false, failure: "api_error" };
      return { ok: false, failure: "unknown" };
    }
  };
}
