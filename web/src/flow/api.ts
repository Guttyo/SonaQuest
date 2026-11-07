// ブラウザから /api/turn を呼ぶ。失敗・時間切れ・形の違う応答は、すべて null にする（ADR-0012）。
// 回答の本文はログに出さない（ADR-0007）。

import { parseTurnResponse, type TurnRequest, type TurnResponse } from "./turnContract";

/**
 * 画面が返事を待つ上限。Workers が Claude を待つ15秒（docs/phase2-decisions.md 項目9。2026-11-07 オーナー決定で8秒から延ばした、Issue #219）と、
 * 監査役を待つ6秒（ADR-0030）に、通信の余裕を足したもの
 */
export const TURN_TIMEOUT_MS = 24_000;

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
