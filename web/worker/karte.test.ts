// /api/karte/*（カルテの抽出型の要約と2段構えの監査、B-10、Issue #142）の試験。
// Claude も Managed Agents も呼ばず、偽物を使う（docs/safety-test-plan.md の H13〜H15）。

import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, readLimitedText, type Env } from "./app";
import { createKarteApp, karteAuditConfig } from "./karte";
import {
  AUDIT_FIXED_REASONS,
  buildAuditMessage,
  cleanupSession,
  MAX_REASON_LENGTH,
  parseAuditOutput,
  restoreFindings,
  safeReason,
  selectAuditItems,
  type AuditRunResult,
  type KarteAuditBackend,
  type SessionOps,
} from "./karteAudit";
import { KARTE_AUDIT_MODEL, KARTE_AUDIT_SYSTEM_PROMPT, karteAuditAgentDefinition } from "./karteAuditAgent";
import { buildSummaryMessage, KARTE_SUMMARY_MODEL, summaryModel, type Summarize, type SummaryResult } from "./karteSummary";
import { MASKED_TEXT, textForbidden } from "../src/board/karte/codeCheck";
import type { KarteAuditResponse, KarteSummary, KarteSummaryResponse } from "../src/board/karte/contract";
import { findSample, KARTE_SAMPLES, PLANTED_DEMO_SAMPLE_ID, plantedSummary } from "../src/board/karte/samples";

const LOCAL = "http://localhost";
const PUBLIC = "https://sonaquest.example";

const env: Env = {
  ANTHROPIC_API_KEY: "test-key",
  BOARD_CHAT_ENVIRONMENT_ID: "env_0123456789abcdef",
  KARTE_AUDIT_AGENT_ID: "agent_karte0123456789",
};

const sample = findSample(PLANTED_DEMO_SAMPLE_ID)!;

function fakes(
  summarize: () => SummaryResult = () => ({ ok: true, summary: sample.expected, servedBy: KARTE_SUMMARY_MODEL }),
  audit: () => AuditRunResult = () => ({ ok: true, text: '{"findings":[]}', session: "deleted" }),
) {
  const state = { summarized: [] as { id: string; model: string }[], audited: [] as string[] };
  const makeSummarizer = (_key: string, model: string): Summarize => async (s) => {
    state.summarized.push({ id: s.id, model });
    return summarize();
  };
  const makeAuditBackend = (): KarteAuditBackend => ({
    async run(message) {
      state.audited.push(message);
      return audit();
    },
  });
  const app = createKarteApp({ readBody: readLimitedText, makeSummarizer, makeAuditBackend });
  return { state, app };
}

