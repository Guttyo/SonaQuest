// /api/karte/*：カルテの抽出型の要約と2段構えの監査（B-10、Issue #142、ADR-0052・ADR-0053 の提案）。
// - POST /api/karte/summary：見本の ID を受け取り、要約を作るモデル（Messages API）で要約し、1段目のコードでの確認を通して返す。
//   planted: true のときは、デモ用に誤りを混ぜた固定の要約を返す（AI を呼ばない）
// - POST /api/karte/audit：見本の ID と要約（要約の入口の返事をそのまま返す）か planted を受け取り、
//   Managed Agents の監査役で確かめる。一定時間で終わらなければ「監査できず」。セッションは毎回削除する
// - POST /api/karte/transcript-summary：HQ のカルテ画面で架空の患者を演じて話した文字起こし（2000字まで）を受け取り、
//   同じモデルと決まりで要約し、1段目のコードでの確認を通して返す（Issue #202、ADR-0061 の追記）。監査役には回さない
// 見本の要約・監査では、会話の本文をブラウザから受け取らない（見本はコードに持つ）。文字起こしの入口だけが本文を受け取る。API キーはブラウザに出さない。
// 公開する版では、会話・要約・指摘の本文をログに出さない。出すのは失敗の種類・件数・所要時間だけ（ADR-0007）。

import { Hono } from "hono";
import { checkSummary, maskForbidden } from "../src/board/karte/codeCheck";
import {
  parseAuditRequest,
  parseSummaryRequest,
  type KarteAuditResponse,
  type KarteSummaryResponse,
} from "../src/board/karte/contract";
import { findSample, patientUtterances, plantedSummary } from "../src/board/karte/samples";
import {
  buildAuditMessage,
  KARTE_AUDIT_TIMEOUT_MS,
  makeKarteAuditBackend,
  parseAuditOutput,
  unavailableReason,
  type KarteAuditBackend,
  type KarteAuditConfig,
} from "./karteAudit";
import { makeSummarize, makeTranscriptSummarize, summaryModel, type Summarize, type TranscriptSummarize } from "./karteSummary";
import { parseTranscriptSummaryRequest, transcriptUtterances, type TranscriptSummaryResponse } from "../src/board/karte/transcript";
import { contentLogEnabled, logContent } from "./devlog";
import { checkRateLimit, type RateLimiter } from "./ratelimit";
import { crossSiteRequest } from "./guard";
import { ttsAllowed } from "./tts";

export interface KarteEnv {
  ANTHROPIC_API_KEY?: string;
  PUBLIC_TURN?: string;
  TURN_LIMITER?: RateLimiter;
  /** 監査役のセッションの Environment。掲示板チャット（B-07）のものを使い回す */
  BOARD_CHAT_ENVIRONMENT_ID?: string;
  /** setup スクリプト（setup-karte-audit.ts）で作った監査役の Agent の ID（秘密ではない。wrangler の vars） */
  KARTE_AUDIT_AGENT_ID?: string;
  /** 要約を作るモデルを変えるとき（wrangler の vars）。無ければ karteSummary.ts の既定 */
  KARTE_SUMMARY_MODEL?: string;
  DEV_CONTENT_LOG?: string;
}

/** 要約の入口の本文の上限（見本の ID だけ） */
export const MAX_SUMMARY_BODY_BYTES = 200;
/** 文字起こしの要約の入口の本文の上限（2000字。日本語は1文字3バイト。改行・引用符のエスケープと鍵の分の余裕） */
export const MAX_TRANSCRIPT_BODY_BYTES = 6_400;
/** 監査の入口の本文の上限（要約10項目の text・quote の上限に、形の余裕を足す。日本語は1文字3バイト） */
export const MAX_AUDIT_BODY_BYTES = 16_000;

const AGENT_ID_PATTERN = /^agent_[A-Za-z0-9_]{8,128}$/;
const ENV_ID_PATTERN = /^env_[A-Za-z0-9_]{8,128}$/;

export function karteAuditConfig(env: KarteEnv): KarteAuditConfig | null {
  const environmentId = env.BOARD_CHAT_ENVIRONMENT_ID;
  const agentId = env.KARTE_AUDIT_AGENT_ID;
  if (environmentId === undefined || !ENV_ID_PATTERN.test(environmentId)) return null;
  if (agentId === undefined || !AGENT_ID_PATTERN.test(agentId)) return null;
  return { environmentId, agentId };
}

/**
 * 監査役が使えるか（Issue #244）。監査の入口と同じ条件（Environment と Agent の ID の形、API キー）で決める。
 * 要約の返事に添えて、画面が押す前に「この環境では使えない」と示せるようにする。ID・キーそのものは返さない
 */
