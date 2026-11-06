// カルテの要約の監査役（B-10、Issue #142、ADR-0053 の提案）の Managed Agents の Agent を1つ作る。
// オーナーが手元で1回だけ実行する。Worker の処理の中では作らない。手順は docs/karte-audit-setup.md。
// Environment は作らない（掲示板チャットの BOARD_CHAT_ENVIRONMENT_ID を使い回す）。
//
//   npm --prefix web run setup:karte-audit              … 作る中身を表示するだけ（何も作らない）
//   npm --prefix web run setup:karte-audit -- --apply   … 実際に作り、wrangler の vars に入れる ID を表示する
//
// API キーは、SDK が環境変数から読む（このスクリプトはキーを読まない・表示しない・ファイルに書かない）。
// 何度も --apply すると、そのたびに新しい Agent ができる（古いものは消えない）。
// 作った Agent がツールを持っていないことを、返ってきた定義で確かめる（持っていたら止める）。

import Anthropic from "@anthropic-ai/sdk";
import { KARTE_AUDIT_VAR_NAME, karteAuditAgentDefinition } from "../worker/karteAuditAgent.ts";

const apply = process.argv.includes("--apply");

async function main(): Promise<void> {
  const def = karteAuditAgentDefinition();
  console.log("作るもの（カルテの要約の監査役、架空の見本だけを見る）");
  console.log(`- Agent: ${def.name}（model: ${def.model.id}、effort: ${def.model.effort}、ツールなし）`);
  console.log("- Environment は作らない（BOARD_CHAT_ENVIRONMENT_ID を使う）");
  if (!apply) {
    console.log("\n表示だけで、何も作っていない。作るときは --apply を付けて実行する。");
    return;
  }
  const client = new Anthropic();
  // ツールは渡さない（エージェントはサンドボックスの道具も web も使わない）
  const agent = await client.beta.agents.create({
    name: def.name,
    description: def.description,
    model: { ...def.model },
    system: def.system,
    metadata: { ...def.metadata },
  });
  console.log(`\n作った。次の値を web/wrangler.jsonc の vars に入れる（秘密ではない ID）：`);
  console.log(`${KARTE_AUDIT_VAR_NAME}=${agent.id}`);
  // tools を渡さないとツールなしになるかは、公式ドキュメントに明記が無いので、返ってきた定義で確かめる
  const tools = Array.isArray(agent.tools) ? agent.tools.length : -1;
  if (tools !== 0) {
    console.error(`注意：作った Agent のツールの数が 0 ではない（${tools}）。この ID は vars に入れず、Claude Console で確かめる。`);
    process.exitCode = 1;
  } else {
    console.log("確かめた：作った Agent のツールは 0 個。");
  }
}

main().catch((error: unknown) => {
  // 失敗の種類だけを出す（キーや本文は出さない）
  const name = error instanceof Error ? error.name : "unknown";
  const status = error instanceof Anthropic.APIError ? ` status=${String(error.status)}` : "";
  console.error(`作れなかった：${name}${status}`);
  process.exitCode = 1;
});
