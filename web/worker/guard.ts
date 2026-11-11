// Worker の入口に共通の関門（Issue #284）。費用のかかる入口（/api/turn・/api/tts・掲示板チャット・カルテ・手元の
// /api/dev/audit・/api/dev/tts）が、それぞれの入口の中で明示的に呼ぶ。入口全体の共通の前処理（middleware）にはしない
// （各入口の app を単体で試験しているため。app.ts の冒頭のコメント）。もとは tts.ts にあったものを、挙動を変えずに移した。

/**
 * 別のサイトのページからの呼び出しか。画面は同じサイトから `Content-Type: application/json` で送る。
 * JSON の形を宣言しない呼び出し（別のサイトから事前の確認なしで送れる形）と、ブラウザが `Sec-Fetch-Site: cross-site`
 * を付けた呼び出しを拒む。手元の `wrangler dev` を開いている間に、ほかのページから課金の呼び出しをされないため
 */
export function crossSiteRequest(request: Request): boolean {
  const type = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!type.startsWith("application/json")) return true;
  return request.headers.get("sec-fetch-site") === "cross-site";
}
