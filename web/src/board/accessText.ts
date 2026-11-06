// ボードのデモ用ログイン・権限・アクセス記録・カルテの確認状態の固定文（Issue #141、ADR-0050）。Claude Code の下書き。
// 担当者・救護所・患者はすべて架空。薬の正誤・処方・診断の判断に見える言い方をしない。

import type { SiteId } from "./data";

// [TODO-OWNER: デモ用ログイン・閲覧のみの表示・アクセス記録の文言と、架空の担当者名の候補（Claude Code の下書き）]
/** 救護所ごとの架空の担当者名。実在の人ではない（「見本」を付けて架空と分かる形にした） */
export const DEMO_STAFF: Readonly<Partial<Record<SiteId, readonly string[]>>> = {
  救護所A: ["見本 青葉", "見本 一歩"],
  救護所B: ["見本 若葉", "見本 二葉"],
  救護所C: ["見本 光", "見本 三月"],
  救護所D: ["見本 灯", "見本 四季"],
};

export const BOARD_LOGIN = {
  title: "デモ用のログイン",
  lead: "救護所と担当者（架空）を選んで入ります。パスワードはありません。",
  notice: "デモ用のログインです。本人確認はしていません。救護所・担当者・患者はすべてデモ用の架空データです。",
  site: "救護所",
  staff: "担当者（架空）",
  submit: "この救護所で入る",
  memory: "ログインの状態はこの画面のメモリだけに持ち、保存しません。読み込み直すと、もう一度選びます。",
  back: "はじめにへ戻る",
  /** 右上の表示 */
  who: (site: string, staff: string) => `${site}／担当：${staff}（架空）`,
  logout: "ログアウト",
} as const;

export const BOARD_PERMISSION = {
  /** 自分の救護所のとき */
  editable: (site: string) => `編集できます（${site}の記録）`,
  /** ほかの救護所・本部のとき。色だけにせず、文字で理由を出す */
  readOnly: (site: string) => `閲覧のみ（${site}の記録）`,
  readOnlyWhy: (mine: string) => `${mine}でログインしているため、ほかの救護所の在庫とカルテは編集できません。`,
  /** 本部の画面。本部のログインはこのデモに無い */
  hqReadOnly: "閲覧のみ（本部の記録。本部のログインはこのデモにありません）",
  /** Worker での確認の結果 */
  denied: (site: string) => `書き込みを拒否しました（権限がありません：${site}の記録）。`,
  deniedWorker: "Worker が 403 で拒否しました。",
  deniedLocal: "Worker に接続できないため、画面側の判定で拒否しました。",
  localOnly: "Worker に接続できないため、画面側の判定だけで進めました。",
  /** 拒否の確認のデモ */
  tryTitle: "ほかの救護所への書き込みを試す（拒否の確認）",
  tryNote: "ほかの救護所のカルテに記録を加える要求を Worker へ送り、拒否（403）されることを確かめるためのデモ用のボタンです。送るのは、ログイン中の救護所・書き込み先の救護所・出来事の種類だけです。",
  tryButton: (site: string) => `${site}への書き込みを試す`,
  limit: "デモ用の確認です。画面の値をそのまま送るので、偽装は簡単です。本番の権限の仕組みではありません。",
} as const;

export const ACCESS_LOG_TEXT = {
  title: "アクセス記録",
  notice: "デモ用の記録です。保存していません。",
  note: "時刻（デモの時計）・救護所・担当者・出来事・対象だけを残します。カルテの中身と患者の氏名は入れません。読み込み直すと消えます。",
  empty: "まだ記録はありません。",
  open: "アクセス記録を開く",
  close: "アクセス記録を閉じる",
  head: { at: "時刻", site: "救護所", staff: "担当者（架空）", kind: "出来事", target: "対象" },
  kinds: {
    login: "ログイン",
    logout: "ログアウト",
    chart_open: "カルテを開いた",
    chart_edit: "カルテを編集した",
    ai_summary: "AI要約を作った",
    audit_result: "監査の結果が出た",
    human_confirm: "人が確認した",
    write_denied: "権限がなく書き込みを拒否した",
  },
} as const;

// [TODO-OWNER: カルテの確認状態の名前・ボタン・説明と、見本の AI 下書き・見本の指摘の文（Claude Code の下書き。AI 要約と監査の本体は Issue #142）]
export const CHART_REVIEW_TEXT = {
  title: "AI 下書きと確認",
  status: {
    none: "AI 下書きなし",
    ai_draft: "AI下書き（確認待ち）",
    ai_auditing: "AI監査中（確認待ち）",
    audited_findings: (n: number) => `監査済み・指摘あり ${n} 件（確認待ち）`,
    audited_clean: "監査済み・指摘なし（確認待ち）",
    audit_unavailable: "監査できず（確認待ち）",
    human_confirmed: "人が確認済み",
  },
  /** カルテの見出しの印（下書きがあって人がまだ確認していない） */
  pendingFlag: "確認待ち",
  makeDraft: "AI 下書きを作る（見本）",
  sendAudit: "AI 監査に出す",
  confirm: "内容を確かめて、確認済みにする",
  auditing: "監査の結果を待っています。",
  confirmedBy: (staff: string, site: string, at: string) => `${site}の${staff}（架空）が ${at} に確認`,
  waiting: "監査で指摘が無くても、人が確認するまで確定しません。",
  unavailable: "AI の監査が使えないため、監査なしで人が確かめます。",
  findings: "監査の指摘",
  findingWhere: "箇所",
  findingKind: "種類",
  findingReason: "理由",
  sampleNote: "固定の見本の下書きです。この患者の記録から作ったものではありません。",
  aiStop: "AI を止めた状態にする（デモ）",
  aiStopNote: "止めると、監査は「監査できず」になります。下書きから人の確認済みまでは進めます。",
  readOnly: "このカルテの救護所でログインしている人だけが、下書き・監査・確認の操作をできます。",
} as const;

/** 見本の AI 下書き（固定の文。患者の記録から作らない。Issue #142 の要約が入るまでの受け口の確認用） */
export const SAMPLE_DRAFTS = {
  clean: [
    { label: "情報の在りか", text: "（見本）お薬手帳は避難所に持ってきていない。" },
    { label: "代わりの手段", text: "（見本）スマートフォンに薬の袋の写真がある。" },
  ],
  withError: [
    { label: "情報の在りか", text: "（見本）お薬手帳は自宅にある。" },
    { label: "代わりに伝えられる人", text: "（見本・デモ用に誤りを混ぜた例）会話にない人が書かれている。" },
  ],
} as const;

/** 見本の監査の指摘（誤りを混ぜた見本の下書きにだけ出す） */
export const SAMPLE_FINDINGS = [
  { where: "代わりに伝えられる人", kind: "会話にない内容", reason: "（見本）会話の中に出てこない人が書かれています。" },
] as const;
