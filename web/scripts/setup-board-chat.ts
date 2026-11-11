// ボードの掲示板チャット（B-07、ADR-0047）の Managed Agents の Environment 1つと Agent 5つ（本部・救護所A〜D）を作る。
// オーナーが手元で1回だけ実行する。Worker の処理の中では作らない。手順は docs/board-chat-setup.md。
//
//   npm --prefix web run setup:board-chat              … 作る中身を表示するだけ（何も作らない）
//   npm --prefix web run setup:board-chat -- --apply   … 実際に作り、wrangler の vars に入れる ID を表示する
//
// API キーは、SDK が環境変数から読む（このスクリプトはキーを読まない・表示しない・ファイルに書かない）。
// 何度も --apply すると、そのたびに新しい Agent と Environment ができる（古いものは消えない）。
// Node の型を外して動かす機能で、.ts のまま実行する。この機能が既定で使える Node 22.18 以上（22系）か 23.6 以上が要る
// （web/package.json の engines。Issue #298）。ExperimentalWarning が出ることがあるが、失敗ではない。

import Anthropic from "@anthropic-ai/sdk";
import {
  BOARD_CHAT_ENVIRONMENT,
  BOARD_CHAT_ROLE_IDS,
  BOARD_CHAT_VAR_NAMES,
  boardChatAgentDefinition,
} from "../worker/boardChatAgents.ts";

const apply = process.argv.includes("--apply");

function printPlan(): void {
  console.log("作るもの（ボードの掲示板チャット、架空のデモ）");
  console.log(`- Environment: ${BOARD_CHAT_ENVIRONMENT.name}（networking: limited、allowed_hosts なし、パッケージ・MCP なし）`);
  for (const role of BOARD_CHAT_ROLE_IDS) {
    const def = boardChatAgentDefinition(role);
    console.log(`- Agent: ${def.name}（model: ${def.model.id}、effort: ${def.model.effort}、ツールなし）`);
  }
}

async function main(): Promise<void> {
  printPlan();
  if (!apply) {
    console.log("\n表示だけで、何も作っていない。作るときは --apply を付けて実行する。");
    return;
  }
  const client = new Anthropic();
  const environment = await client.beta.environments.create({
    name: BOARD_CHAT_ENVIRONMENT.name,
    description: BOARD_CHAT_ENVIRONMENT.description,
    config: {
      type: BOARD_CHAT_ENVIRONMENT.config.type,
      networking: { ...BOARD_CHAT_ENVIRONMENT.config.networking },
    },
  });
  const lines = [`${BOARD_CHAT_VAR_NAMES.environment}=${environment.id}`];
  for (const role of BOARD_CHAT_ROLE_IDS) {
    const def = boardChatAgentDefinition(role);
    // ツールは渡さない（エージェントはサンドボックスの道具も web も使わない）
    const agent = await client.beta.agents.create({
      name: def.name,
      description: def.description,
      model: { ...def.model },
      system: def.system,
      metadata: { ...def.metadata },
    });
    lines.push(`${BOARD_CHAT_VAR_NAMES.agents[role]}=${agent.id}`);
  }
  console.log("\n作った。次の値を web/wrangler.jsonc の vars に入れる（秘密ではない ID）：");
  for (const line of lines) console.log(line);
}

main().catch((error: unknown) => {
  // 失敗の種類だけを出す（キーや本文は出さない）
  const name = error instanceof Error ? error.name : "unknown";
  const status = error instanceof Anthropic.APIError ? ` status=${String(error.status)}` : "";
  console.error(`作れなかった：${name}${status}`);
  process.exitCode = 1;
});
