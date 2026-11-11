// ボードのデモ用ログイン・救護所ごとの権限・アクセス記録（Issue #141、B-09、ADR-0050）。
// ログインは救護所と架空の担当者を選ぶだけで、パスワードも本人確認も無い（偽装は簡単。デモ用）。
// ログインの状態とアクセス記録はブラウザのメモリだけに持ち、保存・ログ出力をしない。再読み込みで消える。
// Worker へ送るのは、権限の確認に要る3つの値（ログイン中の救護所・書き込み先の救護所・出来事の種類）だけ。

import { HQ, SHELTERS, type SiteId } from "./data";
import {
  AUTHORIZE_SITES,
  writeAllowed,
  type AuthorizeKind,
  type AuthorizeRequest,
  type AuthorizeSite,
} from "./authorizeContract";
import { DEMO_STAFF } from "./accessText";

/** ログイン中の救護所と担当者（架空） */
export interface DemoSession {
  site: SiteId;
  staff: string;
}

/** 救護所ごとの担当者の候補（架空）。患者の架空の氏名（demo.ts の FICTIONAL_NAMES）とは分ける */
export function staffFor(site: SiteId): readonly string[] {
  return DEMO_STAFF[site] ?? [];
}

/**
 * ログインできる拠点。救護所A〜D と本部（HQ。Issue #169）。
 * 2026-11-06 オーナー決定（チャット）：HQ は全体を見て、発注の提案の承認・却下だけができる。救護所のカルテは編集できない
 * （本部がすべてを編集する役割は作らない）
 */
export const LOGIN_SITES: readonly SiteId[] = [...SHELTERS, HQ];

/** 画面に出す拠点の名前（本部備蓄は「本部（HQ）」） */
export function siteLabel(site: SiteId): string {
  return site === HQ ? "本部（HQ）" : site;
}

/** 発注の提案を承認・却下できるか（HQ でログインしているときだけ。Issue #169） */
export function canDecideOrders(session: DemoSession | null): boolean {
  return session !== null && session.site === HQ;
}

export function makeSession(site: SiteId, staff: string): DemoSession | null {
  if (!LOGIN_SITES.includes(site)) return null;
  if (!staffFor(site).includes(staff)) return null;
  return { site, staff };
}

/**
 * 試験と見本のため：その拠点の最初の担当者でログインした状態。HQ（本部備蓄）を渡すと HQ のセッション。
 * ログインできない拠点を渡したときは救護所A にする（今の SiteId はすべて LOGIN_SITES にあるので、この分岐は通らない）
 */
export function sessionFor(site: SiteId): DemoSession {
  const s = LOGIN_SITES.includes(site) ? site : LOGIN_SITES[0];
  return { site: s, staff: staffFor(s)[0] };
}

/** その救護所の在庫・カルテを編集できるか（自分の救護所だけ。HQ は編集しない） */
export function canEdit(session: DemoSession | null, site: SiteId): boolean {
  return session !== null && session.site === site && site !== HQ;
}

/** 画面の SiteId を、Worker へ送る短い記号にする（本部備蓄は null） */
export function siteCode(site: SiteId): AuthorizeSite | null {
  const code = site.replace("救護所", "");
  return (AUTHORIZE_SITES as readonly string[]).includes(code) ? (code as AuthorizeSite) : null;
}

/** アクセス記録の出来事の8種類（Issue #141 の一覧のとおり） */
export type AccessEventKind =
  | "login"
  | "logout"
  | "chart_open"
  | "chart_edit"
  | "ai_summary"
  | "audit_result"
  | "human_confirm"
  | "write_denied";

/** アクセス記録の1行。時刻・救護所・担当者・出来事・対象（カルテの番号など）だけ。カルテの中身・患者の氏名は入れない */
export interface AccessEntry {
  /** デモの時計の時刻（分。BOARD_AS_OF からの経過） */
  at: number;
  site: SiteId;
  staff: string;
  kind: AccessEventKind;
  /** 対象（カルテの番号「B-D01」など、書き込み先の救護所）。無ければ空 */
  target: string;
}

/** 一覧に持つ行の上限（古いものから消す。メモリを使いすぎない） */
export const ACCESS_LOG_MAX = 200;

/** アクセス記録に1行足す（新しいものが先） */
export function appendAccess(log: readonly AccessEntry[], entry: AccessEntry): AccessEntry[] {
  return [entry, ...log].slice(0, ACCESS_LOG_MAX);
}

/** 権限の確認の結果。denied は Worker が 403 を返したか、画面側の判定で拒んだもの */
export type AuthorizeOutcome =
  | { allowed: true; via: "worker" | "local" }
  | { allowed: false; via: "worker" | "local" };

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

/** Worker の応答を待つ上限（ミリ秒）。過ぎたら Worker が使えないとみなし、画面側の判定に切り替える */
export const AUTHORIZE_TIMEOUT_MS = 3000;

/**
 * Worker に書き込みの権限を確かめる（POST /api/board/authorize）。
 * 200 で allowed:true なら許可、403 なら拒否。通信の失敗・時間切れ・JSON でない応答（開発用サーバーだけで動かしているとき）・
 * そのほかの状態は「使えない」とみなし、画面側の判定（同じ救護所か）で進める。403 を「使えない」と扱わない
 */
export async function authorizeWrite(
  session: DemoSession,
  target: SiteId,
  kind: AuthorizeKind,
  fetchImpl: FetchLike | undefined = typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined,
): Promise<AuthorizeOutcome> {
  const actor = siteCode(session.site);
  const to = siteCode(target);
  const local = (): AuthorizeOutcome => ({ allowed: actor !== null && actor === to, via: "local" });
  if (actor === null || to === null || fetchImpl === undefined) return local();
  const body: AuthorizeRequest = { actor_site: actor, target_site: to, kind };
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), AUTHORIZE_TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl("/api/board/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) return local();
    const json = (await res.json().catch(() => null)) as { allowed?: unknown } | null;
    if (res.status === 403) return { allowed: false, via: "worker" };
    if (res.status === 200 && json?.allowed === true) return { allowed: true, via: "worker" };
    return local();
  } catch {
    return local();
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** 画面側だけの判定（Worker と同じ規則）。試験と、Worker が使えないときに使う */
export function localAllowed(session: DemoSession, target: SiteId): boolean {
  const actor = siteCode(session.site);
  const to = siteCode(target);
  return actor !== null && to !== null && writeAllowed({ actor_site: actor, target_site: to, kind: "chart_add" });
}
