import { describe, expect, it } from "vitest";
import { auditToResult, requestAudit, requestSummary, sampleForChart, summaryToDraft } from "./client";
import { KARTE_SAMPLES, findSample } from "./samples";

const json = (status: number, body: unknown) => ({
  status,
  headers: { get: (n: string) => (n.toLowerCase() === "content-type" ? "application/json" : null) },
  json: async () => body,
});

describe("カルテの要約・監査の画面の側（Issue #148）", () => {
  it("同じカルテはいつも同じ見本を選ぶ", () => {
    expect(sampleForChart("救護所A|架空 一郎").id).toBe(sampleForChart("救護所A|架空 一郎").id);
    expect(KARTE_SAMPLES.map((s) => s.id)).toContain(sampleForChart("救護所C|x").id);
  });

  it("要約の入口に送るのは見本の ID だけ（planted のときは planted も）。カルテの記録・氏名は送らない", async () => {
    const sent: string[] = [];
    const sample = findSample("karte-03")!;
    const fetchImpl = async (url: string, init: { body: string }) => {
      sent.push(`${url} ${init.body}`);
      return json(200, { sampleId: sample.id, source: "model", summary: sample.expected, findings: [] });
    };
    const draft = await requestSummary(sample.id, false, fetchImpl);
    expect(draft?.source).toBe("extractive");
    expect(draft?.lines).toHaveLength(sample.expected.items.length);
    await requestSummary(sample.id, true, fetchImpl);
    expect(sent).toEqual([`/api/karte/summary {"sampleId":"karte-03"}`, `/api/karte/summary {"sampleId":"karte-03","planted":true}`]);
  });

  it("要約が使えない（503・形が違う・接続できない）ときは null で、画面は固定の見本に戻る", async () => {
    expect(await requestSummary("karte-01", false, async () => json(503, { error: "not_configured" }))).toBeNull();
    expect(await requestSummary("karte-01", false, async () => json(200, { sampleId: "karte-01", summary: { items: "x" } }))).toBeNull();
    expect(
      await requestSummary("karte-01", false, async () => {
        throw new Error("offline");
      }),
    ).toBeNull();
    expect(summaryToDraft({ sampleId: "karte-01", summary: { items: [], not_covered: [] }, findings: [{ kind: "bogus", itemIndex: null, aspect: "location" }] }, false)).toBeNull();
  });

  it("監査：planted の下書きは planted だけを送り、モデルの下書きは要約を送り返す。待ちすぎたら時間切れ", async () => {
    const sample = findSample("karte-01")!;
    const sent: string[] = [];
    const fetchImpl = async (_url: string, init: { body: string }) => {
      sent.push(init.body);
      return json(200, { status: "audited", findings: [], session: "deleted", ms: 1 });
    };
    const planted = summaryToDraft({ sampleId: sample.id, summary: sample.expected, findings: [] }, true)!;
    const model = summaryToDraft({ sampleId: sample.id, summary: sample.expected, findings: [] }, false)!;
    expect(await requestAudit(planted, fetchImpl)).toEqual({ ok: true, findings: [], session: "deleted" });
    await requestAudit(model, fetchImpl);
    expect(JSON.parse(sent[0])).toEqual({ sampleId: sample.id, planted: true });
    expect(JSON.parse(sent[1])).toEqual({ sampleId: sample.id, summary: sample.expected });

    const never = (_u: string, init: { signal?: AbortSignal }) =>
      new Promise<never>((_r, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    expect(await requestAudit(model, never, 10)).toEqual({ ok: false, failure: "timeout" });
    expect(await requestAudit({ source: "sample", lines: [] })).toEqual({ ok: false, failure: "not_configured" });
  });

  it("監査の返事：形の違う指摘は「監査できず」、範囲外の位置は行に結びつけない、理由の種類と後片付けを持つ", () => {
    const summary = findSample("karte-01")!.expected;
    expect(auditToResult({ status: "audited", findings: [{ kind: "made_up", aspect: "location", itemIndex: 0, reason: "x" }], session: "deleted" }, summary)).toEqual({
      ok: false,
      failure: "invalid_output",
      session: "deleted",
    });
    const r = auditToResult({ status: "audited", findings: [{ kind: "omitted", aspect: "proxy", itemIndex: 99, reason: "抜け" }], session: "deleted" }, summary);
    expect(r.ok && r.findings[0].line).toBeUndefined();
    expect(auditToResult({ status: "unavailable", reason: "timeout", session: "pending", ms: 45000 }, summary)).toEqual({
      ok: false,
      failure: "timeout",
      session: "pending",
    });
    expect(auditToResult(null, summary)).toEqual({ ok: false, failure: "invalid_output" });
  });
});
