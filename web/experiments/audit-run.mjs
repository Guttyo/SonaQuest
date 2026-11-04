// 監査役の比較実験の実行（ADR-0030 の実験。docs/evidence.md）。本物の Claude API を呼ぶので課金が発生する。
//
// 1. 別のターミナルで、監査役のモデルを指定して Workers を動かす（DEV_EXPERIMENT は手元だけで効く）
//      npx --prefix web wrangler dev --port 8787 --var DEV_EXPERIMENT:1 --var DEV_MODEL:claude-haiku-5-5
// 2. node web/experiments/audit-run.mjs --label audit-haiku
//
// 結果は web/experiments/results/<label>.json に、判定と測った値だけを書く。

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIT_CASES } from "./audit-cases.mjs";

const args = process.argv.slice(2);
const label = args[args.indexOf("--label") + 1] ?? "audit";
const endpoint = "http://127.0.0.1:8787/api/dev/audit";

const PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
const cost = (model, u) => {
  const p = PRICES[model];
  return p === undefined || u === undefined
    ? 0
    : (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000;
};

const results = [];
for (const c of AUDIT_CASES) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ text: c.text, fixed_question: c.fixed_question }),
  });
  if (response.status === 404) {
    console.error("採点の入口が無い。Workers を DEV_EXPERIMENT:1 で動かしているか確かめる");
    process.exit(1);
  }
  const r = await response.json();
  const auditBlock = r.ok ? !r.pass : null;
  const regexBlock = r.regex !== null;
  const row = {
    id: c.id,
    expect: c.expect,
    regex: r.regex,
    auditOk: r.ok,
    auditFailure: r.ok ? null : r.failure,
    auditBlock,
    auditCategory: r.ok ? r.category : null,
    servedBy: r.servedBy ?? null,
    ms: r.ms,
    costUsd: cost(r.servedBy, r.usage),
  };
  results.push(row);
  console.log(
    `${c.id.padEnd(4)} want:${c.expect.padEnd(5)} regex:${regexBlock ? "block" : "pass "} audit:${
      auditBlock === null ? `fail(${row.auditFailure})` : auditBlock ? `block(${row.auditCategory})` : "pass"
    } ${r.ms}ms`,
  );
}

const goods = results.filter((r) => r.expect === "pass");
const bads = results.filter((r) => r.expect === "block");
const xs = bads.filter((r) => r.id.startsWith("X"));
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const summary = {
  label,
  model: results.find((r) => r.servedBy)?.servedBy ?? null,
  calls: results.length,
  auditFailures: results.filter((r) => !r.auditOk).length,
  goodPassedByAudit: `${goods.filter((r) => r.auditBlock === false).length}/${goods.length}`,
  goodPassedByRegex: `${goods.filter((r) => r.regex === null).length}/${goods.length}`,
  badBlockedByAudit: `${bads.filter((r) => r.auditBlock === true).length}/${bads.length}`,
  badBlockedByRegex: `${bads.filter((r) => r.regex !== null).length}/${bads.length}`,
  badBlockedByEither: `${bads.filter((r) => r.regex !== null || r.auditBlock !== false).length}/${bads.length}`,
  regexMissesBlockedByAudit: `${xs.filter((r) => r.auditBlock === true).length}/${xs.length}`,
  msMedian: ms[Math.floor(ms.length / 2)] ?? null,
  msMax: ms[ms.length - 1] ?? null,
  costUsd: Number(results.reduce((s, r) => s + r.costUsd, 0).toFixed(4)),
};
console.log(JSON.stringify(summary, null, 2));
const dir = join(dirname(fileURLToPath(import.meta.url)), "results");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, `${label}.json`), JSON.stringify({ summary, results }, null, 2) + "\n");
