// ボードの掲示板チャット（B-07、ADR-0047）の固定文。Claude Code の下書き。
// 固定の掲示（エージェントが使えないとき）は、件数と時刻をルールで並べるだけで、Claude を使わない。

import type { ChatChannel, ChatRole, ChatSiteStatus, ChatStatus } from "./contract";

export const CHAT_ROLE_NAMES: Readonly<Record<ChatRole, string>> = {
  HQ: "本部（HQ）",
  A: "救護所A",
  B: "救護所B",
  C: "救護所C",
  D: "救護所D",
};

/** 吹き出しと欄のボタンに付ける丸い印の文字（Issue #161。2026-11-06 オーナー、チャット：「●の中にAとかにしてもいいかもね。色分けしてさ」） */
export const CHAT_ROLE_MARKS: Readonly<Record<ChatRole, string>> = { HQ: "本", A: "A", B: "B", C: "C", D: "D" };

/** 左の欄の並び。all は本部が見るすべての欄（読むだけ） */
export type ChatView = "all" | ChatChannel;
export const CHAT_VIEWS: readonly ChatView[] = ["all", "common", "A", "B", "C", "D"];

// [TODO-OWNER: 掲示板チャットの画面の文言（Claude Code の下書き。題・欄の名前・ボタン・状態の文・使えないときの文）]
export const CHAT_TEXT = {
  title: "連絡（掲示板）",
  lead: "本部と救護所の連絡の掲示板です。実際の災害では本部のホワイトボードに書いて共有していた報告を、各救護所から本部へ届く形で見せます。薬の在庫・数量は在庫と発注のタブで見るもので、ここでは扱いません。",
  viewsLabel: "欄",
  views: {
    all: "本部（HQ）：すべての欄",
    common: "共通の欄",
    A: "救護所A（DM）",
    B: "救護所B（DM）",
    C: "救護所C（DM）",
    D: "救護所D（DM）",
  } satisfies Record<ChatView, string>,
  viewNotes: {
    all: "すべての欄の書き込みを、新しいものを下に並べています。書き込むときは欄を選んでください。",
    common: "本部と救護所A〜Dの全員が見る欄です。",
    dm: (role: string) => `本部と${role}だけの欄です。`,
  },
  badges: { agent: "エージェント", human: "あなた（本部として）", fixed: "固定の掲示" },
  fictional: "架空",
  start: "エージェントの連絡を始める",
  startNote:
    "始めると、本部と救護所A〜Dの5つの役を Anthropic の Managed Agents のエージェントが演じ、薬剤以外の連絡（処方箋の用紙・物資・食糧・人員・通信・搬送）をやりとりします。エージェントに渡すのは、ボードの件数と架空の時刻だけです（薬の品目名・数量・カルテは渡しません）。",
  inputLabel: "本部として書き込む",
  inputPlaceholder: "例：救護所Bへ。夕方の搬送便で処方箋の用紙を届けます",
  send: "書き込む",
  sending: "返事を待っています…",
  chooseChannel: "書き込むときは、左で共通の欄か救護所の DM を選んでください。",
  memoryNote: "画面の書き込みはこのブラウザのメモリにだけあり、タブを閉じると消えます。",
  phase: {
    intro: "固定の掲示を表示しています。エージェントの連絡はまだ始めていません。",
    live: "エージェントが連絡をやりとりしています。",
    fallback: "エージェントにつながらないため、固定の掲示に切り替えました。ボードのほかの機能はそのまま使えます。",
    finished: "このページで送れる回数の上限に達したため、エージェントの連絡を止めました。",
  },
  fallbackReasons: {
    not_configured: "エージェントの設定がまだありません。",
    unavailable: "エージェントを呼べませんでした。",
    rate_limited: "短い間に送った回数が多すぎました。",
    budget_reached: "セッションの支出の上限に達しました。",
    timeout: "返事が時間内に届きませんでした。",
    session_unavailable: "セッションが使えなくなりました。",
    bad_request: "送った形が受け付けられませんでした。",
    forbidden: "この呼び出しは受け付けられません。",
    too_large: "送る内容が大きすぎました。",
    network: "通信に失敗しました。",
  } as Readonly<Record<string, string>>,
  localOnly: "エージェントにつながっていないため、書き込みは送られず、この画面にだけ出ます。",
  empty: "まだ書き込みはありません。",
} as const;

