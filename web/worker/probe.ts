// 【一時的な調査用の口。Issue #65 が終わったら、このファイルごと消す。】
// 回数制限の binding（TURN_LIMITER）が、公開環境で何件目から拒否するかを、Claude を呼ばずに調べる。
// 返すのは、成功・失敗の真偽値と、呼び出しの時刻の秒（0〜59）だけ。IP・本文・キーは返さない。

import { Hono } from "hono";
import type { RateLimiter } from "./ratelimit";

interface ProbeEnv {
  TURN_LIMITER?: RateLimiter;
}

const MAX_CALLS = 30;

export function createProbeApp() {
  const app = new Hono<{ Bindings: ProbeEnv }>();
  // GET /api/_probe?n=15&mode=seq|par&label=a  （label を変えると別のキーで数える）
  app.get("/api/_probe", async (c) => {
    const limiter = c.env.TURN_LIMITER;
    if (limiter === undefined) return c.json({ error: "no_limiter" }, 503);
    const n = Math.min(Math.max(Number(c.req.query("n") ?? "1") || 1, 1), MAX_CALLS);
    const mode = c.req.query("mode") === "par" ? "par" : "seq";
    const label = (c.req.query("label") ?? "a").replace(/[^a-z0-9]/gi, "").slice(0, 16) || "a";
    const ip = c.req.header("cf-connecting-ip");
    const key = `probe:${label}:${ip ?? "unknown"}`;
    const one = async () => {
      const second = new Date().getUTCSeconds();
      try {
        const { success } = await limiter.limit({ key });
        return { ok: success, s: second };
      } catch {
        return { ok: null, s: second };
      }
    };
    let results: { ok: boolean | null; s: number }[];
    if (mode === "par") {
      results = await Promise.all(Array.from({ length: n }, one));
    } else {
      results = [];
      for (let i = 0; i < n; i += 1) results.push(await one());
    }
    return c.json({
      mode,
      hasIp: ip !== undefined,
      allowed: results.filter((r) => r.ok === true).length,
      denied: results.filter((r) => r.ok === false).length,
      errors: results.filter((r) => r.ok === null).length,
      results,
    });
  });
  return app;
}