function post(app: { request: ReturnType<typeof createKarteApp>["request"] }, path: string, body: unknown, e: Env = env, base = LOCAL, headers: Record<string, string> = {}) {
  return app.request(
    `${base}/api/karte/${path}`,
    { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } },
    e,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/api/karte/summary", () => {
  it("見本の ID で要約し、1段目の指摘と一緒に返す（会話の本文はブラウザから受け取らない）", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { state, app } = fakes();
    const res = await post(app, "summary", { sampleId: sample.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as KarteSummaryResponse;
    expect(body.source).toBe("model");
    expect(body.findings).toEqual([]);
    expect(state.summarized).toEqual([{ id: sample.id, model: KARTE_SUMMARY_MODEL }]);
  });

  it("モデルの要約に会話にない項目があれば、根拠なしの指摘が付く", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { app } = fakes(() => ({ ok: true, summary: plantedSummary(sample), servedBy: "x" }));
    const body = (await (await post(app, "summary", { sampleId: sample.id })).json()) as KarteSummaryResponse;
    expect(body.findings.map((f) => f.kind)).toEqual(["quote_not_found"]);
  });

  it("禁止表現に当たった項目の text は伏せて返す", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const bad: KarteSummary = {
      ...sample.expected,
      items: sample.expected.items.map((it, i) => (i === 0 ? { ...it, text: "薬局に確認してください" } : it)),
    };
    const { app } = fakes(() => ({ ok: true, summary: bad, servedBy: "x" }));
    const body = (await (await post(app, "summary", { sampleId: sample.id })).json()) as KarteSummaryResponse;
    expect(body.findings.map((f) => f.kind)).toEqual(["forbidden"]);
    expect(body.summary.items[0].text).toBe(MASKED_TEXT);
    expect(JSON.stringify(body)).not.toContain("確認してください");
  });

  it("planted は AI を呼ばずに、誤りを混ぜた固定の要約を返す（キーが無くても）", async () => {
    const { state, app } = fakes();
    const res = await post(app, "summary", { sampleId: sample.id, planted: true }, { ...env, ANTHROPIC_API_KEY: undefined });
    const body = (await res.json()) as KarteSummaryResponse;
    expect(body.source).toBe("planted");
    expect(body.findings).toEqual([{ kind: "quote_not_found", itemIndex: body.summary.items.length - 1, aspect: sample.planted.aspect }]);
    expect(state.summarized).toEqual([]);
  });

  it("10本すべての見本で planted を返すと、根拠なしが必ず付く", async () => {
    const { app } = fakes();
    for (const s of KARTE_SAMPLES) {
      const body = (await (await post(app, "summary", { sampleId: s.id, planted: true })).json()) as KarteSummaryResponse;
      expect(body.findings.some((f) => f.kind === "quote_not_found"), s.id).toBe(true);
    }
  });

  it("形の違う入力・知らない見本・会話の本文を付けた入力は 400、大きすぎる本文は 413", async () => {
    const { state, app } = fakes();
    expect((await post(app, "summary", { sampleId: "karte-99" })).status).toBe(400);
    expect((await post(app, "summary", { sampleId: sample.id, conversation: "本人：..." })).status).toBe(400);
    expect((await post(app, "summary", "{")).status).toBe(400);
    expect((await post(app, "summary", "x".repeat(300))).status).toBe(413);
    expect(state.summarized).toEqual([]);
  });

  it("公開の切り替えなしの公開の宛先は 503、別のサイトは 403", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, app } = fakes();
    expect((await post(app, "summary", { sampleId: sample.id }, env, PUBLIC)).status).toBe(503);
    expect((await post(app, "summary", { sampleId: sample.id }, env, LOCAL, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect(state.summarized).toEqual([]);
  });

  it("回数制限は要約（kartesum）で数え、超えたら 429", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const keys: string[] = [];
    const limiter = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: false }) };
    const { state, app } = fakes();
    const res = await post(app, "summary", { sampleId: sample.id }, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: limiter }, PUBLIC);
    expect(res.status).toBe(429);
    expect(keys[0].startsWith("kartesum:")).toBe(true);
    expect(state.summarized).toEqual([]);
  });

  it("要約の失敗は 502 で、ログは失敗の種類だけ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = fakes(() => ({ ok: false, failure: "invalid" }));
    expect((await post(app, "summary", { sampleId: sample.id })).status).toBe(502);
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([expect.stringMatching(/^karte: summary_invalid \d+ms$/)]);
  });

  it("公開の宛先では、要約の本文をログに出さない（件数と時間だけ）", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { app } = fakes();
    await post(app, "summary", { sampleId: sample.id }, { ...env, PUBLIC_TURN: "1", DEV_CONTENT_LOG: "1", TURN_LIMITER: { limit: async () => ({ success: true }) } }, PUBLIC);
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.join(" "))).join("\n");
    expect(logged).toMatch(/karte: summary items=6 findings=0 \d+ms/);
    for (const item of sample.expected.items) expect(logged).not.toContain(item.quote);
  });
});

