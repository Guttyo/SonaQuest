// カルテの確認状態（Issue #141、B-09、ADR-0050）。AI の下書きをそのまま記録にせず、別の確認（監査）と人の確認を通す流れ。
//   AI下書き → AI監査中 → 監査済み（指摘あり／指摘なし）または 監査できず → 人が確認済み
// 「人が確認済み」にできるのは、そのカルテの救護所でログインしている人だけ。監査で指摘が無くても、人が確認するまで確定しない。
// AI が使えないときも、監査できず → 人が確認済み と進める。
// AI 要約と監査の本体は Issue #142 が作る。ここは状態と、結果を受け取る型（ChartSummaryDraft・ChartAuditResult）だけで、
// いまは固定の見本（SAMPLE_DRAFTS・SAMPLE_FINDINGS）で動かす。状態はブラウザのメモリだけに持ち、保存・送信・ログ出力をしない。

import type { SiteId } from "./data";
import { SAMPLE_DRAFTS, SAMPLE_FINDINGS } from "./accessText";

export type ChartReviewStatus = "ai_draft" | "ai_auditing" | "audited" | "audit_unavailable" | "human_confirmed";

/** 監査の指摘の1件（箇所・種類・理由。Issue #142 の監査役の出力の形に合わせる） */
export interface AuditFinding {
  where: string;
  kind: string;
  reason: string;
}

/** AI の下書き（要約）の1行。aspect は観点（Issue #142 は web/src/flow/record.ts の5観点の識別子を入れる） */
export interface ChartSummaryLine {
  label: string;
  text: string;
  aspect?: string;
  /** 根拠の原文（Issue #142 の quote） */
  quote?: string;
}

/** AI の下書き。source は作り方（見本・抽出型の要約など） */
export interface ChartSummaryDraft {
  source: "sample" | "extractive" | string;
  lines: readonly ChartSummaryLine[];
}

/** 監査の結果。ok:false は監査できなかったとき（時間切れ・API の停止・形の違う返事など。failure は種類だけ） */
export type ChartAuditResult = { ok: true; findings: readonly AuditFinding[] } | { ok: false; failure: string };

export interface ChartReview {
  status: ChartReviewStatus;
  draft: ChartSummaryDraft;
  /** 監査の指摘（監査済みのときだけ意味がある） */
  findings: readonly AuditFinding[];
  /** 監査できなかった理由の種類 */
  auditFailure: string | null;
  /** 監査済み・監査できずになった状態（人が確認した後も、何を見て確認したかを残す） */
  auditedAs: "audited" | "audit_unavailable" | null;
  /** 確認した人と時刻（デモの時計の分） */
  confirmedBy: { site: SiteId; staff: string } | null;
  confirmedAt: number | null;
}

/** カルテの key（demo.ts の chartsFor の `救護所＋|…`）から救護所を取り出す */
export function chartSite(key: string): SiteId | null {
  const site = key.split("|")[0];
  return site.startsWith("救護所") ? (site as SiteId) : null;
}

/** 下書きを作る（すでに状態があれば、人が確認済みのときだけは変えない） */
export function startDraft(review: ChartReview | undefined, draft: ChartSummaryDraft): ChartReview | undefined {
  if (review?.status === "human_confirmed" || review?.status === "ai_auditing") return review;
  return { status: "ai_draft", draft, findings: [], auditFailure: null, auditedAs: null, confirmedBy: null, confirmedAt: null };
}

/** 監査に出す（下書きのときだけ） */
export function startAudit(review: ChartReview | undefined): ChartReview | undefined {
  if (review?.status !== "ai_draft") return review;
  return { ...review, status: "ai_auditing" };
}

/** 監査の結果を受け取る（監査中のときだけ。ほかの状態に遅れて届いた結果は捨てる） */
export function receiveAudit(review: ChartReview | undefined, result: ChartAuditResult): ChartReview | undefined {
  if (review?.status !== "ai_auditing") return review;
  return result.ok
    ? { ...review, status: "audited", findings: [...result.findings], auditFailure: null, auditedAs: "audited" }
    : { ...review, status: "audit_unavailable", findings: [], auditFailure: result.failure, auditedAs: "audit_unavailable" };
}

/** 人が確認済みにできる状態か（監査済みか監査できずのとき） */
export function confirmable(review: ChartReview | undefined): boolean {
  return review?.status === "audited" || review?.status === "audit_unavailable";
}

/** 人が確認済みにする。そのカルテの救護所でログインしている人だけ（違えば変えない） */
export function confirmReview(
  review: ChartReview | undefined,
  chartKey: string,
  actor: { site: SiteId; staff: string },
  at: number,
): ChartReview | undefined {
  if (!confirmable(review) || review === undefined) return review;
  if (chartSite(chartKey) !== actor.site) return review;
  return { ...review, status: "human_confirmed", confirmedBy: { site: actor.site, staff: actor.staff }, confirmedAt: at };
}

/** 確認待ちか（下書きがあって、人がまだ確認していない） */
export function awaitingHuman(review: ChartReview | undefined): boolean {
  return review !== undefined && review.status !== "human_confirmed";
}

/** 見本の下書きと監査の結果を、カルテの key から決まった形で選ぶ（同じカルテはいつも同じ見本。画面で両方の例が見える） */
function sampleIndex(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 2;
}

/** 見本の AI 下書き（固定の文。患者の記録からは作らない） */
export function sampleDraft(key: string): ChartSummaryDraft {
  return { source: "sample", lines: sampleIndex(key) === 0 ? SAMPLE_DRAFTS.clean : SAMPLE_DRAFTS.withError };
}

/** 見本の監査。AI を止めた状態なら監査できず。誤りを混ぜた見本の下書きにだけ指摘を出す */
export function sampleAudit(key: string, aiStopped: boolean): ChartAuditResult {
  if (aiStopped) return { ok: false, failure: "ai_stopped" };
  return { ok: true, findings: sampleIndex(key) === 0 ? [] : SAMPLE_FINDINGS };
}
