// /api/turn の受け口（ADR-0003）。画面のファイルは assets（dist/）から配り、/api/turn だけをここで受ける。
// 会話を保存しない。公開する版では本文をログに出さず、出すのは失敗の種類だけ（ADR-0007）。
// Workers の入口（index.ts）は default だけを出す（ほかの名前を出すと、Workers が起動しない）。

import { Hono } from "hono";
import { parseTurnRequest } from "../src/flow/turnContract";
import { MODEL, makeCallClaude, type CallClaude } from "./claude";
import { contentLogEnabled, logContent } from "./devlog";
import { runTurn } from "./turn";

export interface Env {
  /** Workers の secrets（手元では .dev.vars）。ブラウザには出さない */
  ANTHROPIC_API_KEY?: string;
  /** 開発中だけの本文のログ出力。wrangler.jsonc には書かない（ADR-0007 の追記） */
  DEV_CONTENT_LOG?: string;
}

/** 受け取る本文の大きさの上限（文字数）。回答12件×500字に、形の分の余裕を足したもの */
export const MAX_BODY_LENGTH = 12_000;

export function createApp(makeClaude: (apiKey: string) => CallClaude = makeCallClaude) {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/api/turn", async (c) => {
    const body = await c.req.text();
    // 大きすぎる入力や形の違う入力は、Claude を呼ばずに拒否する（ADR-0003、safety-test-plan P8）
    if (body.length > MAX_BODY_LENGTH) return c.json({ error: "too_large" }, 413);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return c.json({ error: "bad_request" }, 400);
    }
    const request = parseTurnRequest(json);
    if (request === null) return c.json({ error: "bad_request" }, 400);

    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (apiKey === undefined || apiKey === "") {
      console.warn("turn: no_api_key");
      return c.json({ error: "unavailable" }, 503);
    }

    const devLog = contentLogEnabled(c.env.DEV_CONTENT_LOG, c.req.url);
    const outcome = await runTurn(request, makeClaude(apiKey));
    if (!outcome.ok) {
      console.warn(`turn: ${outcome.failure}`);
      return c.json({ error: "unavailable" }, 502);
    }
    logContent(devLog, "claude output", outcome.raw);
    if (outcome.servedBy !== MODEL) console.warn(`turn: served_by ${outcome.servedBy}`);
    if (outcome.textRejected) console.warn("turn: text_rejected");
    return c.json(outcome.response);
  });

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));
  return app;
}