describe("/api/karte/audit", () => {
  it("planted を監査役に送り、指摘と削除済みのセッションを返す", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const summary = plantedSummary(sample);
    const index = summary.items.length - 1;
    const { state, app } = fakes(undefined, () => ({
      ok: true,
      text: JSON.stringify({ findings: [{ kind: "not_in_conversation", aspect: "unrecorded", item_index: index, reason: "卵のアレルギーは会話にありません" }] }),
      session: "deleted",
    }));
    const res = await post(app, "audit", { sampleId: sample.id, planted: true });
    const body = (await res.json()) as KarteAuditResponse;
    expect(body).toMatchObject({
      status: "audited",
      session: "deleted",
      findings: [{ kind: "not_in_conversation", aspect: "unrecorded", itemIndex: index, reason: "卵のアレルギーは会話にありません" }],
    });
    expect(state.audited[0]).toBe(buildAuditMessage(sample, summary));
  });

  it("画面から送り返された要約を監査する（形を確かめてから）", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { state, app } = fakes();
    const res = await post(app, "audit", { sampleId: sample.id, summary: sample.expected });
    expect(((await res.json()) as KarteAuditResponse).status).toBe("audited");
    expect(state.audited).toHaveLength(1);
    expect((await post(app, "audit", { sampleId: sample.id, summary: { items: [{ aspect: "x" }], not_covered: [] } })).status).toBe(400);
    expect(state.audited).toHaveLength(1);
  });

  it("Agent の ID が無いときは、Managed Agents を呼ばずに「監査できず（設定なし）」", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { state, app } = fakes();
    const body = (await (await post(app, "audit", { sampleId: sample.id, planted: true }, { ...env, KARTE_AUDIT_AGENT_ID: "" })).json()) as KarteAuditResponse;
    expect(body).toEqual({ status: "unavailable", reason: "not_configured", session: "not_created", ms: 0 });
    expect(state.audited).toEqual([]);
  });

  it("要約の返事に、監査役が使えるか（auditConfigured）だけを添える。ID・キーは返さない（Issue #244）", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { app } = fakes();
    const summaryOf = async (e: Env, planted: boolean) =>
      (await (await post(app, "summary", planted ? { sampleId: sample.id, planted: true } : { sampleId: sample.id }, e)).json()) as KarteSummaryResponse;
    for (const planted of [false, true]) {
      const on = await summaryOf(env, planted);
      expect(on.auditConfigured, `planted=${planted}`).toBe(true);
      expect(JSON.stringify(on)).not.toContain("agent_");
      expect(JSON.stringify(on)).not.toContain("env_");
      expect(JSON.stringify(on)).not.toContain("test-key");
      expect((await summaryOf({ ...env, KARTE_AUDIT_AGENT_ID: "" }, planted)).auditConfigured, `planted=${planted}`).toBe(false);
      expect((await summaryOf({ ...env, KARTE_AUDIT_AGENT_ID: "agent_x" }, planted)).auditConfigured, `planted=${planted}`).toBe(false);
      expect((await summaryOf({ ...env, BOARD_CHAT_ENVIRONMENT_ID: undefined }, planted)).auditConfigured, `planted=${planted}`).toBe(false);
    }
    // 誤りを混ぜた例はキーが無くても返すが、監査役はキーが無いと使えない
    expect((await summaryOf({ ...env, ANTHROPIC_API_KEY: undefined }, true)).auditConfigured).toBe(false);
  });

  it("時間切れは「監査できず」で、後片付けは続いている（pending）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = fakes(undefined, () => ({ ok: false, failure: "timeout", session: "pending" }));
    const body = (await (await post(app, "audit", { sampleId: sample.id, planted: true })).json()) as KarteAuditResponse;
    expect(body).toMatchObject({ status: "unavailable", reason: "timeout", session: "pending" });
  });

  it("監査役の出力が JSON でなければ「監査できず」", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = fakes(undefined, () => ({ ok: true, text: "問題はありません。", session: "deleted" }));
    const body = (await (await post(app, "audit", { sampleId: sample.id, planted: true })).json()) as KarteAuditResponse;
    expect(body).toMatchObject({ status: "unavailable", reason: "invalid_output", session: "deleted" });
  });

  it("回数制限は監査（karteaudit）で数える", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const keys: string[] = [];
    const limiter = { limit: async ({ key }: { key: string }) => (keys.push(key), { success: false }) };
    const { state, app } = fakes();
    const res = await post(app, "audit", { sampleId: sample.id, planted: true }, { ...env, PUBLIC_TURN: "1", TURN_LIMITER: limiter }, PUBLIC);
    expect(res.status).toBe(429);
    expect(keys[0].startsWith("karteaudit:")).toBe(true);
    expect(state.audited).toEqual([]);
  });

  it("公開の宛先では、会話・要約・指摘の本文をログに出さない", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { app } = fakes(undefined, () => ({
      ok: true,
      text: JSON.stringify({ findings: [{ kind: "not_in_conversation", aspect: "unrecorded", item_index: 6, reason: "卵のアレルギーは会話にありません" }] }),
      session: "deleted",
    }));
    await post(app, "audit", { sampleId: sample.id, planted: true }, { ...env, PUBLIC_TURN: "1", DEV_CONTENT_LOG: "1", TURN_LIMITER: { limit: async () => ({ success: true }) } }, PUBLIC);
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => c.join(" "))).join("\n");
    expect(logged).toMatch(/karte: audit findings=1 excluded=0 session=deleted \d+ms/);
    expect(logged).not.toContain("卵");
    expect(logged).not.toContain("お薬手帳");
  });

  it("app.ts からも /api/karte/* に届く", async () => {
    const app = createApp(undefined, undefined, undefined, { makeAuditBackend: () => ({ run: async () => ({ ok: true, text: '{"findings":[]}', session: "deleted" }) }) });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const res = await app.request(`${LOCAL}/api/karte/audit`, { method: "POST", body: JSON.stringify({ sampleId: sample.id, planted: true }), headers: { "Content-Type": "application/json" } }, env);
    expect(((await res.json()) as KarteAuditResponse).status).toBe("audited");
  });
});