/**
 * 吹き出しの画面（Issue #161）で足した文。上の説明を短くし、AI の発言とボードの状態の境目と、操作中の役割を示す。
 * もとの長い説明（CHAT_TEXT.lead）は「この掲示板について」を開くと読める。送る先と送るものの説明（startNote・注意文）は始めるボタンと入力欄のそばに残す
 */
// [TODO-OWNER: 掲示板チャットの吹き出しの画面で足した文言（Claude Code の下書き。Issue #161：短い説明・AI連絡の状態・AI の印・ボードは変わらない表示・操作中の役割）]
export const CHAT_BUBBLE_TEXT = {
  lead: "本部と救護所A〜Dの、薬剤以外の連絡の掲示板（架空）です。",
  about: "この掲示板について",
  aiStatusLabel: "AI連絡",
  aiStatus: {
    intro: "未開始（固定の掲示）",
    live: "稼働中",
    fallback: "停止（固定の掲示）",
    finished: "上限で停止",
  },
  operatingRoleLabel: "操作中の役割",
  operatingRole: "本部（HQ）",
  operatingRoleNote: "救護所でログインしていても、ここでは本部として書き込みます。",
  aiBadge: "AI・訓練上の発言",
  boardUnchanged:"AI の発言で「送ります」「手配します」とあっても、ボードの搬送・発注の状態は変わりません。",
} as const;

/**
 * 送る前の注意文（オーナーの指示の文に沿った下書き）。書き込みは Anthropic のセッションに送られ、そこに残る
 */
// [TODO-OWNER: 掲示板チャットの送信前の注意文（Claude Code の下書き。Issue #121 の文に沿った）]
export const CHAT_SEND_NOTICE =
  "このチャットは架空の訓練用で、書いた内容は Anthropic の Managed Agents のセッションに送られ、そこに残ります。実在の人の名前や実際の情報を入れないでください。";

const ago = (minutes: number | null) => {
  if (minutes === null) return "不明";
  if (minutes < 1) return "いま";
  if (minutes < 60) return `${minutes} 分前`;
  return `${Math.floor(minutes / 60)} 時間前`;
};
const count = (n: number | null, unit: string) => (n === null ? "不明" : `${n} ${unit}`);

/**
 * 固定の掲示（エージェントが使えないとき、検査で文を捨てたとき）。件数と時刻をルールで並べるだけ
 */
// [TODO-OWNER: 掲示板チャットの固定の掲示のひな形（Claude Code の下書き）]
export const CHAT_FIXED = {
  siteReport: (s: ChatSiteStatus) =>
    `報告：今日の患者 ${count(s.patients, "人")}、不足が出ている品目 ${s.shortItems} 件、薬剤師の不足 ${s.pharmacistsShort} 人、未着の記録 ${count(s.notArrivedRecords, "件")}、転記待ちの記録 ${count(s.awaitingEntryRecords, "件")}。最終報告 ${ago(s.lastReportMinutesAgo)}。`,
  hqCommon: (status: ChatStatus) =>
    `全体：今日の患者 ${status.patientsToday} 人。不足が出ている救護所 ${status.shortageSites} か所。各救護所は次の報告をお願いします。`,
  hqDm: (s: ChatSiteStatus) => `本部です。最終報告 ${ago(s.lastReportMinutesAgo)}。次の報告をお願いします。`,
  siteCommon: (s: ChatSiteStatus) => `報告：今日の患者 ${count(s.patients, "人")}。最終報告 ${ago(s.lastReportMinutesAgo)}。`,
} as const;
