// お金のかかる呼び出し口の回数制限（ADR-0003、ADR-0035、ADR-0065、safety-test-plan P7）。
// キー（「接頭辞:接続元の IP」）ごとに数える。数えるのは Durable Object（strictLimiter.ts の RateCounter）で、
// 同じキーはどの拠点から来ても1か所で数える（60秒のすべり窓で10回まで。数はメモリだけ）。
// IP はこの関数の中でキーに使うだけで、ログにも応答にも出さない。会話の本文は扱わない（ADR-0007）。
//
// 限界：接続元の IP ごと・呼び出し口の接頭辞ごとの上限で、入口をまたいだ合計や、多くの接続元からの合計は抑えない。
// IPv6 のアドレスはそのままキーにしている（範囲でまとめていない。Issue #284 のオーナーの判断が要る点）。
// オブジェクトが失敗した・答えなかった（strictLimiter.ts の RATE_COUNTER_TIMEOUT_MS）ときは、呼び出し口を閉じる。
// 支出の最後の守りは Anthropic 側の上限（P9）。

/**
 * 回数を数えるもの（`limit()` だけを使う）。入口（index.ts）が、Durable Object の binding（RATE_COUNTER）から
 * strictLimiter.ts の durableLimiter で作って、TURN_LIMITER として渡す（ADR-0065）。
 * 型は最小限を自分で持つ。@cloudflare/workers-types は足さない（依存を足さない）
 */
export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * - allowed：通す（数えなかった場合を含む）
 * - limited：上限を超えた。呼び出し口は 429 を返す
 * - no_limiter：数える必要があるのに binding が無い（設定漏れ）。呼び出し口は閉じる
 * - error：数えるもの（Durable Object）が失敗した・待ち時間の上限までに答えなかった。呼び出し口は閉じる
 */
export type RateCheck = "allowed" | "limited" | "no_limiter" | "error";

/** Cloudflare が付ける接続元の IP のヘッダー。手元の開発では付かない */
const CLIENT_IP_HEADER = "cf-connecting-ip";
/** ヘッダーが無いときに全員で共有するキー。数えるのをやめずに、いちばん厳しい側に倒す */
const UNKNOWN_CLIENT = "unknown";
/** キーの長さの上限（IPv6 は最大 45 文字） */
const MAX_CLIENT_LENGTH = 64;

export interface RateLimitOptions {
  /** 数えるかどうか。公開の切り替え（PUBLIC_TURN=1）のとき true。手元の開発では数えない（続けて呼ぶ比較実験があるため） */
  enforce: boolean;
  /** 入口が渡す TURN_LIMITER（Durable Object の binding から作る）。enforce が true なのに無ければ no_limiter */
  limiter: RateLimiter | undefined;
  /** 呼び出し口ごとの接頭辞（"turn" など）。別の呼び出し口は別の接頭辞にして、数えるものを分ける */
  prefix: string;
}

/** 接続元ごとの回数制限の確認。呼び出し口の、お金のかかる呼び出しの直前で 1 回だけ呼ぶ */
export async function checkRateLimit(request: Request, options: RateLimitOptions): Promise<RateCheck> {
  if (!options.enforce) return "allowed";
  if (options.limiter === undefined) return "no_limiter";
  const client = request.headers.get(CLIENT_IP_HEADER)?.trim().slice(0, MAX_CLIENT_LENGTH) || UNKNOWN_CLIENT;
  try {
    const { success } = await options.limiter.limit({ key: `${options.prefix}:${client}` });
    return success ? "allowed" : "limited";
  } catch {
    return "error";
  }
}