describe("監査の入口で、画面から来た要約を確かめ直す（Issue #287）", () => {
  // karte-01 の正解の要約（6項目）の、決まった位置の項目を差し替えた要約
  const withItems = (replace: Record<number, Partial<KarteSummary["items"][number]>>): KarteSummary => ({
    ...sample.expected,
    items: sample.expected.items.map((item, i) => (i in replace ? { ...item, ...replace[i] } : item)),
  });
  const sentItems = (message: string): KarteSummary => {
    const line = message.split("\n").find((l) => l.startsWith('{"items"'));
    return JSON.parse(line!) as KarteSummary;
  };

  it("1段目の指摘のある項目（根拠なし・短すぎる引用・引用に無い数・禁止表現・長さ）と伏せた文の項目は、監査役に送らない", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const summary = withItems({
      0: { quote: "家の台所の引き出しに車の鍵があります" }, // quote_not_found
      1: { quote: "スマホ" }, // quote_too_short
      2: { text: "架空の降圧薬Aを朝に12錠" }, // text_adds_terms（quote は「1錠」）
      3: { text: MASKED_TEXT, quote: MASKED_TEXT }, // 伏せた文
      4: { text: "痛み止めは飲んでください" }, // forbidden
    });
    const { state, app } = fakes();
    const body = (await (await post(app, "audit", { sampleId: sample.id, summary })).json()) as KarteAuditResponse;
    expect(body.status).toBe("audited");
    expect(state.audited).toHaveLength(1);
    const sent = sentItems(state.audited[0]);
    expect(sent.items).toEqual([sample.expected.items[5]]);
    expect(sent.not_covered).toEqual(sample.expected.not_covered);
    for (const t of ["車の鍵", "12錠", MASKED_TEXT, "飲んでください"]) expect(state.audited[0]).not.toContain(t);
  });

  it("長すぎる text の項目も送らない", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { state, app } = fakes();
    await post(app, "audit", { sampleId: sample.id, summary: withItems({ 0: { text: "お".repeat(61) } }) });
    expect(sentItems(state.audited[0]).items).toEqual(sample.expected.items.slice(1));
  });

  it("指摘の位置を、もとの要約の位置に戻す。外した項目の観点の「落ちている」は捨てる", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    // 0（location）と 2（current）を外す → 送るのは もとの 1, 3, 4, 5
    const summary = withItems({ 0: { quote: "車の中にあります" }, 2: { text: "架空の降圧薬Bを朝に1錠" } });
    const { app } = fakes(undefined, () => ({
      ok: true,
      text: JSON.stringify({
        findings: [
          { kind: "meaning_changed", aspect: "unrecorded", item_index: 2, reason: "歯医者のことの意味が変わっています" },
          { kind: "omitted", aspect: "location", item_index: null, reason: "手帳の場所が落ちています" },
          { kind: "omitted", aspect: "alternative", item_index: null, reason: "写真のことが落ちています" },
        ],
      }),
      session: "deleted",
    }));
    const body = (await (await post(app, "audit", { sampleId: sample.id, summary })).json()) as KarteAuditResponse;
    expect(body).toMatchObject({
      status: "audited",
      findings: [
        { kind: "meaning_changed", aspect: "unrecorded", itemIndex: 4, reason: "歯医者のことの意味が変わっています" },
        { kind: "omitted", aspect: "alternative", itemIndex: null, reason: "写真のことが落ちています" },
      ],
    });
  });

  it("送る項目が1つも残らないときは、監査役を呼ばない（セッションを作らない）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const summary: KarteSummary = { items: [{ aspect: "location", text: "車の鍵", quote: "車の鍵があります" }], not_covered: ["alternative", "current", "unrecorded", "proxy"] };
    const { state, app } = fakes();
    const body = (await (await post(app, "audit", { sampleId: sample.id, summary })).json()) as KarteAuditResponse;
    expect(body).toEqual({ status: "unavailable", reason: "failed", session: "not_created", ms: 0 });
    expect(state.audited).toEqual([]);
    const logged = warn.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).toContain("karte: audit_no_items excluded=1");
    expect(logged).not.toContain("車の鍵");
  });

  it("もとから items が空の要約（5観点すべてが not_covered）は、今までどおり監査役に送る", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const summary: KarteSummary = { items: [], not_covered: ["location", "alternative", "current", "unrecorded", "proxy"] };
    const { state, app } = fakes();
    const body = (await (await post(app, "audit", { sampleId: sample.id, summary })).json()) as KarteAuditResponse;
    expect(body.status).toBe("audited");
    expect(state.audited).toEqual([buildAuditMessage(sample, summary)]);
  });

  it("planted は、誤りを混ぜた項目も外さずに監査役に送る", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    for (const s of KARTE_SAMPLES) {
      const { state, app } = fakes();
      await post(app, "audit", { sampleId: s.id, planted: true });
      expect(state.audited, s.id).toEqual([buildAuditMessage(s, plantedSummary(s))]);
    }
  });

  it("正解の要約は、10本すべてで1項目も外さずに送る", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    for (const s of KARTE_SAMPLES) {
      const { state, app } = fakes();
      await post(app, "audit", { sampleId: s.id, summary: s.expected });
      expect(state.audited, s.id).toEqual([buildAuditMessage(s, s.expected)]);
    }
  });
});

