// 開発中だけの本文のログ出力（ADR-0007 の追記）。既定でオフ。
// 環境変数 DEV_CONTENT_LOG が "1" で、かつリクエストの宛先が手元（localhost・127.0.0.1）のときだけ出す。
// 宛先は利用者が書き換えられる Host ヘッダーではなく、request.url の hostname で見る。

/**
 * 手元とみなす宛先。注意：ここに名前を足すと、その名前で公開した版で、本文のログ（logContent）・比較実験の見出し
 * （app.ts の DEV_METRICS_HEADER。Claude の文を含む）・/api/dev/audit・手元からの課金の入口（turnAllowed など）が開きうる。
 * 公開版で止まるのは、この判定と、wrangler.jsonc の vars に DEV_ で始まる値を書かないことの2つに頼っている（Issue #284）
 */
const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

export function contentLogEnabled(devContentLog: string | undefined, requestUrl: string): boolean {
  if (devContentLog !== "1") return false;
  try {
    return LOCAL_HOSTS.has(new URL(requestUrl).hostname);
  } catch {
    return false;
  }
}

/** 本文を出す唯一の関数。enabled が偽なら何もしない */
export function logContent(enabled: boolean, label: string, content: string): void {
  if (!enabled) return;
  console.log(`[dev-content] ${label}\n${content}`);
}

/** 比較実験で替えてよいモデル（docs/phase2-decisions.md 項目1、ADR-0006） */
const EXPERIMENT_MODELS: ReadonlySet<string> = new Set([
  "claude-opus-5-5",
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
]);
const EXPERIMENT_EFFORTS: ReadonlySet<string> = new Set(["low", "medium", "high"]);

export interface DevOverrides {
  model?: string;
  effort?: "low" | "medium" | "high";
  /** false のとき、/api/turn で監査役を呼ばない（監査役を入れる前と後を比べるため。ADR-0030） */
  audit?: boolean;
}

/**
 * 開発中の比較実験だけで、モデルと effort を替え、測った値を応答の見出しに付ける（docs/evidence.md）。
 * DEV_EXPERIMENT が "1" で、かつ宛先が手元のときだけ有効。wrangler.jsonc には書かず、
 * `wrangler dev --var DEV_EXPERIMENT:1 --var DEV_MODEL:claude-haiku-5-5` のように指定したときだけ使う。
 * 公開する版では宛先の条件で必ず無効（null）になる
 */
export function devOverrides(
  env: { DEV_EXPERIMENT?: string; DEV_MODEL?: string; DEV_EFFORT?: string; DEV_AUDIT?: string },
  requestUrl: string,
): DevOverrides | null {
  if (!contentLogEnabled(env.DEV_EXPERIMENT, requestUrl)) return null;
  const overrides: DevOverrides = {};
  // 監査役を外せるのは、この比較実験の切り替えの中だけ。公開する版では必ず監査役を通す
  if (env.DEV_AUDIT === "off") overrides.audit = false;
  if (env.DEV_MODEL !== undefined && EXPERIMENT_MODELS.has(env.DEV_MODEL)) overrides.model = env.DEV_MODEL;
  if (env.DEV_EFFORT !== undefined && EXPERIMENT_EFFORTS.has(env.DEV_EFFORT)) {
    overrides.effort = env.DEV_EFFORT as DevOverrides["effort"];
  }
  return overrides;
}
