// 回数制限を、世界全体で1か所で数える（ADR-0065、Issue #65、safety-test-plan P7）。
// Workers の Rate Limiting binding は Cloudflare の拠点ごとの近似で、世界全体では合算されない（Cloudflare の文書）。
// 公開環境で、別々の接続から送ると上限を超えても通った（Issue #65 の切り分け）。そこで、キー（「接頭辞:接続元」）ごとに
// Durable Object を1つ持ち、その中で数える。同じキーの呼び出しは、どの拠点から来ても同じ1つのオブジェクトに届く。
//
// - 数えるのはメモリの中だけ。`state.storage` は使わない（ADR-0003 の「DB なし」と、会話を残さない決まりに合わせる）。
//   オブジェクトが片付けられたとき・デプロイし直したときは数が消える。窓が60秒なので、消えても上限を超えるのは1回分の窓だけ。
// - オブジェクトが受け取るのは、上限・期間の数だけ。IP はオブジェクトの名前（`idFromName`）にだけ使い、本文にもログにも出さない。
// - 型は最小限を自分で持つ。`cloudflare:workers` と @cloudflare/workers-types は使わない（依存を足さない）。

import type { RateLimiter } from "./ratelimit";

/** 1つのキーで、期間の中に通す回数（Issue #57 のオーナー決定：60秒で10回） */
export const STRICT_LIMIT = 10;
/** 期間（ミリ秒） */
export const STRICT_PERIOD_MS = 60_000;

/** Durable Object の名前空間（wrangler.jsonc の durable_objects の binding）のうち、使うところだけ */
export interface CounterNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

/** 窓の中の時刻だけを残し、上限の内なら1回分を足す（取っている途中で外に出ないよう、同期で行う） */
export function takeSlot(times: number[], now: number, limit: number, periodMs: number): boolean {
  const from = now - periodMs;
  let drop = 0;
  while (drop < times.length && times[drop] <= from) drop++;
  if (drop > 0) times.splice(0, drop);
  if (times.length >= limit) return false;
  times.push(now);
  return true;
}

/**
 * 1つのキーの回数を数える Durable Object（キーごとに1つ）。
 * 古い書き方（constructor と fetch）にして、`cloudflare:workers` を使わない。
 */
export class RateCounter {
  private readonly times: number[] = [];

  constructor(_state: unknown, _env: unknown, private readonly now: () => number = Date.now) {}

  async fetch(_request: Request): Promise<Response> {
    const success = takeSlot(this.times, this.now(), STRICT_LIMIT, STRICT_PERIOD_MS);
    return new Response(JSON.stringify({ success }), { headers: { "content-type": "application/json" } });
  }
}

/** 呼び出し口が使う `limit()` の形（ratelimit.ts の RateLimiter）にそろえる。失敗は投げて、呼び出し口を閉じさせる */
export function durableLimiter(namespace: CounterNamespace): RateLimiter {
  return {
    async limit({ key }) {
      const stub = namespace.get(namespace.idFromName(key));
      const response = await stub.fetch(new Request("https://rate-counter.internal/take", { method: "POST" }));
      if (!response.ok) throw new Error("rate_counter_failed");
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || typeof (body as { success?: unknown }).success !== "boolean") {
        throw new Error("rate_counter_bad_response");
      }
      return { success: (body as { success: boolean }).success };
    },
  };
}

/**
 * 入口（index.ts）で、呼び出し口が使う TURN_LIMITER を Durable Object の binding（RATE_COUNTER）から作って渡す。
 * binding が無ければ渡さない（PUBLIC_TURN=1 のときは、呼び出し口が no_limiter で閉じる）
 */
export function attachLimiter<E extends { RATE_COUNTER?: CounterNamespace }>(env: E): E & { TURN_LIMITER?: RateLimiter } {
  return env.RATE_COUNTER === undefined ? env : { ...env, TURN_LIMITER: durableLimiter(env.RATE_COUNTER) };
}
