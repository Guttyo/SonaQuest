// /api/turn の受け口（ADR-0003）。画面のファイルは assets（dist/）から配り、/api/turn だけをここで受ける。
// 会話を保存しない。公開する版では本文をログに出さず、出すのは失敗の種類だけ（ADR-0007）。
// Workers の入口（index.ts）は default だけを出す（ほかの名前を出すと、Workers が起動しない）。

import { Hono } from "hono";
import { parseTurnRequest } from "../src/flow/turnContract";
import { MODEL, makeCallClaude, type CallClaude, type ClaudeOptions } from "./claude";
import { AUDIT_MODEL, makeAudit } from "./audit";
import { contentLogEnabled, devOverrides, logContent } from "./devlog";
import { promptTextProblem } from "./checks";
import { ALLOWED_VOCABULARY, followsFixedOrder, runTurn } from "./turn";

export interface Env {
  /** Workers の secrets（手元では .dev.vars）。ブラウザには出さない */
  ANTHROPIC_API_KEY?: string;
  /** 開発中だけの本文のログ出力。wrangler.jsonc には書かない（ADR-0007 の追記） */
  DEV_CONTENT_LOG?: string;
  /** 開発中の比較実験だけで使う切り替え（devlog.ts の devOverrides）。wrangler.jsonc には書かない */
  DEV_EXPERIMENT?: string;
  DEV_MODEL?: string;
  DEV_EFFORT?: string;
  /**
   * 公開する版で /api/turn を使えるようにする切り替え。"1" のときだけ、手元以外の宛先からも Claude を呼ぶ。
   * 回数の制限と支出の上限（ADR-0003、safety-test-plan P7・P9）を満たすまで設定しない。
   * 設定しないままデプロイしても、Claude を呼ばずに失敗を返す（画面は固定の進行で最後まで進む）
   */
  PUBLIC_TURN?: string;
}

/** 比較実験で測った値を載せる応答の見出し（開発中の比較実験のときだけ付ける） */
export const DEV_METRICS_HEADER = "x-dev-metrics";

/**
 * 受け取る本文の大きさの上限（文字数）。回答10件×500字と画面に出した文10件×200字（計7,000字）に、
 * 形（キーや引用符）と、引用符などを逃がした分の余裕を足したもの。6件のときの 12,000字と同じ割合（約2.9倍）にした
 */
export const MAX_BODY_LENGTH = 20_000;
/** 本文を読み込む前に確かめるバイト数の上限（UTF-8 の日本語は1文字3バイト） */
export const MAX_BODY_BYTES = MAX_BODY_LENGTH * 3;

/** 手元（localhost・127.0.0.1）からの呼び出しか、公開の切り替えが入っているときだけ Claude を呼ぶ */
export function turnAllowed(env: Env, requestUrl: string): boolean {
  return env.PUBLIC_TURN === "1" || contentLogEnabled("1", requestUrl);
}

/**
 * 本文を上限のバイト数まで読む。Content-Length が上限を超えるとき、または読んでいる途中で超えたときは null。
 * 大きな本文を丸ごと読み込んでから拒否しないため
 */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export function createApp(
  makeClaude: (apiKey: string, options?: ClaudeOptions) => CallClaude = makeCallClaude,
) {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/api/turn", async (c) => {
    if (!turnAllowed(c.env, c.req.url)) {
      console.warn("turn: public_disabled");
      return c.json({ error: "unavailable" }, 503);
    }
    const body = await readLimitedText(c.req.raw, MAX_BODY_BYTES);
    // 大きすぎる入力や形の違う入力は、Claude を呼ばずに拒否する（ADR-0003、safety-test-plan P8）
    if (body === null || body.length > MAX_BODY_LENGTH) return c.json({ error: "too_large" }, 413);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const request = parseTurnRequest(json);
    // 次の質問は、画面が送ってきた値を信じずに、固定の順番から確かめる（ADR-0025 の A、ADR-0028）
    if (request === null || !followsFixedOrder(request)) return c.json({ error: "bad_request" }, 400);

    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (apiKey === undefined || apiKey === "") {
      console.warn("turn: no_api_key");
      return c.json({ error: "unavailable" }, 503);
    }

    const devLog = contentLogEnabled(c.env.DEV_CONTENT_LOG, c.req.url);
    const experiment = devOverrides(c.env, c.req.url);
    const model = experiment?.model ?? MODEL;
    const started = Date.now();
    const outcome = await runTurn(request, makeClaude(apiKey, experiment ?? {}));
    const ms = Date.now() - started;
    if (!outcome.ok) {
      console.warn(`turn: ${outcome.failure}`);
      if (experiment !== null) {
        c.header(DEV_METRICS_HEADER, encodeURIComponent(JSON.stringify({ model, ms, failure: outcome.failure })));
      }
      return c.json({ error: "unavailable" }, 502);
    }
    logContent(devLog, "claude output", outcome.raw);
    if (outcome.servedBy !== model) console.warn(`turn: served_by ${outcome.servedBy}`);
    if (experiment !== null) {
      const metrics = {
        model,
        servedBy: outcome.servedBy,
        ms,
        usage: outcome.usage,
        claudeText: outcome.claudeText,
        textRejected: outcome.textRejected,
        rejectReason: outcome.rejectReason,
      };
      c.header(DEV_METRICS_HEADER, encodeURIComponent(JSON.stringify(metrics)));
    }
    if (outcome.rejectReason !== null) console.warn(`turn: text_rejected:${outcome.rejectReason}`);
    return c.json(outcome.response);
  });

  // 監査役の比較実験だけで使う採点の入口（ADR-0030 の実験。docs/evidence.md）。
  // 比較実験の切り替え（devOverrides）が有効なとき、つまり手元で DEV_EXPERIMENT を指定したときだけ使える
  app.post("/api/dev/audit", async (c) => {
    const experiment = devOverrides(c.env, c.req.url);
    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (experiment === null || apiKey === undefined || apiKey === "") {
      return c.json({ error: "not_found" }, 404);
    }
    const body = (await c.req.json().catch(() => null)) as {
      text?: unknown;
      fixed_question?: unknown;
    } | null;
    if (typeof body?.text !== "string" || typeof body.fixed_question !== "string") {
      return c.json({ error: "bad_request" }, 400);
    }
    // 比べるため、正規表現の検査（checks.ts）の結果も返す
    const regex = promptTextProblem(body.text, {
      userTexts: [],
      allowed: [body.fixed_question, ...ALLOWED_VOCABULARY],
    });
    const started = Date.now();
    const result = await makeAudit(apiKey, experiment.model ?? AUDIT_MODEL)(body.text, body.fixed_question);
    return c.json({ ...result, regex, ms: Date.now() - started });
  });

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));
  return app;
}

