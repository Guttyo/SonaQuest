// ブラウザから /api/turn を呼ぶ。失敗・時間切れ・形の違う応答は、すべて null にする（ADR-0012）。
// 回答の本文はログに出さない（ADR-0007）。

import { parseTurnResponse, type TurnRequest, type TurnResponse } from "./turnContract";

/** Workers が Claude を待つ8秒（docs/phase2-decisions.md 項目9）に、通信の余裕を足した待ち時間 */
export const TURN_TIMEOUT_MS = 9000;

export async function requestTurn(
  request: TurnRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnResponse | null> {
  try {
    const response = await fetchImpl("/api/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return parseTurnResponse(await response.json());
  } catch {
    return null;
  }
}