describe("監査役の項目の選び方と位置の戻し", () => {
  it("項目ごとの指摘だけで外し、観点の指摘（itemIndex が null）では外さない", () => {
    const selection = selectAuditItems(sample.expected, [
      { kind: "aspect_missing", itemIndex: null, aspect: "proxy" },
      { kind: "quote_not_found", itemIndex: 1, aspect: "alternative" },
    ]);
    expect(selection.kept).toEqual([0, 2, 3, 4, 5]);
    expect(selection.excluded).toBe(1);
    expect([...selection.excludedAspects]).toEqual(["alternative"]);
    expect(
      restoreFindings(
        [
          { kind: "not_in_conversation", aspect: "current", itemIndex: 1, reason: "x" },
          { kind: "omitted", aspect: "alternative", itemIndex: null, reason: "x" },
          { kind: "omitted", aspect: "proxy", itemIndex: null, reason: "x" },
        ],
        selection,
      ),
    ).toEqual([
      { kind: "not_in_conversation", aspect: "current", itemIndex: 2, reason: "x" },
      { kind: "omitted", aspect: "proxy", itemIndex: null, reason: "x" },
    ]);
  });
});

describe("監査役の出力の扱い", () => {
  const summary = plantedSummary(sample);
  const sent = buildAuditMessage(sample, summary);

  it("コードの囲みを外して読み、知らない種類・観点・範囲外の位置は捨てる", () => {
    const raw =
      "```json\n" +
      JSON.stringify({
        findings: [
          { kind: "not_in_conversation", aspect: "unrecorded", item_index: 6, reason: "会話にありません" },
          { kind: "medical_error", aspect: "current", item_index: 2, reason: "x" },
          { kind: "omitted", aspect: "medicine", item_index: null, reason: "x" },
          { kind: "meaning_changed", aspect: "current", item_index: 99, reason: "x" },
          { kind: "omitted", aspect: "alternative", item_index: null, reason: "写真のことが落ちています" },
        ],
      }) +
      "\n```";
    expect(parseAuditOutput(raw, summary, sent)).toEqual([
      { kind: "not_in_conversation", aspect: "unrecorded", itemIndex: 6, reason: "会話にありません" },
      { kind: "omitted", aspect: "alternative", itemIndex: null, reason: "写真のことが落ちています" },
    ]);
  });

  it("JSON でない・findings が無いときは null", () => {
    expect(parseAuditOutput("問題ありません", summary, sent)).toBeNull();
    expect(parseAuditOutput('{"result":[]}', summary, sent)).toBeNull();
    expect(parseAuditOutput("[]", summary, sent)).toBeNull();
  });

  it("指摘があるのに1つも形が合わないときは null（指摘0件の監査済みと見分ける）", () => {
    expect(parseAuditOutput('{"findings":[{"kind":"meaning_change","aspect":"current","item_index":0}]}', summary, sent)).toBeNull();
    expect(parseAuditOutput('{"findings":[]}', summary, sent)).toEqual([]);
  });

  it("理由の文が助言・診断に見える・長すぎるときは、種類ごとの固定文に替える", () => {
    expect(safeReason("meaning_changed", "量は2錠に増やしてください", sent)).toBe(AUDIT_FIXED_REASONS.meaning_changed);
    expect(safeReason("advice_or_diagnosis", "高血圧の可能性があります", sent)).toBe(AUDIT_FIXED_REASONS.advice_or_diagnosis);
    expect(safeReason("omitted", 3, sent)).toBe(AUDIT_FIXED_REASONS.omitted);
    expect(safeReason("omitted", "娘のことが落ちています", sent)).toBe("娘のことが落ちています");
  });

  it("理由の文の上限は、監査役の system prompt と同じ60字（Issue #287）", () => {
    expect(MAX_REASON_LENGTH).toBe(60);
    expect(KARTE_AUDIT_SYSTEM_PROMPT).toContain(`${MAX_REASON_LENGTH}字以内`);
    expect(safeReason("omitted", "あ".repeat(60), sent)).toBe("あ".repeat(60));
    expect(safeReason("omitted", "あ".repeat(61), sent)).toBe(AUDIT_FIXED_REASONS.omitted);
  });

  it("送った文（会話の見本と要約）に無い数・漢数字・カタカナ・英字を書いた理由の文は、固定文に替える（Issue #287）", () => {
    // 会話にも要約にも無い名前（架空の名前）・量
    expect(safeReason("not_in_conversation", "ソナクエミンの名前が会話にありません", sent)).toBe(AUDIT_FIXED_REASONS.not_in_conversation);
    expect(safeReason("meaning_changed", "量が5mgに変わっています", sent)).toBe(AUDIT_FIXED_REASONS.meaning_changed);
    expect(safeReason("meaning_changed", "本人は三錠と言っています", sent)).toBe(AUDIT_FIXED_REASONS.meaning_changed);
    // 会話の「1錠」の「1」は、理由の文の「12」の根拠にしない
    expect(safeReason("meaning_changed", "本人は12錠と言っています", sent)).toBe(AUDIT_FIXED_REASONS.meaning_changed);
  });

  it("送った文にある薬の名前・数や、欄の名前・観点の ID だけを挙げた理由の文は、そのまま出す（Issue #287）", () => {
    for (const reason of [
      "会話では降圧薬Aを朝に1錠です",
      "卵のアレルギーは会話にありません",
      "要約の text が quote と違います",
      "item_index の項目は current の観点です",
      "not_covered に proxy があります",
      "omitted として、スマホの写真のことを挙げます",
    ]) {
      expect(safeReason("meaning_changed", reason, sent), reason).toBe(reason);
    }
  });

  it("固定文そのものも、理由の文の検査を通る", () => {
    for (const reason of Object.values(AUDIT_FIXED_REASONS)) expect(textForbidden(reason), reason).toBe(false);
  });
});

