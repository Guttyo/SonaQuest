// ボードのカルテ画面から、抽出型の要約（/api/karte/summary）と監査（/api/karte/audit）を呼び、
// カルテの確認状態（review.ts の ChartSummaryDraft・ChartAuditResult）に変える（Issue #148、ADR-0052・ADR-0053）。
// 送るのは架空の会話の見本の ID と、要約の入口が返した要約だけ。カルテの記録・氏名・担当者名は送らない。
// 返事は画面のメモリにだけ持ち、保存・ログ出力をしない。

import type { AuditFinding, ChartAuditResult, ChartSummaryDraft } from "../review";
import { CODE_FINDING_LABELS } from "./codeCheck";
import {
  AUDIT_FINDING_KINDS,
  CODE_FINDING_KINDS,
  KARTE_ASPECTS,
  parseKarteSummary,
  type AuditSessionState,
  type CodeFinding,
  type KarteAuditRequest,
  type KarteSummary,
} from "./contract";
import { KARTE_SAMPLES, type KarteSample } from "./samples";
import { AUDIT_FINDING_LABELS, KARTE_ASPECT_LABELS } from "./text";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

const defaultFetch = (): FetchLike | undefined => (typeof fetch === "function" ? (fetch as unknown as FetchLike) : undefined);

/** 要約の入口を待つ上限（Worker の要約は20秒で打ち切る） */
export const SUMMARY_CLIENT_TIMEOUT_MS = 25_000;
/** 監査の入口を待つ上限（Worker の監査は45秒で「監査できず」を返す。届かなければ画面の側で「監査できず」） */
export const AUDIT_CLIENT_TIMEOUT_MS = 55_000;

/** カルテの key から、決まった架空の会話の見本を選ぶ（同じカルテはいつも同じ見本） */
export function sampleForChart(key: string): KarteSample {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return KARTE_SAMPLES[h % KARTE_SAMPLES.length];
}

