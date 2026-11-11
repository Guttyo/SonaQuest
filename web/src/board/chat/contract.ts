// ボードの掲示板チャット（B-07、Issue #121、ADR-0047）で、画面と Workers が共有する約束。
// 役（本部と救護所A〜D）、欄（共通と、本部と各救護所の DM）、送る形と上限、受け取った値の検査をここに置く。
// エージェントに渡すボードの状況は件数と時刻だけで、薬の品目名・数量・カルテの本文は持たない（形で止める）。

/** 役。HQ は本部、A〜D は救護所A〜D */
export const CHAT_ROLES = ["HQ", "A", "B", "C", "D"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const CHAT_SHELTERS = ["A", "B", "C", "D"] as const;
export type ChatShelter = (typeof CHAT_SHELTERS)[number];

/** 欄。common は全員が見る共通の欄、A〜D は本部とその救護所の DM */
export const CHAT_CHANNELS = ["common", "A", "B", "C", "D"] as const;
export type ChatChannel = (typeof CHAT_CHANNELS)[number];

/** 書き込みの出どころ。agent はエージェント（検査を通った文）、human は人（本部として）、fixed はルールで組んだ固定の掲示 */
export type ChatPostBy = "agent" | "human" | "fixed";

/** エージェントの文の長さの上限（Workers の検査。プロンプトでは 120 字以内と頼む） */
export const MAX_CHAT_TEXT_LENGTH = 140;
/** 人が本部として書き込む文の長さの上限 */
export const MAX_HUMAN_TEXT_LENGTH = 200;
/** エージェントに渡す、その欄のこれまでの書き込みの件数の上限（新しいものから） */
export const MAX_CONTEXT_POSTS = 8;
/** 件数・分の値の上限（形の検査。これを超える値は受け取らない） */
const MAX_COUNT = 100_000;

/** 救護所ごとの状況。すべて件数か分で、品目名・数量・氏名・カルテの文は入れない */
export interface ChatSiteStatus {
  site: ChatShelter;
  /** 今日の患者（延べ）。分からなければ null */
  patients: number | null;
  /** 在庫切れか、目安より早く切れる見込みの品目の数（品目名は渡さない） */
  shortItems: number;
  /** 足りない薬剤師の人数 */
  pharmacistsShort: number;
  /** 未着：紙の記録が本部にまだ届いていない数。分からなければ null（Issue #161 で転記待ちと分けた） */
  notArrivedRecords: number | null;
  /** 転記待ち：本部に届いたが、まだ記録の形にしていない数。分からなければ null */
  awaitingEntryRecords: number | null;
  /** 最終報告から何分たったか。分からなければ null */
  lastReportMinutesAgo: number | null;
}

/** エージェントに渡すボードの状況（件数と時刻だけ） */
export interface ChatStatus {
  /** 架空の時刻（「11/05 10:30」の形） */
  clock: string;
  patientsToday: number;
  /** 薬の不足（在庫切れ・切れる見込み）か、薬剤師の不足が出ている救護所の数（status.ts の chatStatus） */
  shortageSites: number;
  sites: ChatSiteStatus[];
}

export interface ChatContextPost {
  role: ChatRole;
  by: ChatPostBy;
  text: string;
}

/** POST /api/board/chat/session の本文 */
export interface ChatSessionRequest {
  role: ChatRole;
}

/** POST /api/board/chat/turn の本文。role の役として、channel の欄に1件書いてもらう */
export interface ChatTurnRequest {
  role: ChatRole;
  sessionId: string;
  channel: ChatChannel;
  status: ChatStatus;
  /** その欄のこれまでの書き込み（古い順、最大 MAX_CONTEXT_POSTS 件） */
  posts: ChatContextPost[];
}

/** /api/board/chat/turn の応答。text が null のときは検査で捨てた（画面は固定の掲示に替える） */
export interface ChatTurnResponse {
  text: string | null;
  rejected: string | null;
}

/** Workers が返す失敗の種類（本文を含まない） */
export type ChatErrorCode =
  | "unavailable"
  | "not_configured"
  | "rate_limited"
  | "budget_reached"
  | "timeout"
  | "session_unavailable"
  | "bad_request"
  | "forbidden"
  | "too_large";

/** セッションの ID の形。宛先の URL に入れるので、英数字と下線だけを通す */
export const SESSION_ID_PATTERN = /^sesn_[A-Za-z0-9_]{8,128}$/;
const CLOCK_PATTERN = /^\d{2}\/\d{2} \d{2}:\d{2}$/;

/** DM の欄に書けるのは、本部とその救護所だけ。共通の欄は全員 */
export function roleCanPost(role: ChatRole, channel: ChatChannel): boolean {
  return channel === "common" || role === "HQ" || role === channel;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasOnlyKeys = (v: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(v).every((k) => keys.includes(k)) && keys.every((k) => k in v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;
const isCountOrNull = (v: unknown): v is number | null => v === null || isCount(v);
const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

export function parseChatSessionRequest(json: unknown): ChatSessionRequest | null {
  if (!isRecord(json) || !hasOnlyKeys(json, ["role"]) || !isOneOf(CHAT_ROLES, json.role)) return null;
  return { role: json.role };
}

function parseSiteStatus(v: unknown): ChatSiteStatus | null {
  const keys = ["site", "patients", "shortItems", "pharmacistsShort", "notArrivedRecords", "awaitingEntryRecords", "lastReportMinutesAgo"];
  if (!isRecord(v) || !hasOnlyKeys(v, keys)) return null;
  if (!isOneOf(CHAT_SHELTERS, v.site)) return null;
  if (!isCountOrNull(v.patients) || !isCount(v.shortItems) || !isCount(v.pharmacistsShort)) return null;
  if (!isCountOrNull(v.notArrivedRecords) || !isCountOrNull(v.awaitingEntryRecords)) return null;
  if (!isCountOrNull(v.lastReportMinutesAgo)) return null;
  return {
    site: v.site,
    patients: v.patients,
    shortItems: v.shortItems,
    pharmacistsShort: v.pharmacistsShort,
    notArrivedRecords: v.notArrivedRecords,
    awaitingEntryRecords: v.awaitingEntryRecords,
    lastReportMinutesAgo: v.lastReportMinutesAgo,
  };
}

export function parseChatStatus(v: unknown): ChatStatus | null {
  if (!isRecord(v) || !hasOnlyKeys(v, ["clock", "patientsToday", "shortageSites", "sites"])) return null;
  if (typeof v.clock !== "string" || !CLOCK_PATTERN.test(v.clock)) return null;
  if (!isCount(v.patientsToday) || !isCount(v.shortageSites) || !Array.isArray(v.sites)) return null;
  if (v.sites.length > CHAT_SHELTERS.length) return null;
  const sites: ChatSiteStatus[] = [];
  for (const s of v.sites) {
    const parsed = parseSiteStatus(s);
    if (parsed === null || sites.some((x) => x.site === parsed.site)) return null;
    sites.push(parsed);
  }
  return { clock: v.clock, patientsToday: v.patientsToday, shortageSites: v.shortageSites, sites };
}

function parseContextPost(v: unknown): ChatContextPost | null {
  if (!isRecord(v) || !hasOnlyKeys(v, ["role", "by", "text"])) return null;
  if (!isOneOf(CHAT_ROLES, v.role) || !isOneOf(["agent", "human", "fixed"] as const, v.by)) return null;
  if (typeof v.text !== "string") return null;
  const text = v.text.trim();
  // 人の書き込みの上限がいちばん長い（エージェントの文と固定の掲示はそれより短い）
  if (text === "" || text.length > MAX_HUMAN_TEXT_LENGTH) return null;
  // 人は本部としてだけ書き込む
  if (v.by === "human" && v.role !== "HQ") return null;
  return { role: v.role, by: v.by, text };
}

export function parseChatTurnRequest(json: unknown): ChatTurnRequest | null {
  if (!isRecord(json) || !hasOnlyKeys(json, ["role", "sessionId", "channel", "status", "posts"])) return null;
  if (!isOneOf(CHAT_ROLES, json.role) || !isOneOf(CHAT_CHANNELS, json.channel)) return null;
  if (!roleCanPost(json.role, json.channel)) return null;
  if (typeof json.sessionId !== "string" || !SESSION_ID_PATTERN.test(json.sessionId)) return null;
  const status = parseChatStatus(json.status);
  if (status === null || !Array.isArray(json.posts) || json.posts.length > MAX_CONTEXT_POSTS) return null;
  const posts: ChatContextPost[] = [];
  for (const p of json.posts) {
    const parsed = parseContextPost(p);
    if (parsed === null) return null;
    // DM の欄の書き込みは、本部とその救護所のものだけ
    if (!roleCanPost(parsed.role, json.channel)) return null;
    posts.push(parsed);
  }
  return { role: json.role, sessionId: json.sessionId, channel: json.channel, status, posts };
}