describe("セッションの後片付け", () => {
  function ops(statuses: string[], deleteFailsWhileRunning = true) {
    const calls: string[] = [];
    let current = "running";
    const o: SessionOps = {
      async delete() {
        calls.push(`delete:${current}`);
        if (deleteFailsWhileRunning && current === "running") throw new Error("running");
      },
      async interrupt() {
        calls.push("interrupt");
      },
      async status() {
        current = statuses.shift() ?? current;
        calls.push(`status:${current}`);
        return current;
      },
      sleep: async () => {},
    };
    return { o, calls };
  }

  it("動いているセッションは、中断を送り、止まってから削除する", async () => {
    const { o, calls } = ops(["running", "idle"]);
    expect(await cleanupSession(o, "sesn_x")).toBe("deleted");
    expect(calls).toEqual(["delete:running", "interrupt", "status:running", "status:idle", "delete:idle"]);
  });

  it("止まっていればすぐ削除する", async () => {
    const { o, calls } = ops([], false);
    expect(await cleanupSession(o, "sesn_x")).toBe("deleted");
    expect(calls).toEqual(["delete:running"]);
  });

  it("止まらなければ failed", async () => {
    const { o } = ops([]);
    expect(await cleanupSession(o, "sesn_x")).toBe("failed");
  });
});

