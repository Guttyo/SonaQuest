// Cloudflare Workers の入口。default（要求の受け口）と、回数を数える Durable Object のクラス（ADR-0065）を出す。
// Durable Object のクラスは wrangler.jsonc の durable_objects と migrations の名前と合わせる。

import { createApp } from "./app";
import { attachLimiter, type CounterNamespace } from "./strictLimiter";

export { RateCounter } from "./strictLimiter";

const app = createApp();

export default {
  fetch(request: Request, env: Record<string, unknown> & { RATE_COUNTER?: CounterNamespace }, ctx: unknown) {
    // 呼び出し口（/api/turn・/api/tts・掲示板チャット・カルテ）は TURN_LIMITER を使う。ここで Durable Object の数え方を渡す
    return app.fetch(request, attachLimiter(env), ctx as never);
  },
};
