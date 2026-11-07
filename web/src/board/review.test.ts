import { describe, expect, it } from "vitest";
import { INTAKE_RECORDS } from "./data";
import { applyAuditResult, chartsFor, demoReducer, initialDemo, type DemoState } from "./demo";
import { auditResultAfterStop, awaitingHuman, chartSite, confirmable, discardable, sampleAudit, sampleDraft, unresolvedCodeFindings, type ChartSummaryDraft } from "./review";

const A = { site: "救護所A" as const, staff: "見本 青葉" };
const B = { site: "救護所B" as const, staff: "見本 若葉" };

function withChart(): { state: DemoState; key: string } {
  const state = demoReducer(initialDemo(), {
    type: "add_record",
    site: "救護所A",
    name: "架空 太郎",
    items: [{ label: "薬の名前（架空）", value: "架空の錠剤" }],
    prescription: null,
  });
  const key = chartsFor(state, INTAKE_RECORDS).find((c) => c.site === "救護所A" && c.name === "架空 太郎")!.key;
  return { state, key };
}

describe("カルテの確認状態（Issue #141）", () => {
  it("AI下書き → AI監査中 → 監査済み → 人が確認済み と進み、誰がいつ確認したかを持つ", () => {
    let { state, key } = withChart();
    expect(state.chartReview[key]).toBeUndefined();
    state = demoReducer(state, { type: "chart_draft", key, actor: A });
    expect(state.chartReview[key].status).toBe("ai_draft");
    expect(awaitingHuman(state.chartReview[key])).toBe(true);
    // 下書きのままでは確認済みにできない
    expect(demoReducer(state, { type: "chart_confirm", key, actor: A }).chartReview[key].status).toBe("ai_draft");
    state = demoReducer(state, { type: "chart_audit_start", key, actor: A });
    expect(state.chartReview[key].status).toBe("ai_auditing");
    state = demoReducer(state, { type: "chart_audit_result", key, result: { ok: true, findings: [] } });
    expect(state.chartReview[key].status).toBe("audited");
    // 指摘なしでも、人が確認するまで確認待ち
    expect(awaitingHuman(state.chartReview[key])).toBe(true);
    state = demoReducer(demoReducer(state, { type: "tick", hours: 1 }), { type: "chart_confirm", key, actor: A });
    const r = state.chartReview[key];
    expect(r.status).toBe("human_confirmed");
    expect(r.confirmedBy).toEqual({ site: "救護所A", staff: "見本 青葉" });
    expect(r.confirmedAt).toBe(60);
    expect(r.auditedAs).toBe("audited");
    expect(awaitingHuman(r)).toBe(false);
  });

  it("AI を止めた状態でも、監査できず → 人が確認済み と進める", () => {
    let { state, key } = withChart();
    state = demoReducer(state, { type: "chart_draft", key, actor: A });
    state = demoReducer(state, { type: "chart_audit_start", key, actor: A });
    state = demoReducer(state, { type: "chart_audit_result", key, result: sampleAudit(key, true) });
    expect(state.chartReview[key].status).toBe("audit_unavailable");
    expect(state.chartReview[key].auditFailure).toBe("ai_stopped");
    state = demoReducer(state, { type: "chart_confirm", key, actor: A });
    expect(state.chartReview[key].status).toBe("human_confirmed");
    expect(state.chartReview[key].auditedAs).toBe("audit_unavailable");
  });

  it("ほかの救護所でログインしている人は、下書き・監査・確認のどれもできない", () => {
    let { state, key } = withChart();
    expect(demoReducer(state, { type: "chart_draft", key, actor: B })).toBe(state);
    state = demoReducer(state, { type: "chart_draft", key, actor: A });
    expect(demoReducer(state, { type: "chart_audit_start", key, actor: B })).toBe(state);
    state = demoReducer(state, { type: "chart_audit_start", key, actor: A });
    state = applyAuditResult(state, key, { ok: true, findings: [{ where: "x", kind: "会話にない内容", reason: "y" }] });
    expect(state.chartReview[key].findings).toHaveLength(1);
    expect(demoReducer(state, { type: "chart_confirm", key, actor: B }).chartReview[key].status).toBe("audited");
  });

  it("監査中でないときに届いた監査の結果は捨てる", () => {
    let { state, key } = withChart();
    expect(applyAuditResult(state, key, { ok: true, findings: [] })).toBe(state);
    state = demoReducer(state, { type: "chart_draft", key, actor: A });
    expect(applyAuditResult(state, key, { ok: true, findings: [] })).toBe(state);
  });

  it("同じカルテに記録が加わると、前の下書き・確認は外れる", () => {
    let { state, key } = withChart();
    state = demoReducer(state, { type: "chart_draft", key, actor: A });
    state = demoReducer(state, {
      type: "add_record",
      site: "救護所A",
      name: "架空 太郎",
      items: [{ label: "薬の名前（架空）", value: "架空の錠剤" }],
      prescription: null,
    });
    expect(state.chartReview[key]).toBeUndefined();
  });

  it("見本の下書きは固定の文で、患者の記録の値を含まない。誤りを混ぜた見本にだけ指摘が出る", () => {
    const keys = ["救護所A|架空 太郎", "救護所A|架空 花子", "救護所B|#B-001", "救護所C|仮名 一郎"];
    const drafts = keys.map((k) => sampleDraft(k));
    for (const d of drafts) for (const l of d.lines) expect(l.text).not.toContain("架空の錠剤");
    const findings = keys.map((k) => sampleAudit(k, false));
    for (const f of findings) expect(f.ok).toBe(true);
    // 見本の2つの例（指摘なし・指摘あり）がどちらも出る
    const counts = new Set(findings.map((f) => (f.ok ? f.findings.length : -1)));
    expect(counts.has(0) && counts.has(1)).toBe(true);
  });

  it("カルテの key から救護所を取り出す", () => {
    expect(chartSite("救護所B|架空 花子")).toBe("救護所B");
    expect(chartSite("本部備蓄|x")).toBeNull();
  });

  it("監査役の成功の結果が、AI を止めた後に届いたら「監査できず」にする（後片付けの状態は残す。PR #150 のレビュー）", () => {
    const ok = { ok: true as const, findings: [], session: "deleted" as const };
    expect(auditResultAfterStop(ok, false)).toBe(ok);
    expect(auditResultAfterStop(ok, true)).toEqual({ ok: false, failure: "ai_stopped", session: "deleted" });
    expect(auditResultAfterStop({ ok: true, findings: [] }, true)).toEqual({ ok: false, failure: "ai_stopped" });
    const { state, key } = withChart();
    let s = demoReducer(state, { type: "chart_draft", key, actor: A });
    s = demoReducer(s, { type: "chart_audit_start", key, actor: A });
    s = applyAuditResult(s, key, auditResultAfterStop(ok, true));
    expect(s.chartReview[key].status).toBe("audit_unavailable");
    expect(s.chartReview[key].session).toBe("deleted");
  });
});