const SESSION_STATES: readonly AuditSessionState[] = ["deleted", "pending", "failed", "not_created"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function lineWhere(summary: KarteSummary, itemIndex: number | null, aspect: string): string {
  const label = KARTE_ASPECT_LABELS[aspect as keyof typeof KARTE_ASPECT_LABELS] ?? "";
  if (itemIndex === null || itemIndex < 0 || itemIndex >= summary.items.length) return label;
  return `${itemIndex + 1}行目（${label}）`;
}

export function parseCodeFindings(value: unknown, summary: KarteSummary): CodeFinding[] | null {
  if (!Array.isArray(value)) return null;
  const out: CodeFinding[] = [];
  for (const f of value) {
    if (!isObject(f)) return null;
    const { kind, itemIndex, aspect } = f;
    if (typeof kind !== "string" || !(CODE_FINDING_KINDS as readonly string[]).includes(kind)) return null;
    if (typeof aspect !== "string" || !(KARTE_ASPECTS as readonly string[]).includes(aspect)) return null;
    if (itemIndex !== null && (typeof itemIndex !== "number" || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= summary.items.length)) return null;
    out.push({ kind: kind as CodeFinding["kind"], itemIndex: itemIndex as number | null, aspect: aspect as CodeFinding["aspect"] });
  }
  return out;
}

/** 要約の入口の返事を、カルテの下書きにする。形が違えば null */
export function summaryToDraft(value: unknown, planted: boolean): ChartSummaryDraft | null {
  if (!isObject(value) || typeof value.sampleId !== "string") return null;
  const summary = parseKarteSummary(value.summary);
  if (summary === null) return null;
  const findings = parseCodeFindings(value.findings, summary);
  if (findings === null) return null;
  const codeFindings: AuditFinding[] = findings.map((f) => ({
    where: lineWhere(summary, f.itemIndex, f.aspect),
    kind: "コードでの確認",
    reason: CODE_FINDING_LABELS[f.kind],
    ...(f.itemIndex === null ? {} : { line: f.itemIndex }),
  }));
  return {
    source: "extractive",
    sampleId: value.sampleId,
    planted,
    summary,
    codeFindings,
    // 監査役が使えるか（Issue #244）。古い Worker の返事など、無いときは false（押す前に使えないと示す）
    auditConfigured: value.auditConfigured === true,
    unsupportedLines: findings
      .filter((f) => f.itemIndex !== null && (f.kind === "quote_not_found" || f.kind === "quote_too_short"))
      .map((f) => f.itemIndex as number),
    lines: summary.items.map((item) => ({ label: KARTE_ASPECT_LABELS[item.aspect], text: item.text, aspect: item.aspect, quote: item.quote })),
  };
}

/** 監査の入口の返事を、監査の結果にする。形が違えば「監査できず」 */
export function auditToResult(value: unknown, summary: KarteSummary): ChartAuditResult {
  if (!isObject(value)) return { ok: false, failure: "invalid_output" };
  const session = typeof value.session === "string" && (SESSION_STATES as readonly string[]).includes(value.session) ? (value.session as AuditSessionState) : undefined;
  const withSession = session === undefined ? {} : { session };
  if (value.status === "unavailable") {
    const reason = typeof value.reason === "string" ? value.reason : "failed";
    return { ok: false, failure: reason, ...withSession };
  }
  if (value.status !== "audited" || !Array.isArray(value.findings)) return { ok: false, failure: "invalid_output", ...withSession };
  const findings: AuditFinding[] = [];
  for (const f of value.findings) {
    if (!isObject(f)) return { ok: false, failure: "invalid_output", ...withSession };
    const { kind, aspect, itemIndex, reason } = f;
    if (typeof kind !== "string" || !(AUDIT_FINDING_KINDS as readonly string[]).includes(kind)) return { ok: false, failure: "invalid_output", ...withSession };
    if (typeof aspect !== "string" || !(KARTE_ASPECTS as readonly string[]).includes(aspect)) return { ok: false, failure: "invalid_output", ...withSession };
    if (typeof reason !== "string" || reason.length > 200) return { ok: false, failure: "invalid_output", ...withSession };
    const index = typeof itemIndex === "number" && Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < summary.items.length ? itemIndex : null;
    findings.push({
      where: lineWhere(summary, index, aspect),
      kind: AUDIT_FINDING_LABELS[kind as keyof typeof AUDIT_FINDING_LABELS],
      reason,
      ...(index === null ? {} : { line: index }),
    });
  }
  return { ok: true, findings, ...withSession };
}

async function postJson(url: string, body: unknown, timeoutMs: number, fetchImpl: FetchLike): Promise<{ status: number; json: unknown } | "timeout" | "network"> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : null;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) return "network";
    return { status: res.status, json: await res.json().catch(() => null) };
  } catch {
    return timedOut ? "timeout" : "network";
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** 要約を作る。使えないとき（キーが無い・回数制限・接続できない・形が違う）は null（画面は固定の見本の下書きに戻る） */
export async function requestSummary(
  sampleId: string,
  planted: boolean,
  fetchImpl: FetchLike | undefined = defaultFetch(),
  timeoutMs = SUMMARY_CLIENT_TIMEOUT_MS,
): Promise<ChartSummaryDraft | null> {
  if (fetchImpl === undefined) return null;
  const r = await postJson("/api/karte/summary", planted ? { sampleId, planted: true } : { sampleId }, timeoutMs, fetchImpl);
  if (typeof r === "string" || r.status !== 200) return null;
  return summaryToDraft(r.json, planted);
}

/**
 * 抽出型の下書きで、この環境に監査役が設定されていないか（Issue #244）。
 * そのときは監査のボタンを押せない見た目にし、Worker を呼ばずに「監査できず（設定なし）」へ進める
 */
export function auditNotConfigured(draft: ChartSummaryDraft | undefined): boolean {
  return draft?.source === "extractive" && draft.auditConfigured !== true;
}

/** 監査役が設定されていないときの結果（Worker の /api/karte/audit が返すものと同じ） */
export const NOT_CONFIGURED_AUDIT: ChartAuditResult = { ok: false, failure: "not_configured", session: "not_created" };

/** 監査に出す。抽出型の下書きでないとき・接続できないとき・時間切れは「監査できず」 */
export async function requestAudit(
  draft: ChartSummaryDraft,
  fetchImpl: FetchLike | undefined = defaultFetch(),
  timeoutMs = AUDIT_CLIENT_TIMEOUT_MS,
): Promise<ChartAuditResult> {
  if (draft.source !== "extractive" || draft.sampleId === undefined || draft.summary === undefined) return { ok: false, failure: "not_configured" };
  if (fetchImpl === undefined) return { ok: false, failure: "network" };
  const body: KarteAuditRequest = draft.planted ? { sampleId: draft.sampleId, planted: true } : { sampleId: draft.sampleId, summary: draft.summary };
  const r = await postJson("/api/karte/audit", body, timeoutMs, fetchImpl);
  if (r === "timeout") return { ok: false, failure: "timeout" };
  if (r === "network") return { ok: false, failure: "network" };
  if (r.status !== 200) return { ok: false, failure: "failed" };
  return auditToResult(r.json, draft.summary);
}

// --- HQ のカルテ画面の文字起こしの要約（Issue #202、ADR-0061 の追記） ------------------
// 送るのは、利用者が「要約を作る」を押したときの文字起こしだけ。返事は画面のメモリにだけ持つ。

export type TranscriptSummaryOutcome =
  | { ok: true; summary: KarteSummary; findings: CodeFinding[] }
  | { ok: false; failure: "not_configured" | "rate_limited" | "unavailable" | "bad_request" | "timeout" | "network" | "invalid" };

export async function requestTranscriptSummary(
  transcript: string,
  fetchImpl: FetchLike | undefined = defaultFetch(),
  timeoutMs = SUMMARY_CLIENT_TIMEOUT_MS,
): Promise<TranscriptSummaryOutcome> {
  if (fetchImpl === undefined) return { ok: false, failure: "network" };
  const r = await postJson("/api/karte/transcript-summary", { transcript }, timeoutMs, fetchImpl);
  if (r === "timeout" || r === "network") return { ok: false, failure: r };
  if (r.status === 503 && isObject(r.json) && r.json.error === "not_configured") return { ok: false, failure: "not_configured" };
  if (r.status === 429) return { ok: false, failure: "rate_limited" };
  if (r.status === 400) return { ok: false, failure: "bad_request" };
  if (r.status !== 200 || !isObject(r.json) || r.json.source !== "model") return { ok: false, failure: "unavailable" };
  const summary = parseKarteSummary(r.json.summary);
  const findings = summary === null ? null : parseCodeFindings(r.json.findings, summary);
  if (summary === null || findings === null) return { ok: false, failure: "invalid" };
  return { ok: true, summary, findings };
}
