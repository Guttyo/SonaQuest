// Claude API の呼び出し（docs/phase2-decisions.md 項目1・2・9。Issue #15 のコメントのオーナーの決定）。
// 構造化出力で形を決め、Workers で値を検査してから使う（ADR-0015）。待つのは8秒まで、SDK の自動の再試行はしない。
// 断られたときは、サーバー側で別のモデルが答え直す設定（fallbacks: "default"）を使う。それでも断られたら固定の進行へ。

import Anthropic from "@anthropic-ai/sdk";
import { QUESTION_IDS, VIEWPOINT_IDS } from "../src/flow/turnContract";

export const MODEL = "claude-opus-5-5";
/** 断られたときに別のモデルで答え直す設定の beta（"default" の形で使う） */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
export const CLAUDE_TIMEOUT_MS = 8000;

const JUDGMENT = { type: "string", enum: ["confirmed", "aware_unconfirmed", "not_mentioned"] };

/**
 * Claude に返させる形。next_goal_id は、閉じた一覧（固定の質問のID）から Claude が選ぶ次のゴール。null は「この半分を終える」。
 * 今選んでよいかは Workers が planGoals で確かめ、合わなければ固定の順番の質問に戻す（Issue #200、ADR-0025 の B）。
 * closing_remark は後半を終えるときだけの振り返りの一言（それ以外は null）
 */
export const CLAUDE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    emergency: { type: "string", enum: ["none", "symptom", "self_harm"] },
    viewpoints: {
      type: "object",
      properties: Object.fromEntries(VIEWPOINT_IDS.map((v) => [v, JUDGMENT])),
      required: [...VIEWPOINT_IDS],
      additionalProperties: false,
    },
    next_type: { type: "string", enum: ["ask", "clarify", "redirect"] },
    next_goal_id: { anyOf: [{ type: "string", enum: [...QUESTION_IDS] }, { type: "null" }] },
    text: { anyOf: [{ type: "string" }, { type: "null" }] },
    closing_remark: { anyOf: [{ type: "string" }, { type: "null" }] },
    recall: { type: "boolean" },
    source_guess: {
      anyOf: [
        { type: "string", enum: ["smartphone", "online", "notebook", "family", "clinic"] },
        { type: "null" },
      ],
    },
  },
  required: [
    "emergency",
    "viewpoints",
    "next_type",
    "next_goal_id",
    "text",
    "closing_remark",
    "recall",
    "source_guess",
  ],
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

/** 使ったトークン数（料金の見積もりに使う。本文ではないのでログに出してよい） */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** servedBy は答えたモデル。断られて別のモデルが答え直したときは、頼んだモデルと違う（本文ではないのでログに出してよい） */
export type ClaudeResult =
  | { ok: true; value: unknown; raw: string; servedBy: string; usage: Usage }
  | { ok: false; failure: ClaudeFailure };

export type CallClaude = (system: string, user: string) => Promise<ClaudeResult>;

export type Effort = "low" | "medium" | "high";

/** 呼び出しの設定。ふだんは MODEL と effort low。開発中の比較実験だけで替える（devlog.ts の devOverrides） */
export interface ClaudeOptions {
  model?: string;
  effort?: Effort;
}

/**
 * 断られたときに別のモデルで答え直す設定を使えるか。Haiku に替えたときは使わず、
 * 断られたら固定の進行へ（docs/phase2-decisions.md 項目9 の訂正の行）
 */
export function usesFallback(model: string): boolean {
  return !model.startsWith("claude-haiku");
}

export function makeCallClaude(apiKey: string, options: ClaudeOptions = {}): CallClaude {
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: CLAUDE_TIMEOUT_MS });
  const model = options.model ?? MODEL;
  const effort = options.effort ?? "low";
  const fallback = usesFallback(model)
    ? { betas: [FALLBACK_BETA], fallbacks: "default" as const }
    : {};
  return async (system, user) => {
    try {
      const response = await client.beta.messages.create({
        model,
        ...fallback,
        max_tokens: 4096,
        // 毎回同じシステムプロンプトなので、キャッシュに置く
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        output_config: {
          effort,
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
        const u = response.usage;
        const usage: Usage = {
          input: u.input_tokens,
          output: u.output_tokens,
          cacheRead: u.cache_read_input_tokens ?? 0,
          cacheWrite: u.cache_creation_input_tokens ?? 0,
        };
        return { ok: true, value: JSON.parse(raw), raw, servedBy: response.model, usage };
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
