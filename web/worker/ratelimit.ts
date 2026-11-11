// お金のかかる呼び出し口の回数制限（ADR-0003、ADR-0035、ADR-0065、safety-test-plan P7）。
// キー（「接頭辞:接続元」）ごとに数える。接続元は clientKey で作る（IPv4 はそのまま、IPv6 は /64 の範囲にまとめる）。数えるのは Durable Object（strictLimiter.ts の RateCounter）で、
// 同じキーはどの拠点から来ても1か所で数える（60秒のすべり窓で10回まで。数はメモリだけ）。
// IP はこの関数の中でキーに使うだけで、ログにも応答にも出さない。会話の本文は扱わない（ADR-0007）。
//
// 限界：接続元（IPv4 のアドレス、IPv6 の /64）ごと・呼び出し口の接頭辞ごとの上限で、入口をまたいだ合計や、多くの接続元からの合計は抑えない。
// IPv6 は /64 の範囲でまとめる（Issue #284。2026-11-11 オーナー決定「推奨で進める」）。同じ /64 の中でアドレスを替えても同じ窓で数える。
// 入口をまたいだ合計の上限は置かない（同じオーナー決定。理由は docs/decisions.md ADR-0065 の追記）。
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

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET_PATTERN = /^[0-9a-f]{1,4}$/;

/** IPv4 の形（4つの 0〜255）なら、そのままの文字列。違えば null */
function ipv4(value: string): string | null {
  const m = IPV4_PATTERN.exec(value);
  if (m === null) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts.join(".") : null;
}

/** IPv6 を8つの16ビットの数に開く（`::` の省略と、末尾に IPv4 を埋め込んだ形を含む）。読めなければ null */
function ipv6Groups(value: string): number[] | null {
  const lower = value.toLowerCase();
  const halves = lower.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string, last: boolean): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    const items = part.split(":");
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (last && i === items.length - 1 && item.includes(".")) {
        const v4 = ipv4(item);
        if (v4 === null) return null;
        const [a, b, c, d] = v4.split(".").map(Number);
        out.push((a << 8) | b, (c << 8) | d);
        continue;
      }
      if (!HEXTET_PATTERN.test(item)) return null;
      out.push(parseInt(item, 16));
    }
    return out;
  };
  const head = parse(halves[0], halves.length === 1);
  const tail = halves.length === 2 ? parse(halves[1], true) : [];
  if (head === null || tail === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...tail];
}

/** IPv6 をまとめる幅（2026-11-11 オーナー決定：/64）。先頭の4つの16ビットを残す */
export const IPV6_PREFIX_GROUPS = 4;

/**
 * 回数制限のキーに使う接続元（Issue #284）。IP はキーにだけ使い、ログにも応答にも出さない。
 * - IPv4 はそのまま
 * - IPv6 は /64 にまとめ、`2001:db8:0:0::/64` の形にそろえる（省略・大文字・先頭の0の書き方の違いをなくす）
 * - IPv4 を埋め込んだ IPv6（`::ffff:198.51.100.7`）は IPv4 として扱う
 * - 読めない文字列は、今までどおり切り詰めてそのまま使う。空・ヘッダーなしは全員で共有するキー
 */
export function clientKey(raw: string | null | undefined): string {
  const value = raw?.trim() ?? "";
  if (value === "") return UNKNOWN_CLIENT;
  const v4 = ipv4(value);
  if (v4 !== null) return v4;
  if (value.includes(":")) {
    const groups = ipv6Groups(value);
    if (groups !== null) {
      const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
      if (mapped) return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
      return `${groups.slice(0, IPV6_PREFIX_GROUPS).map((g) => g.toString(16)).join(":")}::/64`;
    }
  }
  return value.slice(0, MAX_CLIENT_LENGTH);
}

/** 接続元ごとの回数制限の確認。呼び出し口の、お金のかかる呼び出しの直前で 1 回だけ呼ぶ */
export async function checkRateLimit(request: Request, options: RateLimitOptions): Promise<RateCheck> {
  if (!options.enforce) return "allowed";
  if (options.limiter === undefined) return "no_limiter";
  const client = clientKey(request.headers.get(CLIENT_IP_HEADER));
  try {
    const { success } = await options.limiter.limit({ key: `${options.prefix}:${client}` });
    return success ? "allowed" : "limited";
  } catch {
    return "error";
  }
}