export function auditConfigured(env: KarteEnv): boolean {
  const apiKey = env.ANTHROPIC_API_KEY;
  return karteAuditConfig(env) !== null && apiKey !== undefined && apiKey !== "";
}

export interface KarteDeps {
  readBody: (request: Request, maxBytes: number) => Promise<string | null>;
  makeSummarizer?: (apiKey: string, model: string) => Summarize;
  makeTranscriptSummarizer?: (apiKey: string, model: string) => TranscriptSummarize;
  makeAuditBackend?: (apiKey: string, config: KarteAuditConfig, defer: (task: Promise<unknown>) => void) => KarteAuditBackend;
  timeoutMs?: number;
}

export function createKarteApp(deps: KarteDeps) {
  const app = new Hono<{ Bindings: KarteEnv }>();
  const makeSummarizer = deps.makeSummarizer ?? makeSummarize;
  const makeTranscriptSummarizer = deps.makeTranscriptSummarizer ?? makeTranscriptSummarize;
  const makeBackend = deps.makeAuditBackend ?? makeKarteAuditBackend;
  const timeoutMs = deps.timeoutMs ?? KARTE_AUDIT_TIMEOUT_MS;
  const fail = (kind: string) => console.warn(`karte: ${kind}`);

  /** 入口の共通の確かめ（/api/turn・掲示板チャットと同じ条件）。通さないなら応答を返す */
  async function readJson(
    c: { env: KarteEnv; req: { url: string; raw: Request } },
    maxBytes: number,
  ): Promise<{ ok: true; json: unknown } | { ok: false; error: string; status: 400 | 403 | 413 | 503 }> {
    if (!ttsAllowed(c.env, c.req.url)) {
      fail("public_disabled");
      return { ok: false, error: "unavailable", status: 503 };
    }
    if (crossSiteRequest(c.req.raw)) {
      fail("cross_site");
      return { ok: false, error: "forbidden", status: 403 };
    }
    const body = await deps.readBody(c.req.raw, maxBytes);
    if (body === null) return { ok: false, error: "too_large", status: 413 };
    try {
      return { ok: true, json: JSON.parse(body) };
    } catch {
      return { ok: false, error: "bad_request", status: 400 };
    }
  }

  /** お金のかかる呼び出しの直前の関門（ADR-0035）。要約と監査を別々に数える */
  async function rateGate(raw: Request, env: KarteEnv, prefix: string): Promise<"allowed" | "limited" | "closed"> {
    const rate = await checkRateLimit(raw, { enforce: env.PUBLIC_TURN === "1", limiter: env.TURN_LIMITER, prefix });
    if (rate === "allowed") return "allowed";
    fail(rate === "limited" ? `${prefix}_rate_limited` : `${prefix}_rate_limiter_${rate}`);
    return rate === "limited" ? "limited" : "closed";
  }

  app.post("/api/karte/summary", async (c) => {
    const read = await readJson(c, MAX_SUMMARY_BODY_BYTES);
    if (!read.ok) return c.json({ error: read.error }, read.status);
    const request = parseSummaryRequest(read.json);
    const sample = request === null ? undefined : findSample(request.sampleId);
    if (request === null || sample === undefined) return c.json({ error: "bad_request" }, 400);
    const utterances = patientUtterances(sample);

    if (request.planted) {
      // デモ用に誤りを混ぜた固定の要約。AI を呼ばないので、キーも回数制限も要らない
      const summary = plantedSummary(sample);
      const findings = checkSummary(summary, utterances);
      const response: KarteSummaryResponse = {
        sampleId: sample.id,
        source: "planted",
        summary: maskForbidden(summary, findings),
        findings,
        auditConfigured: auditConfigured(c.env),
      };
      return c.json(response);
    }

    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (apiKey === undefined || apiKey === "") {
      fail("no_api_key");
      return c.json({ error: "not_configured" }, 503);
    }
    const rate = await rateGate(c.req.raw, c.env, "kartesum");
    if (rate === "limited") {
      c.header("retry-after", "60");
      return c.json({ error: "rate_limited" }, 429);
    }
    if (rate === "closed") return c.json({ error: "unavailable" }, 503);

    const started = Date.now();
    const result = await makeSummarizer(apiKey, summaryModel(c.env.KARTE_SUMMARY_MODEL))(sample);
    const ms = Date.now() - started;
    if (!result.ok) {
      fail(`summary_${result.failure} ${ms}ms`);
      return c.json({ error: "unavailable" }, 502);
    }
    logContent(contentLogEnabled(c.env.DEV_CONTENT_LOG, c.req.url), "karte summary", JSON.stringify(result.summary));
    const findings = checkSummary(result.summary, utterances);
    // 件数と所要時間だけ（本文は出さない）
    console.info(`karte: summary items=${result.summary.items.length} findings=${findings.length} ${ms}ms`);
    const response: KarteSummaryResponse = {
      sampleId: sample.id,
      source: "model",
      summary: maskForbidden(result.summary, findings),
      findings,
      auditConfigured: auditConfigured(c.env),
    };
    return c.json(response);
  });

  app.post("/api/karte/transcript-summary", async (c) => {
    const read = await readJson(c, MAX_TRANSCRIPT_BODY_BYTES);
    if (!read.ok) return c.json({ error: read.error }, read.status);
    const request = parseTranscriptSummaryRequest(read.json);
    if (request === null) return c.json({ error: "bad_request" }, 400);

    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (apiKey === undefined || apiKey === "") {
      fail("transcript_no_api_key");
      return c.json({ error: "not_configured" }, 503);
    }
    const rate = await rateGate(c.req.raw, c.env, "kartetx");
    if (rate === "limited") {
      c.header("retry-after", "60");
      return c.json({ error: "rate_limited" }, 429);
    }
    if (rate === "closed") return c.json({ error: "unavailable" }, 503);

    const started = Date.now();
    const result = await makeTranscriptSummarizer(apiKey, summaryModel(c.env.KARTE_SUMMARY_MODEL))(request.transcript);
    const ms = Date.now() - started;
    if (!result.ok) {
      fail(`transcript_summary_${result.failure} ${ms}ms`);
      return c.json({ error: "unavailable" }, 502);
    }
    logContent(contentLogEnabled(c.env.DEV_CONTENT_LOG, c.req.url), "karte transcript summary", JSON.stringify(result.summary));
    const findings = checkSummary(result.summary, transcriptUtterances(request.transcript));
    // 件数と所要時間だけ（文字起こし・要約の本文は出さない。ADR-0007）
    console.info(`karte: transcript_summary items=${result.summary.items.length} findings=${findings.length} ${ms}ms`);
    const response: TranscriptSummaryResponse = {
      source: "model",
      summary: maskForbidden(result.summary, findings),
      findings,
      auditConfigured: auditConfigured(c.env),
    };
    return c.json(response);
  });

  app.post("/api/karte/audit", async (c) => {
    const read = await readJson(c, MAX_AUDIT_BODY_BYTES);
    if (!read.ok) return c.json({ error: read.error }, read.status);
    const request = parseAuditRequest(read.json);
    const sample = request === null ? undefined : findSample(request.sampleId);
    if (request === null || sample === undefined) return c.json({ error: "bad_request" }, 400);
    const summary = "planted" in request ? plantedSummary(sample) : request.summary;

    const config = karteAuditConfig(c.env);
    const apiKey = c.env.ANTHROPIC_API_KEY;
    if (config === null || apiKey === undefined || apiKey === "") {
      fail("audit_not_configured");
      const response: KarteAuditResponse = { status: "unavailable", reason: "not_configured", session: "not_created", ms: 0 };
      return c.json(response);
    }
    const rate = await rateGate(c.req.raw, c.env, "karteaudit");
    if (rate === "limited") {
      c.header("retry-after", "60");
      return c.json({ error: "rate_limited" }, 429);
    }
    if (rate === "closed") return c.json({ error: "unavailable" }, 503);

    const defer = (task: Promise<unknown>) => {
      try {
        c.executionCtx.waitUntil(task);
      } catch {
        // 試験など、実行の文脈が無いときは、そのまま走らせる
        void task;
      }
    };
    const message = buildAuditMessage(sample, summary);
    const devLog = contentLogEnabled(c.env.DEV_CONTENT_LOG, c.req.url);
    logContent(devLog, "karte audit prompt", message);
    const started = Date.now();
    const result = await makeBackend(apiKey, config, defer).run(message, timeoutMs);
    const ms = Date.now() - started;
    if (!result.ok) {
      fail(`audit_${result.failure} session=${result.session} ${ms}ms`);
      const response: KarteAuditResponse = { status: "unavailable", reason: unavailableReason(result.failure), session: result.session, ms };
      return c.json(response);
    }
    logContent(devLog, "karte audit output", result.text);
    const findings = parseAuditOutput(result.text, summary);
    if (findings === null) {
      fail(`audit_invalid_output session=${result.session} ${ms}ms`);
      const response: KarteAuditResponse = { status: "unavailable", reason: "invalid_output", session: result.session, ms };
      return c.json(response);
    }
    console.info(`karte: audit findings=${findings.length} session=${result.session} ${ms}ms`);
    const response: KarteAuditResponse = { status: "audited", findings, session: result.session, ms };
    return c.json(response);
  });

  return app;
}
