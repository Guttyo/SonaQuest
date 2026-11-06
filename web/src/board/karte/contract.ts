// カルテの抽出型の要約（B-10、Issue #142、ADR-0052・ADR-0053 の提案）で、画面と Workers が共有する約束。
// 要約の入力は、コードに持つ架空の会話の見本（samples.ts）だけ。訓練（患者向け）の会話は使わない。
// 要約は「本人の言葉の抜き出し」で、項目ごとに会話の原文の一部（quote）を必ず添える。
// 観点の識別子は訓練の5観点（web/src/flow/types.ts の ViewpointId）に合わせる。

import type { ViewpointId } from "../../flow/types";

export const KARTE_ASPECTS: readonly ViewpointId[] = ["location", "alternative", "current", "unrecorded", "proxy"];

/** 要約の1項目。text は短い見出しの文、quote は会話の本人の発言から文字どおりに抜いた部分 */
export interface KarteSummaryItem {
  aspect: ViewpointId;
  text: string;
  quote: string;
}

/** 要約の出力。会話で触れられなかった観点は not_covered に入れる */
export interface KarteSummary {
  items: KarteSummaryItem[];
  not_covered: ViewpointId[];
}

/** 要約の text の長さの上限 */
export const MAX_ITEM_TEXT_LENGTH = 60;
/** quote の長さの上限と下限（1〜3文字の quote は、どの会話にも当たってしまうので根拠にしない） */
export const MAX_QUOTE_LENGTH = 120;
export const MIN_QUOTE_LENGTH = 4;
/** 項目の数の上限（1観点に2項目まで） */
export const MAX_ITEMS = 10;

/** 要約を作るモデルに渡す出力の形（Messages API の json_schema）。画面に返す前に parseKarteSummary でも確かめる */
export const KARTE_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          aspect: { type: "string", enum: [...KARTE_ASPECTS] },
          text: { type: "string" },
          quote: { type: "string" },
        },
        required: ["aspect", "text", "quote"],
        additionalProperties: false,
      },
    },
    not_covered: { type: "array", items: { type: "string", enum: [...KARTE_ASPECTS] } },
  },
  required: ["items", "not_covered"],
  additionalProperties: false,
} as const;

const isAspect = (v: unknown): v is ViewpointId => typeof v === "string" && (KARTE_ASPECTS as readonly string[]).includes(v);
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((k) => keys.includes(k));

/**
 * 要約の形を確かめる。形が違う・長すぎるときは null（中身の確かめは codeCheck.ts の checkSummary）。
 * モデルの出力にも、画面から送り返された要約にも同じものを使う
 */
export function parseKarteSummary(value: unknown): KarteSummary | null {
  if (!isPlainObject(value) || !onlyKeys(value, ["items", "not_covered"])) return null;
  const { items, not_covered } = value;
  if (!Array.isArray(items) || !Array.isArray(not_covered)) return null;
  if (items.length > MAX_ITEMS || not_covered.length > KARTE_ASPECTS.length) return null;
  const parsedItems: KarteSummaryItem[] = [];
  for (const item of items) {
    if (!isPlainObject(item) || !onlyKeys(item, ["aspect", "text", "quote"])) return null;
    const { aspect, text, quote } = item;
    if (!isAspect(aspect) || typeof text !== "string" || typeof quote !== "string") return null;
    // 形の上限は検査の上限より少し広くとり、長すぎることも指摘として返せるようにする
    if (text.length > MAX_ITEM_TEXT_LENGTH * 2 || quote.length > MAX_QUOTE_LENGTH * 2) return null;
    parsedItems.push({ aspect, text, quote });
  }
  if (!not_covered.every(isAspect)) return null;
  return { items: parsedItems, not_covered: [...not_covered] };
}

// --- 1段目：コードでの確認の指摘 ---------------------------------------------

/** コードでの確認の指摘の種類。本文を含まないので、ログに出してよい */
export const CODE_FINDING_KINDS = [
  /** quote が会話の本人の発言に文字どおり含まれない（根拠なし） */
  "quote_not_found",
  /** quote が短すぎて根拠にならない */
  "quote_too_short",
  /** text に、quote に無い数字・カタカナ・英字がある（量や名前が足された・変わった） */
  "text_adds_terms",
  /** text が禁止表現（助言・診断めいた言い方など）に当たる */
  "forbidden",
  /** text・quote が長すぎる、空 */
  "length",
  /** 同じ観点が items と not_covered の両方にある */
  "aspect_conflict",
  /** どの観点にも入っていない観点がある（items にも not_covered にも無い） */
  "aspect_missing",
] as const;
export type CodeFindingKind = (typeof CODE_FINDING_KINDS)[number];

