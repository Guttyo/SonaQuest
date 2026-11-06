// ボードの書き込みの権限の確認（Issue #141、B-09、ADR-0050）。POST /api/board/authorize
// 受け取るのは、ログイン中の救護所・書き込み先の救護所・出来事の種類の3つだけ。違う救護所への書き込みは 403。
// カルテの中身・患者の氏名・担当者名は受け取らない（余計なキーがあれば 400）。何も保存しない。
// ログは結果の種類だけ（拒否・形の違い）で、値は出さない。
// 外部のサービスを呼ばず費用がかからないので、/api/turn の公開の切り替え（PUBLIC_TURN）と回数制限はかけない。
// デモ用の確認：画面が送る値をそのまま信じるので、偽装は簡単。本人確認・本番の権限の仕組みではない。

import { Hono } from "hono";
import { AUTHORIZE_MAX_BYTES, parseAuthorizeRequest, writeAllowed } from "../src/board/authorizeContract";

export function createBoardAuthorizeApp(deps: { readBody: (request: Request, maxBytes: number) => Promise<string | null> }) {
  const app = new Hono();
  app.post("/api/board/authorize", async (c) => {
    const body = await deps.readBody(c.req.raw, AUTHORIZE_MAX_BYTES);
    if (body === null) return c.json({ error: "too_large" }, 413);
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      console.warn("board_authorize: bad_request");
      return c.json({ error: "bad_request" }, 400);
    }
    const req = parseAuthorizeRequest(json);
    if (req === null) {
      console.warn("board_authorize: bad_request");
      return c.json({ error: "bad_request" }, 400);
    }
    if (!writeAllowed(req)) {
      console.warn("board_authorize: denied");
      return c.json({ allowed: false, error: "forbidden" }, 403);
    }
    return c.json({ allowed: true });
  });
  return app;
}