describe("コードでの確認の指摘が残る下書き（Issue #253）", () => {
  // 誤りを混ぜた例のように、1段目のコードでの確認が「会話にない引用」を見つけた下書き
  const flagged: ChartSummaryDraft = {
    source: "extractive",
    lines: [{ label: "情報の在りか", text: "お薬手帳は車の中にある", quote: "お薬手帳は車の中にある" }],
    planted: true,
    codeFindings: [{ where: "情報の在りか", kind: "根拠なし", reason: "引用が会話の本人の発言に見つかりません", line: 0 }],
    unsupportedLines: [0],
    auditConfigured: false,
  };
  const clean: ChartSummaryDraft = { ...flagged, planted: false, codeFindings: [], unsupportedLines: [] };

  function audited(draft: ChartSummaryDraft, result: Parameters<typeof applyAuditResult>[2]) {
    const { state, key } = withChart();
    let s = demoReducer(state, { type: "chart_draft", key, actor: A, draft });
    s = demoReducer(s, { type: "chart_audit_start", key, actor: A });
    return { s: applyAuditResult(s, key, result), key };
  }

  it("監査できず（監査なしで進めた）でも、指摘が残る間は確認済みにできない", () => {
    const { s, key } = audited(flagged, { ok: false, failure: "not_configured", session: "not_created" });
    const r = s.chartReview[key];
    expect(r.status).toBe("audit_unavailable");
    expect(unresolvedCodeFindings(r)).toBe(true);
    expect(confirmable(r)).toBe(false);
    expect(demoReducer(s, { type: "chart_confirm", key, actor: A }).chartReview[key].status).toBe("audit_unavailable");
  });

  it("監査済み（指摘なし）でも、コードでの確認の指摘が残る間は確認済みにできない", () => {
    const { s, key } = audited(flagged, { ok: true, findings: [] });
    expect(s.chartReview[key].status).toBe("audited");
    expect(confirmable(s.chartReview[key])).toBe(false);
    expect(demoReducer(s, { type: "chart_confirm", key, actor: A }).chartReview[key].status).toBe("audited");
  });

  it("指摘のない下書きは、今までどおり確認済みにできる（codeFindings が無い見本の下書きも同じ）", () => {
    const { s, key } = audited(clean, { ok: false, failure: "not_configured" });
    expect(confirmable(s.chartReview[key])).toBe(true);
    expect(discardable(s.chartReview[key])).toBe(false);
    expect(demoReducer(s, { type: "chart_confirm", key, actor: A }).chartReview[key].status).toBe("human_confirmed");
    const sample = audited(sampleDraft("x"), { ok: true, findings: [] });
    expect(confirmable(sample.s.chartReview[sample.key])).toBe(true);
  });

  it("指摘のある下書きは差し戻せる。差し戻すと下書きなしに戻り、作り直せる", () => {
    const { s, key } = audited(flagged, { ok: false, failure: "not_configured" });
    expect(discardable(s.chartReview[key])).toBe(true);
    const back = demoReducer(s, { type: "chart_discard", key, actor: A });
    expect(back.chartReview[key]).toBeUndefined();
    const again = demoReducer(back, { type: "chart_draft", key, actor: A, draft: clean });
    expect(again.chartReview[key].status).toBe("ai_draft");
  });

  it("差し戻しは、下書きのとき（監査の前）もできる。監査中・ほかの救護所の人・指摘のない下書きは差し戻せない", () => {
    const { state, key } = withChart();
    const drafted = demoReducer(state, { type: "chart_draft", key, actor: A, draft: flagged });
    expect(demoReducer(drafted, { type: "chart_discard", key, actor: A }).chartReview[key]).toBeUndefined();
    expect(demoReducer(drafted, { type: "chart_discard", key, actor: B })).toBe(drafted);
    const auditing = demoReducer(drafted, { type: "chart_audit_start", key, actor: A });
    expect(discardable(auditing.chartReview[key])).toBe(false);
    expect(demoReducer(auditing, { type: "chart_discard", key, actor: A })).toBe(auditing);
    const ok = audited(clean, { ok: true, findings: [] });
    expect(demoReducer(ok.s, { type: "chart_discard", key: ok.key, actor: A })).toBe(ok.s);
  });
});
