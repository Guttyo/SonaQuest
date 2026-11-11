// ボードの書き込みの権限の確認（Issue #141、ADR-0050）で、画面と Worker が共有する形。
// 送るのは、ログイン中の救護所・書き込み先の救護所・出来事の種類の3つだけ。担当者名・カルテの番号や中身・氏名は送らない。
// デモ用の確認で、偽装は簡単（画面の値をそのまま信じる）。本人確認ではない。
// 位置づけ（Issue #289 の 5）：writeAllowed は画面（access.ts の localAllowed）と Worker（worker/boardAuthorize.ts）の両方で同じ入力に使う。
// Worker での確認は画面と同じ判定の繰り返しで、新しく加わる判断は無い。カルテの入口（/api/karte/*）はこの確認の結果を求めない。

/** 救護所の短い記号（画面の SiteId「救護所A」の「A」）。本部備蓄は書き込み先にならない */
export const AUTHORIZE_SITES = ["A", "B", "C", "D"] as const;
export type AuthorizeSite = (typeof AUTHORIZE_SITES)[number];

/** 書き込みの種類。カルテに記録を加える・AI 下書きを作る・監査に出す・人が確認済みにする */
export const AUTHORIZE_KINDS = ["chart_add", "chart_summary", "chart_audit", "chart_confirm"] as const;
export type AuthorizeKind = (typeof AUTHORIZE_KINDS)[number];

export interface AuthorizeRequest {
  actor_site: AuthorizeSite;
  target_site: AuthorizeSite;
  kind: AuthorizeKind;
}

/** 受け取る本文の上限（バイト）。3つの短い値だけなので小さくする */
export const AUTHORIZE_MAX_BYTES = 200;

const isSite = (v: unknown): v is AuthorizeSite => typeof v === "string" && (AUTHORIZE_SITES as readonly string[]).includes(v);
const isKind = (v: unknown): v is AuthorizeKind => typeof v === "string" && (AUTHORIZE_KINDS as readonly string[]).includes(v);

/** 形が違う・余計なキーがあるときは null（中身を送らせない約束を、受け口でも確かめる） */
export function parseAuthorizeRequest(value: unknown): AuthorizeRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 3) return null;
  const v = value as Record<string, unknown>;
  if (!isSite(v.actor_site) || !isSite(v.target_site) || !isKind(v.kind)) return null;
  return { actor_site: v.actor_site, target_site: v.target_site, kind: v.kind };
}

/** 書き込んでよいか。ログイン中の救護所と書き込み先が同じときだけ（本部がすべてを編集する役割は作らない） */
export function writeAllowed(req: AuthorizeRequest): boolean {
  return req.actor_site === req.target_site;
}
