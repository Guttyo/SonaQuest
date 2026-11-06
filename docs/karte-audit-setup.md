# カルテの要約の監査役の準備（オーナーが1回だけ行う）

カルテの抽出型の要約（B-10、Issue #142、ADR-0052・ADR-0053 は状態「提案」）の2段目で、Anthropic の Managed Agents のエージェントが監査役を務めるための準備。準備をしないままでも、要約とコードでの確認（1段目）は動き、監査は「監査できず（設定なし）」を返す。

Claude Code はこの手順を実行しない。API キーと手元の秘密のファイルには触れない（CLAUDE.md 絶対ルール6）。**まだ実施していない**。

## 作るもの
`web/worker/karteAuditAgent.ts` の定義から、Agent を1つだけ作る。

| 種類 | 数 | 中身 |
|---|---|---|
| Agent | 1つ | `sonaquest-karte-audit`。ツールなし（`tools` を渡さない）。モデルと system prompt は下書き（`[TODO-OWNER]`） |
| Environment | 作らない | 掲示板チャットの `BOARD_CHAT_ENVIRONMENT_ID`（limited で許す宛先なし）を使い回す |

Session は、ここでは作らない。監査1回ごとに Workers が budget 付きで作り、終わったら削除する。

## 手順
1. 作る中身を表示だけして確かめる（何も作らない。API キーも要らない）。

```bash
npm --prefix web run setup:karte-audit
```

2. 手元のターミナルで、API キーを環境変数 `ANTHROPIC_API_KEY` に入れる（PowerShell の例は `docs/board-chat-setup.md`）。値をファイル・Issue・PR・チャットに書かない。

3. 実際に作る。`KARTE_AUDIT_AGENT_ID=agent_…` の1行と、作った Agent のツールの数を確かめた結果が出る。

```bash
npm --prefix web run setup:karte-audit -- --apply
```

4. 「確かめた：作った Agent のツールは 0 個。」と出たら、ID を `web/wrangler.jsonc` の `vars` の `KARTE_AUDIT_AGENT_ID` に入れる。「注意：…ツールの数が 0 ではない」と出たら、ID を入れず、Claude Console で Agent の定義を確かめる（公式ドキュメントに「`tools` を省くとツールなし」とは書かれていないため、作った後に確かめている）。
5. 手元で確かめるときは `npm --prefix web run dev:worker` を動かし、`POST /api/karte/audit` に `{"sampleId":"karte-01","planted":true}` を送る。会話にない項目（卵のアレルギー）に `not_in_conversation` などの指摘が付き、`session` が `deleted` になることを見る。Claude Console で、そのセッションが残っていないことも見る。
6. 公開する版で使うときは、`vars` を入れた変更をマージしてからデプロイする（デプロイはオーナーの承認の後。CLAUDE.md 絶対ルール7）。動くのは、`/api/turn` と同じ公開の切り替え（`PUBLIC_TURN=1`）があるときだけ。

## 作り直すとき
Agent の定義（`karteAuditAgentDefinition` が組み立てるもの：名前・説明・モデルと effort・system prompt・metadata）を変えたら、作り直して `vars` の ID を書き換え、古いものは Claude Console で片付ける。Agent は作成時の定義で固定される。`KARTE_AUDIT_SESSION_BUDGET_CENTS`（セッションの budget）と、Workers の検査（`karteAudit.ts`・`codeCheck.ts`）は作り直しが要らない。要約を作るモデルは Agent と関係なく、`vars` の `KARTE_SUMMARY_MODEL` で変えられる（無ければ `karteSummary.ts` の既定）。

## 気をつけること
- **公開環境での課金の上限は、掲示板チャットと同じく Claude API の月の支出の上限（P9）だけ**（`docs/board-chat-setup.md`）。回数制限は要約（`kartesum`）と監査（`karteaudit`）で数えるが、公開環境では P7 を当てにしない。
- 監査が時間切れ（45秒）になったときは、Workers が応答の後に中断を送り、止まるのを待ってから削除する。削除できなかったときは、Workers のログに `karte_audit: cleanup_failed` が出る（本文は出ない）。そのセッションは Claude Console で消す。
- 送るのは架空の会話の見本と要約だけ。訓練の会話は送らない。