export interface CodeFinding {
  kind: CodeFindingKind;
  /** 項目の位置（items の何番目か）。観点の指摘（aspect_*）では null */
  itemIndex: number | null;
  aspect: ViewpointId;
}

// --- 2段目：監査役（Managed Agents）の指摘 -----------------------------------

/** 監査役が見る4つ（Issue #142）。医学的な正しさや薬の適否は見させない */
export const AUDIT_FINDING_KINDS = [
  /** 本人が言ったのに要約から落ちている */
  "omitted",
  /** 意味が変わっている */
  "meaning_changed",
  /** 会話にない言葉や事実がある */
  "not_in_conversation",
  /** 助言や診断に見える書き方 */
  "advice_or_diagnosis",
] as const;
export type AuditFindingKind = (typeof AUDIT_FINDING_KINDS)[number];

export interface AuditFinding {
  kind: AuditFindingKind;
  aspect: ViewpointId;
  /** 項目の位置（items の何番目か）。落ちていること（omitted）など、項目が無いときは null */
  itemIndex: number | null;
  /** 理由の文。監査役の文は Workers の検査を通したものだけで、通らなければ種類ごとの固定文に替える */
  reason: string;
}

/** セッションの後片付けの結果。deleted は削除まで終えた、pending は中断の後に削除を続けている、failed は削除できなかった */
export type AuditSessionState = "deleted" | "pending" | "failed" | "not_created";

export type KarteAuditResponse =
  | { status: "audited"; findings: AuditFinding[]; session: AuditSessionState; ms: number }
  | { status: "unavailable"; reason: AuditUnavailableReason; session: AuditSessionState; ms: number };

/** 監査できなかった理由の種類 */
export type AuditUnavailableReason = "timeout" | "invalid_output" | "failed" | "not_configured";

/** 要約の入口の応答 */
export interface KarteSummaryResponse {
  sampleId: string;
  /** model は要約を作った、planted はデモ用に誤りを混ぜた固定の要約 */
  source: "model" | "planted";
  summary: KarteSummary;
  /** 1段目の指摘。禁止表現に当たった項目の text は伏せてある */
  findings: CodeFinding[];
}

/** 監査の入口に送る形。要約は、要約の入口の返事をそのまま返すか、デモ用の誤り入りを ID で指す */
export type KarteAuditRequest = { sampleId: string; summary: KarteSummary } | { sampleId: string; planted: true };

const SAMPLE_ID_PATTERN = /^karte-[0-9]{2}$/;

export function parseSummaryRequest(value: unknown): { sampleId: string; planted: boolean } | null {
  if (!isPlainObject(value) || !onlyKeys(value, ["sampleId", "planted"])) return null;
  const { sampleId, planted } = value;
  if (typeof sampleId !== "string" || !SAMPLE_ID_PATTERN.test(sampleId)) return null;
  if (planted !== undefined && typeof planted !== "boolean") return null;
  return { sampleId, planted: planted === true };
}

export function parseAuditRequest(value: unknown): KarteAuditRequest | null {
  if (!isPlainObject(value)) return null;
  const { sampleId } = value;
  if (typeof sampleId !== "string" || !SAMPLE_ID_PATTERN.test(sampleId)) return null;
  if (onlyKeys(value, ["sampleId", "planted"]) && value.planted === true) return { sampleId, planted: true };
  if (!onlyKeys(value, ["sampleId", "summary"])) return null;
  const summary = parseKarteSummary(value.summary);
  return summary === null ? null : { sampleId, summary };
}

/** 画面と動画で、誤りを混ぜた例に必ず添える文 */
// [TODO-OWNER: デモ用に誤りを混ぜた例に添える文（Claude Code の下書き）]
export const PLANTED_NOTICE = "デモ用に、会話にない内容をわざと1つ混ぜた例です。実際の要約ではありません。";
/** 画面と動画で、要約の見本に必ず添える文 */
// [TODO-OWNER: 架空の会話の見本に添える文（Claude Code の下書き）]
export const SAMPLE_NOTICE =
  "架空の会話の見本です。訓練でのあなたの回答は使っていません。要約は本人の言葉の抜き出しで、確定するのは人です。";