describe("設定と定義", () => {
  it("要約のモデルと監査役のモデルは別", () => {
    expect(KARTE_SUMMARY_MODEL).not.toBe(KARTE_AUDIT_MODEL.id);
  });

  it("要約のモデルは vars で変えられ、形が違えば既定に戻る", () => {
    expect(summaryModel(undefined)).toBe(KARTE_SUMMARY_MODEL);
    expect(summaryModel("claude-haiku-5-5")).toBe("claude-haiku-5-5");
    expect(summaryModel("gpt; drop")).toBe(KARTE_SUMMARY_MODEL);
  });

  it("監査役の ID と Environment の ID の形を確かめる", () => {
    expect(karteAuditConfig(env)).toEqual({ environmentId: "env_0123456789abcdef", agentId: "agent_karte0123456789" });
    expect(karteAuditConfig({ ...env, KARTE_AUDIT_AGENT_ID: "agent_x" })).toBeNull();
    expect(karteAuditConfig({ ...env, BOARD_CHAT_ENVIRONMENT_ID: undefined })).toBeNull();
  });

  it("監査役の Agent はツールを持たず、医学的な正しさを判断しないと system prompt に書く", () => {
    const def = karteAuditAgentDefinition();
    expect("tools" in def).toBe(false);
    expect(KARTE_AUDIT_SYSTEM_PROMPT).toContain("医学的に正しいか");
    expect(KARTE_AUDIT_SYSTEM_PROMPT).toContain("判断せず");
    for (const kind of ["omitted", "meaning_changed", "not_in_conversation", "advice_or_diagnosis"]) {
      expect(KARTE_AUDIT_SYSTEM_PROMPT).toContain(kind);
    }
  });

  it("要約のモデルと監査役に送る文は、見本の会話と要約だけ", () => {
    const summaryMessage = buildSummaryMessage(sample);
    for (const t of sample.turns) expect(summaryMessage).toContain(t.text);
    expect(buildAuditMessage(sample, sample.expected)).toContain(JSON.stringify(sample.expected));
  });
});
