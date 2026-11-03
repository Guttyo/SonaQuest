// 開発中だけの本文のログ出力（ADR-0007 の追記）。既定でオフ。
// 環境変数 DEV_CONTENT_LOG が "1" で、かつリクエストの宛先が手元（localhost・127.0.0.1）のときだけ出す。
// 宛先は利用者が書き換えられる Host ヘッダーではなく、request.url の hostname で見る。

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
