// カルテの抽出型の要約と2段構えの監査を、ボードのカルテ画面に出すときの文（Issue #148、ADR-0052・ADR-0053）。

import type { ViewpointId } from "../../flow/types";
import type { AuditFindingKind, AuditSessionState } from "./contract";

// 決定済み：カルテ画面の要約・監査の文（観点の短い名前、監査の指摘の種類の名前、セッションの状態、操作のボタンと説明。Claude Code の下書き）
// → オーナー決定（2026-11-07、チャット、Issue #207）：「下書きのまま採る（推奨）」（ボードの文言）
export const KARTE_ASPECT_LABELS: Readonly<Record<ViewpointId, string>> = {
  location: "情報の在りか",
  alternative: "代わりの手段",
  current: "今の服用と記録の新しさ",
  unrecorded: "記録に載っていないこと",
  proxy: "代わりに伝えられる人",
};

export const AUDIT_FINDING_LABELS: Readonly<Record<AuditFindingKind, string>> = {
  omitted: "抜けているかもしれない",
  meaning_changed: "意味が変わっているかもしれない",
  not_in_conversation: "会話にない内容かもしれない",
  advice_or_diagnosis: "助言や判断に見える書き方かもしれない",
};

export const AUDIT_SESSION_LABELS: Readonly<Record<AuditSessionState, string>> = {
  deleted: "監査役のセッションは削除済みです。",
  pending: "監査役のセッションを後片付けしています（止めてから削除します）。",
  failed: "監査役のセッションを削除できませんでした。",
  not_created: "監査役のセッションは作っていません。",
};

export const KARTE_PANEL_TEXT = {
  makeSummary: "AI 要約を作る（会話の見本）",
  makePlanted: "誤りを混ぜた例を作る（デモ）",
  drafting: "AI 要約を作っています。",
  summaryFallback: "AI 要約が使えなかったため、固定の見本の下書きにしました。",
  quote: "原文",
  quoteUnsupported: "引用とされた文（会話に見つからない）",
  codeFindings: "コードでの確認の指摘（1段目）",
  auditFindings: "監査役の指摘（2段目）",
  conversation: "もとにした会話の見本を見る",
  staff: "聞き手",
  patient: "本人",
  notCovered: "会話で触れていない観点",
  failure: {
    timeout: "時間内に監査が終わりませんでした。",
    invalid_output: "監査役の返事の形が違いました。",
    failed: "監査役を呼べませんでした。",
    not_configured: "監査役が設定されていません。",
    network: "監査の入口に接続できませんでした。",
    ai_stopped: "AI を止めた状態です。",
  } as Readonly<Record<string, string>>,
} as const;

/** 監査役がこの環境で設定されていないときの文（Issue #244）。監査のボタンを押せない見た目にし、そばに理由の1行を出す */
// [TODO-OWNER: 監査役が設定されていないときの理由の1行と、監査なしで進めるボタンの文（Claude Code の下書き）]
export const KARTE_AUDIT_NOT_CONFIGURED_TEXT = {
  reason: "監査役は、この環境では設定されていません（要約とコードでの確認だけ動きます）。",
  skip: "監査なしで進める（「監査できず」として記録）",
} as const;
