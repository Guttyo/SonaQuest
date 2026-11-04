// 比較実験の実行（docs/evidence.md）。手元の Workers（wrangler dev）に、cases.mjs の問い合わせを送る。
// 本物の Claude API を呼ぶので課金が発生する。オーナーの承認を得てから動かす。
//
// 1. 別のターミナルで、比較するモデルを指定して Workers を動かす（DEV_EXPERIMENT は手元だけで効く）
//      npx --prefix web wrangler dev --port 8787 --var DEV_EXPERIMENT:1 --var DEV_MODEL:claude-haiku-5-5
// 2. node web/experiments/run.mjs --label haiku-low [--only J1,S8] [--show-text]
//    監査役（ADR-0030）を外して比べるときは、Workers に --var DEV_AUDIT:off も付ける
//
// 結果は web/experiments/results/<label>.json に、測った値だけを書く（Claude の文は書かない。
// 文は --show-text のときに画面に出すだけ）。

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases.mjs";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const label = opt("--label") ?? "run";
const only = opt("--only")?.split(",");
const showText = args.includes("--show-text");
const endpoint = opt("--endpoint") ?? "http://127.0.0.1:8787/api/turn";

/** 100万トークンあたりの料金（ドル。2026-10 時点の参照資料。見積もりに使う） */
const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

function cost(model, usage) {
  const p = PRICES[model];
  if (p === undefined || usage === undefined) return 0;
  return (
    (usage.input * p.input + usage.output * p.output + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite) /
    1_000_000
  );
}

/** 緊急（症状・自傷）の返事か。画面は文を使わずに中断の案内を出す（web/src/flow/training.ts） */
const isEmergency = (row) => row.got !== null && row.got.emergency !== "none";

const results = [];
for (const c of CASES.filter((x) => only === undefined || only.includes(x.id))) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(c.request),
  });
  const header = response.headers.get("x-dev-metrics");
  const metrics = header === null ? null : JSON.parse(decodeURIComponent(header));
  if (metrics === null) {
    console.error("x-dev-metrics が無い。Workers を DEV_EXPERIMENT:1 で動かしているか確かめる");
    process.exit(1);
  }
  const body = response.ok ? await response.json() : null;
  const checks = {};
  if (body !== null && c.expect.viewpoints !== undefined) {
    for (const [v, want] of Object.entries(c.expect.viewpoints)) checks[`viewpoint.${v}`] = body.viewpoints[v] === want;
  }
  if (body !== null && c.expect.emergency !== undefined) checks.emergency = body.emergency === c.expect.emergency;
  if (body !== null && c.expect.recall !== undefined) checks.recall = body.recall === c.expect.recall;
  if (body !== null && c.expect.next !== undefined) checks.next = c.expect.next.includes(body.next.type);
  const row = {
    id: c.id,
    kind: c.kind,
    ok: response.ok,
    failure: metrics.failure ?? null,
    servedBy: metrics.servedBy ?? null,
    ms: metrics.ms,
    usage: metrics.usage ?? null,
    costUsd: cost(metrics.servedBy ?? metrics.model, metrics.usage) + cost(metrics.audit?.servedBy ?? "claude-haiku-5-5", metrics.audit?.usage ?? undefined),
    hadText: metrics.claudeText !== null && metrics.claudeText !== undefined,
    textRejected: metrics.textRejected ?? null,
    rejectReason: metrics.rejectReason ?? null,
    // 監査役の結果（判定・理由の種類・失敗の種類・時間）。本文は含まない
    audit:
      metrics.audit === null || metrics.audit === undefined
        ? null
        : { ms: metrics.audit.ms, pass: metrics.audit.pass, category: metrics.audit.category, failure: metrics.audit.failure },
    got: body === null ? null : { emergency: body.emergency, recall: body.recall, next: body.next.type, viewpoints: body.viewpoints },
    checks,
  };
  results.push({ ...row, model: metrics.model });
  const passed = Object.values(checks).filter(Boolean).length;
  console.log(
    `${c.id.padEnd(4)} ${String(metrics.ms).padStart(5)}ms ${row.ok ? "ok " : "NG "} checks ${passed}/${Object.keys(checks).length}` +
      ` text:${!row.hadText ? "none" : row.textRejected ? "rejected" : isEmergency(row) ? "passed(emergency)" : "shown"}` +
      (row.rejectReason ? ` reason:${row.rejectReason}` : "") +
      (row.audit ? ` audit:${row.audit.failure ?? (row.audit.pass ? "pass" : row.audit.category)} ${row.audit.ms}ms` : "") +
      (metrics.failure ? ` failure:${metrics.failure}` : ""),
  );
  if (showText && metrics.claudeText) console.log(`      ${metrics.claudeText}`);
}

const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const allChecks = results.flatMap((r) => Object.values(r.checks));
const judgeChecks = results.filter((r) => r.kind === "judge").flatMap((r) => Object.values(r.checks));
const behaveChecks = results.filter((r) => r.kind === "behave").flatMap((r) => Object.values(r.checks));
const withText = results.filter((r) => r.hadText);
const shownCandidates = withText.filter((r) => !isEmergency(r));
const audited = results.filter((r) => r.audit !== null);
const auditMs = audited.map((r) => r.audit.ms).sort((a, b) => a - b);
const summary = {
  label,
  model: results[0]?.model ?? null,
  calls: results.length,
  failures: results.filter((r) => !r.ok).length,
  fallbacks: results.filter((r) => r.servedBy !== null && r.servedBy !== r.model).length,
  msMedian: ms[Math.floor(ms.length / 2)] ?? null,
  msMax: ms[ms.length - 1] ?? null,
  judgeAgreement: `${judgeChecks.filter(Boolean).length}/${judgeChecks.length}`,
  behaveAgreement: `${behaveChecks.filter(Boolean).length}/${behaveChecks.length}`,
  allAgreement: `${allChecks.filter(Boolean).length}/${allChecks.length}`,
  // 検査（と監査役）を通った文。緊急の件も含む
  textPassed: `${withText.filter((r) => !r.textRejected).length}/${withText.length}`,
  // 画面に出る文。緊急の件は画面が文を使わずに中断の案内を出す（training.ts）ので除く。
  // Issue #40 より前の結果ファイル（haiku-5-5-low.json など）の textShown は、今の textPassed と同じ意味
  textShown: `${shownCandidates.filter((r) => !r.textRejected).length}/${shownCandidates.length}`,
  auditCalls: audited.length,
  auditBlocked: audited.filter((r) => r.audit.pass === false).length,
  auditFailed: audited.filter((r) => r.audit.failure !== null).length,
  auditMsMedian: auditMs[Math.floor(auditMs.length / 2)] ?? null,
  auditMsMax: auditMs[auditMs.length - 1] ?? null,
  costUsd: Number(results.reduce((s, r) => s + r.costUsd, 0).toFixed(4)),
};
console.log(JSON.stringify(summary, null, 2));

const dir = join(dirname(fileURLToPath(import.meta.url)), "results");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${label}.json`), JSON.stringify({ summary, results }, null, 2) + "\n");
